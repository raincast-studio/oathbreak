// Misiones, banco, curación, PvP y bots. Opera sobre el "world" (estado serializable completo).
import { CFG, CONTRACTS, HOUR, MIN } from './config.js';
import { deriveSeed, dayKey, weekKey, mulberry32 } from './core.js';
import { addXp, buyStat, buyGear, itemPrice, effStats, maxHp, statCost, sync, createEntity, power } from './character.js';
import { resolveCombat } from './combat.js';
import { vaultPct, towerPct } from './effects.js';
import { missionReward, isPosInt } from './economy.js';
import { missionDrop, pvpMilestone, furnishBot, visit as lairVisit, syncWorkshop, prestige, settleShowcase } from './lair.js';
import { bump } from './objectives.js';
import { track } from './telemetry.js';
import { addGlory } from './season.js';
import { sendGift, botFriendship } from './social.js';

export { missionReward };

/* ---------- Misiones ---------- */
export const contractsFor = (e) => CONTRACTS[e.faction].map((c) => ({ ...c, reward: missionReward(c.min, e.level) }));

export function startMission(e, id, now) {
  if (e.mission) return { ok: false, error: 'mision_activa' };
  const c = CONTRACTS[e.faction].find((x) => x.id === id);
  if (!c) return { ok: false, error: 'contrato_invalido' };
  e.mission = { id, name: c.name, start: now, end: now + c.min * MIN, reward: missionReward(c.min, e.level) };
  return { ok: true, mission: e.mission };
}

export function cancelMission(e) {
  if (!e.mission) return { ok: false, error: 'sin_mision' };
  e.mission = null;
  return { ok: true };
}

export function claimMission(e, now, rng, world) {
  if (!e.mission) return { ok: false, error: 'sin_mision' };
  if (now < e.mission.end) return { ok: false, error: 'en_curso', msLeft: e.mission.end - now };
  const { gold, xp } = e.mission.reward;
  const minutes = (e.mission.end - e.mission.start) / MIN;
  syncWorkshop(e, now); // cierra la producción al nivel previo antes de una posible subida
  e.gold += gold;
  const levels = addXp(e, xp);
  e.mission = null;
  const drop = rng ? missionDrop(e, minutes, rng) : null;
  if (world) { bump(world, e, 'mission', now); addGlory(e, 'mission', now); track(world, e, 'mission_claim', { min: minutes, gold, xp }, now); if (levels) track(world, e, 'level_up', { level: e.level }, now); }
  return { ok: true, gold, xp, levels, level: e.level, drop };
}

/* ---------- Banco ---------- */
export function deposit(e, amount) {
  if (!isPosInt(amount)) return { ok: false, error: 'monto_invalido' };
  if (amount > e.gold) return { ok: false, error: 'oro_insuficiente' };
  const fee = Math.ceil(amount * CFG.bank.depositFee);
  e.gold -= amount;
  e.bank += amount - fee;
  return { ok: true, deposited: amount - fee, fee };
}

export function withdraw(e, amount) {
  if (!isPosInt(amount) || amount > e.bank) return { ok: false, error: 'monto_invalido' };
  e.bank -= amount;
  e.gold += amount;
  return { ok: true, withdrawn: amount };
}

/* ---------- PvP ---------- */
// Rango simétrico: se calcula con el mayor de los dos niveles.
export const levelRange = (lvl) => Math.max(CFG.pvp.rangeAbs, Math.floor(lvl * CFG.pvp.rangePct));
export const inRange = (a, b) => Math.abs(a.level - b.level) <= levelRange(Math.max(a.level, b.level));

// Cupos de defensas recibidas por día, separados: los ataques de bots no consumen el cupo de ataques de jugadores reales.
// Ataques que puede recibir por día: con el escudo de novato retirándose (Nv 5–7) el tope es más bajo.
export function receiveCap(d, fromBot) {
  const full = fromBot ? CFG.pvp.maxBotAttacksPerDay : CFG.pvp.maxReceivedPerDay;
  if (d.isBot) return full;
  const fade = CFG.pvp.shieldFade ?? [];
  const i = d.level - CFG.pvp.newbieLevel;
  return i >= 0 && i < fade.length ? Math.min(full, fade[i]) : full;
}
// Estado del escudo para la interfaz.
export function shieldInfo(e) {
  const fade = CFG.pvp.shieldFade ?? [];
  if (e.level < CFG.pvp.newbieLevel) return { mode: 'full', untilLevel: CFG.pvp.newbieLevel };
  const i = e.level - CFG.pvp.newbieLevel;
  if (i < fade.length) return { mode: 'partial', perDay: fade[i], untilLevel: CFG.pvp.newbieLevel + fade.length };
  return { mode: 'none' };
}
const receivedToday = (e, now, fromBot = false) => (e.received.day === dayKey(now) ? (fromBot ? e.received.bots ?? 0 : e.received.count) : 0);
function bumpReceived(e, now, fromBot) {
  const d = dayKey(now);
  if (e.received.day !== d) e.received = { day: d, count: 0, bots: 0 };
  if (fromBot) e.received.bots = (e.received.bots ?? 0) + 1; else e.received.count++;
}

/* ---------- Venganza ---------- */
// Quien te atacó en las últimas 24 h queda marcado: podés devolverle el ataque una vez, sin importar rango ni cooldown.
const revengeWindow = () => CFG.pvp.revengeH * HOUR;
export const revengeOn = (a, dId, now) => (a.revenge ?? []).find((r) => r.id === dId && !r.used && now - r.ts < revengeWindow());
export function revengeList(a, now) {
  const seen = new Set();
  return (a.revenge ?? []).filter((r) => !r.used && now - r.ts < revengeWindow() && !seen.has(r.id) && seen.add(r.id));
}
function markAttacked(def, att, now, loot) {
  if (def.isBot) return;
  def.revenge = [{ id: att.id, name: att.name, ts: now, loot, used: false }, ...(def.revenge ?? []).filter((r) => now - r.ts < revengeWindow())].slice(0, 20);
}

// Motivo por el que A no puede atacar a D (null = puede).
export function attackBlock(a, d, now, { ignoreEnergy = false, duel = false } = {}) {
  if (a.id === d.id) return 'mismo_jugador';
  if (a.faction === d.faction) return 'misma_faccion';
  if (!a.isBot && a.mission) return 'en_mision'; // como en BiteFight: mientras trabajás no cazás
  const rev = !duel && revengeOn(a, d.id, now);
  if (!rev && !inRange(a, d)) return 'fuera_de_rango';
  if (!rev && !d.isBot && d.level < CFG.pvp.newbieLevel) return 'novato_protegido';
  if (!ignoreEnergy && a.energy < CFG.energy.pvpCost) return 'sin_energia';
  if (duel) return null; // duelos entre bots: sin cooldown ni tope de defensas recibidas
  const last = a.lastAttackOn[d.id];
  if (!rev && last && now - last < CFG.pvp.sameTargetCooldownMin * MIN) return 'cooldown_objetivo';
  // 31/10: la venganza nunca falla por el tope diario (la interfaz promete "una vez").
  if (!rev && receivedToday(d, now, a.isBot) >= receiveCap(d, a.isBot)) return 'objetivo_protegido';
  return null;
}

// Probabilidad estimada de que `a` (atacando) le gane a `d`: N peleas con semillas fijas derivadas de los ids.
// Pura y reproducible; refleja el triángulo de builds, cosa que un "poder" lineal no puede (R² ≈ 0.3).
export function winChance(a, d, n = CFG.matchmaking.samples) {
  const A = snap(a), D = snap(d, true);
  let h = 2166136261;
  for (const ch of `${a.id}|${d.id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let w = 0;
  for (let i = 0; i < n; i++) if (resolveCombat(A, D, (h + Math.imul(i + 1, 0x9e3779b1)) >>> 0).winner === 'A') w++;
  return w / n;
}

// Recompensa del defensor: solo si el atacante tenía chances reales (≥ 20%) y una vez por atacante por día.
export function defenseBounty(att, def, now) {
  const b = CFG.pvp.defenseBounty;
  const wc = winChance(att, def);
  if (wc < b.minAttackerChance) return { gold: 0, reason: 'rival_debil' };
  // Antiabuso: un atacante que casi nunca gana (cuenta "sparring") no genera recompensa.
  const rec = att.recent ?? [];
  if (rec.length >= b.recentMin && rec.filter(Boolean).length / rec.length < b.minAttackerWinrate) return { gold: 0, reason: 'atacante_sin_victorias' };
  if (now != null) {
    const d = dayKey(now);
    if (def.bountyFrom?.day !== d) def.bountyFrom = { day: d, ids: {} };
    if ((def.bountyFrom.ids[att.id] ?? 0) >= b.perPairPerDay) return { gold: 0, reason: 'ya_cobrada_hoy' };
    def.bountyFrom.ids[att.id] = (def.bountyFrom.ids[att.id] ?? 0) + 1;
  }
  const r = Math.min(b.ratioMax, Math.max(b.ratioMin, 0.5 + 2 * wc)); // atacante más peligroso → más recompensa
  return { gold: Math.round(missionReward(b.missionMin, att.level).gold * r), reason: null };
}

function snap(e, defending = false) {
  const stats = effStats(e);
  if (defending && towerPct(e)) for (const k of ['def', 'agi']) stats[k] = Math.round(stats[k] * (1 + towerPct(e)));
  return { stats, hp: maxHp(e), maxHp: maxHp(e) }; // cada combate arranca con vida completa
}
// Evento de fin de semana activo (o null). Día de la semana en ART: 0 = domingo … 6 = sábado.
export function weekendEvent(now) {
  const ev = CFG.events?.weekend;
  if (!ev) return null;
  const wd = new Date(now + CFG.dayOffsetMs).getUTCDay();
  return ev.days.includes(wd) ? ev : null;
}

// Oro robable: lo que la Bóveda no protege.
export const lootable = (e) => Math.floor(e.gold * (1 - vaultPct(e)));
const head = (e) => ({ id: e.id, name: e.name, lvl: e.level, faction: e.faction });
export const pvpXp = (rivalLevel) => missionReward(CFG.pvp.xpWinMissionMin, rivalLevel).xp;

// Presa del día: un rival de tu rango elegido por semilla (mismo para todo el día mientras siga en rango).
export function preyOf(world, e, now) {
  if (e.prey?.day === dayKey(now) && world.entities[e.prey.id]) return e.prey.id; // fijada en el día (ver fixPrey)
  const cands = Object.values(world.entities)
    .filter((o) => o.faction !== e.faction && inRange(e, o) && (o.isBot || o.level >= CFG.pvp.newbieLevel))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!cands.length) return null;
  // 31/10: la presa es de tu nivel o menor cuando hay alguno (antes podía tocarle a un novato un rival de Nv 3–4).
  const easy = cands.filter((o) => o.level <= e.level);
  const pool = (easy.length ? easy : cands).map((o) => o.id);
  let h = (world.seed ^ Math.imul(dayKey(now), 0x9e3779b1)) >>> 0;
  for (const ch of e.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return pool[h % pool.length];
}

// Fija la presa del día la primera vez que el jugador actúa (comandos): así no cambia si sube de nivel en el día.
export function fixPrey(world, e, now) {
  if (e.isBot || e.prey?.day === dayKey(now)) return;
  const id = preyOf(world, e, now);
  if (id) e.prey = { day: dayKey(now), id };
}

// Botín estimado (redondeado) para elegir objetivo: lo que robarías si ganás.
export const lootEstimate = (e) => Math.round((lootable(e) * CFG.pvp.lootPct) / 5) * 5;

// Banda visible para elegir objetivo (sin revelar stats): según tu probabilidad estimada de ganarle.
export function powerBand(me, foe) {
  const wc = winChance(me, foe);
  return wc >= 0.7 ? 'debil' : wc >= 0.45 ? 'parejo' : wc >= 0.25 ? 'fuerte' : 'muy_fuerte';
}

export function pvp(world, att, def, now, opts = {}) {
  sync(att, now); sync(def, now);
  const block = attackBlock(att, def, now, opts);
  if (block) return { ok: false, error: block };

  if (!opts.ignoreEnergy) att.energy -= CFG.energy.pvpCost;
  // Riesgo/recompensa: ganarle a alguien difícil da más XP que pisar a un débil.
  const risk = opts.duel ? 1 : Math.min(CFG.pvp.riskXpMax, Math.max(CFG.pvp.riskXpMin, 1.6 - winChance(att, def)));
  const seed = deriveSeed(world);
  const A = snap(att), D = snap(def, true);
  const res = resolveCombat(A, D, seed);

  const revenge = !opts.duel && revengeOn(att, def.id, now);
  if (revenge) revenge.used = true;
  if (!opts.duel) { att.lastAttackOn[def.id] = now; bumpReceived(def, now, att.isBot); }

  const win = res.winner === 'A' ? att : def;
  const lose = win === att ? def : att;
  syncWorkshop(att, now); syncWorkshop(def, now);

  // Atacante gana: roba 10% del oro no protegido. Defensor gana: recompensa del sistema; el atacante no pierde oro.
  let loot = 0, bounty = 0, bountyReason = null;
  let winGold = 0;
  if (win === att) {
    loot = Math.floor(lootable(def) * CFG.pvp.lootPct); def.gold -= loot; att.gold += loot;
    // Bono de victoria creado por el sistema (no sale del rival): premia cazar por sobre las misiones.
    if (!opts.duel && CFG.pvp.winGoldMissionMin) { winGold = Math.round(missionReward(CFG.pvp.winGoldMissionMin, def.level).gold * risk); att.gold += winGold; }
  }
  else { const b = defenseBounty(att, def, now); bounty = b.gold; bountyReason = b.reason; def.gold += bounty; }
  if (!opts.duel) { att.recent = [...(att.recent ?? []), win === att].slice(-CFG.pvp.defenseBounty.recentWindow); }

  const ev = weekendEvent(now);
  const xpWin = Math.round(pvpXp(lose.level) * (win === att ? risk : 1) * (ev ? ev.xpWinMult : 1));
  const xpLose = Math.max(1, Math.round(xpWin * CFG.pvp.xpLosePct));
  const lvlWin = addXp(win, xpWin);
  const lvlLose = addXp(lose, xpLose);
  win.rep += CFG.pvp.repWin;
  if (!opts.duel) addWeeklyRep(win, now, CFG.pvp.repWin); // los duelos entre bots no deciden la guerra de facciones
  win.record.w++; lose.record.l++;
  const trophy = pvpMilestone(win);
  let prey = null;
  if (!opts.duel) {
    bump(world, att, 'hunt', now);
    if (win === att) { bump(world, att, 'win', now); addGlory(att, 'win', now, ev ? ev.gloryWinMult : 1); }
    if (win === def) addGlory(def, 'win', now, ev ? ev.gloryWinMult : 1);
    // Presa del día: doble XP y bono de oro la primera vez que la derrotás.
    if (win === att && !att.isBot && att.preyDone !== dayKey(now) && preyOf(world, att, now) === def.id) {
      att.preyDone = dayKey(now);
      const extraXp = Math.round(xpWin * (CFG.prey.xpMult - 1)), gold = missionReward(CFG.prey.goldMissionMin, att.level).gold;
      att.gold += gold; addXp(att, extraXp);
      bump(world, att, 'prey', now); addGlory(att, 'prey', now);
      prey = { xp: extraXp, gold };
    }
  }

  const pct = (dealt, max) => Math.round((100 * dealt) / max);
  const report = {
    id: `r${world.seq}`, ts: now, seed,
    attacker: { ...head(att), hpStart: A.maxHp, hpEnd: Math.round(res.hpEndA), maxHp: A.maxHp, stats: A.stats },
    defender: { ...head(def), hpStart: D.maxHp, hpEnd: Math.round(res.hpEndD), maxHp: D.maxHp, stats: D.stats },
    winner: res.winner === 'A' ? 'attacker' : 'defender',
    reason: res.reason,
    dealt: { attacker: res.dealtA, defender: res.dealtD },
    dealtPct: { attacker: pct(res.dealtA, D.maxHp), defender: pct(res.dealtD, A.maxHp) },
    loot: { gold: loot, bounty, bountyReason, win: winGold },
    xp: win === att ? { attacker: xpWin, defender: xpLose } : { attacker: xpLose, defender: xpWin },
    rep: { winner: CFG.pvp.repWin },
    levelUp: win === att ? { attacker: lvlWin, defender: lvlLose } : { attacker: lvlLose, defender: lvlWin },
    rounds: res.rounds,
    trophy: trophy && { to: win === att ? 'attacker' : 'defender', name: trophy },
    prey,
    revenge: !!revenge,
  };
  if (!opts.duel) {
    markAttacked(def, att, now, win === att ? loot : 0);
    fileReport(att, report, 'attacker'); fileReport(def, report, 'defender');
    track(world, att, 'pvp', { role: 'attacker', won: win === att, loot, bounty, foe: def.isBot ? 'bot' : 'player' }, now);
    if (!def.isBot) track(world, def, 'pvp', { role: 'defender', won: win === def, loot, bounty, foe: att.isBot ? 'bot' : 'player' }, now);
    if (lvlWin) track(world, win, 'level_up', { level: win.level }, now);
  }
  return { ok: true, report };
}

// Bandeja por jugador (los bots no tienen). Se inserta ordenada por fecha: los eventos de bots pueden llegar con fecha previa.
function fileReport(e, report, role) {
  if (e.isBot) return;
  e.inbox ??= [];
  const item = { report, role, read: role === 'attacker' };
  const i = e.inbox.findIndex((x) => x.report.ts < report.ts);
  if (i < 0) e.inbox.push(item); else e.inbox.splice(i, 0, item);
  if (e.inbox.length > CFG.reports.max) e.inbox.length = CFG.reports.max;
  trimInbox(e);
}
// Los informes viejos pierden el detalle por rondas (el resultado, el botín y la XP se conservan).
function trimInbox(e) {
  for (let i = CFG.reports.detailed; i < (e.inbox?.length ?? 0); i++) if (e.inbox[i].report.rounds) e.inbox[i].report.rounds = null;
}

// 31/10: achica guardados viejos al cargar (informes, firmas de bots, potenciadores vencidos).
export function compactWorld(world, now) {
  const gbBot = CFG.lair.visit.guestbookMaxBot;
  for (const e of Object.values(world.entities)) {
    if (e.inbox) { if (e.inbox.length > CFG.reports.max) e.inbox.length = CFG.reports.max; trimInbox(e); }
    if (e.isBot && e.lair.guestbook.length > gbBot) e.lair.guestbook.length = gbBot;
    e.lair.boosts = e.lair.boosts.filter((end) => end > now);
  }
  if (world.events?.length > CFG.telemetry.max) world.events.splice(0, world.events.length - CFG.telemetry.max);
}

/* ---------- Jugadores (N por mundo) ---------- */
export function addPlayer(world, { id, name, faction, now }) {
  const p = createEntity({ id, name, faction, now });
  p.inbox = [];
  world.entities[id] = p;
  world.players = [...(world.players ?? []), id];
  // Reparte los bots entre los jugadores: cada bot "orbita" a su ancla.
  Object.values(world.entities).filter((e) => e.isBot).forEach((b, i) => { b.anchor = world.players[i % world.players.length]; });
  calibrateBots(world, p);
  return p;
}

// 31/10: emparejamiento desde el minuto 0. Al crear un jugador, cada bot que lo orbita ajusta sus atributos
// (bajando o subiendo de a un punto) hasta quedar en la banda de winrate objetivo. Antes, los bots de nivel 1
// eran 5/5/5/5 como el jugador y la primera pelea se ganaba el 37% de las veces.
export function calibrateBots(world, p) {
  const mm = CFG.matchmaking;
  for (const b of Object.values(world.entities)) {
    if (!b.isBot || b.anchor !== p.id) continue;
    const w = ARCHETYPES[b.arch] ?? ARCHETYPES.balanceado;
    const goal = playerTargetWr(p.level) - (b.skill ?? 0);
    for (let i = 0; i < 60; i++) {
      const wc = winChance(p, b);
      if (wc < goal - mm.band) {
        const s = CFG.stats.filter((k) => b.stats[k] > 1).sort((x, y) => b.stats[y] / w[y] - b.stats[x] / w[x])[0];
        if (!s) break;
        b.stats[s]--;
      } else if (wc > goal + mm.band) {
        b.stats[CFG.stats.slice().sort((x, y) => b.stats[x] / w[x] - b.stats[y] / w[y])[0]]++;
      } else break;
    }
    b.hp = maxHp(b);
  }
}

/* ---------- Facción: marcador semanal (solo reputación ganada en combate esta semana) ---------- */
export { weekKey };

function addWeeklyRep(e, now, n) {
  const w = weekKey(now);
  if (e.repWeek?.week !== w) e.repWeek = { week: w, count: 0 };
  e.repWeek.count += n;
}

export function factionScore(world, now) {
  const w = weekKey(now), s = { hero: 0, villain: 0 };
  for (const e of Object.values(world.entities)) if (e.repWeek?.week === w) s[e.faction] += e.repWeek.count;
  return s;
}

/* ---------- Bots ---------- */
// Arquetipos de bots = las builds razonables del triángulo, para que el jugador enfrente un campo variado.
const ARCHETYPES = {
  balanceado: { fue: 1, def: 1, agi: 1, res: 1 },
  bruto: { fue: 2, def: 1, agi: 1, res: 1.5 },
  coloso: { fue: 1, def: 1, agi: 1, res: 2 },
  guardian: { fue: 1, def: 2, agi: 1, res: 1 },
  sombra: { fue: 1, def: 1, agi: 2, res: 1 },
  duelista: { fue: 1.5, def: 0.6, agi: 1.5, res: 0.8 },
  centinela: { fue: 0.8, def: 1.5, agi: 1.5, res: 0.8 },
};
const HERO_NAMES = ['Aurora', 'Bastión', 'Centella', 'Égida', 'Faro', 'Halcón', 'Justa', 'Lumen', 'Paladín', 'Sol', 'Titán', 'Valor', 'Vigía', 'Zafiro', 'Brisa', 'Cometa', 'Escudo', 'Fénix', 'Nova', 'Roble'];
const VILL_NAMES = ['Abismo', 'Cuervo', 'Dread', 'Espina', 'Grieta', 'Hollín', 'Kraken', 'Mantis', 'Niebla', 'Óxido', 'Plaga', 'Ruina', 'Sombra', 'Tizón', 'Umbra', 'Veneno', 'Vórtice', 'Yugo', 'Zarpa', 'Ceniza'];

// Gasta oro en stats según pesos, dejando una reserva en mano.
export function spendByWeights(e, weights, keepPct = 0.3) {
  const floor = e.gold * keepPct;
  for (;;) {
    const s = CFG.stats.slice().sort((a, b) => e.stats[a] / weights[a] - e.stats[b] / weights[b])[0];
    if (e.gold - statCost(e, s) < floor) break;
    buyStat(e, s);
  }
}

const cumXp = (lvl) => { let t = 0; for (let l = 1; l < lvl; l++) t += CFG.xpNeed(l); return t; };

// Winrate objetivo del jugador contra los bots: generoso al principio y más difícil después del nivel 15.
export function playerTargetWr(level) {
  const m = CFG.matchmaking.playerWr;
  const early = (m.early ?? []).find(([lvl]) => level <= lvl); // 31/10: la primera hora se gana (Nv 1–2: 80%, Nv 3–4: 72%)
  if (early) return early[1];
  return Math.max(m.min, m.base - m.perLvl * Math.max(0, level - m.from));
}

export function createBots(world, now) {
  const rng = mulberry32(world.seed ^ 0xb075);
  for (let i = 0; i < CFG.bots.count; i++) {
    const faction = i % 2 ? 'villain' : 'hero';
    const names = faction === 'hero' ? HERO_NAMES : VILL_NAMES;
    const b = createEntity({ id: `b${i}`, name: names[(i >> 1) % names.length], faction, isBot: true, now });
    b.arch = rng.pick(Object.keys(ARCHETYPES));
    // Bots "espejo": orbitan el nivel y el poder del jugador para que siempre haya rivales justos.
    b.offset = rng.int(-3, 3);
    b.skill = rng.range(-CFG.matchmaking.skillSpread, CFG.matchmaking.skillSpread); // variedad: unos bots más fáciles, otros más duros
    b.wealth = rng.range(CFG.bots.wealth[0], CFG.bots.wealth[1]); // algunos andan con más oro encima: vale la pena elegirlos
    b.scale = 1;
    const lvl = Math.max(1, 1 + b.offset);
    addXp(b, cumXp(lvl));
    b.gold += Math.round(cumXp(lvl) * (CFG.missions.goldBase / CFG.missions.xpBase) * CFG.bots.incomeEff);
    spendByWeights(b, ARCHETYPES[b.arch], rng.range(0.15, 0.4));
    const bankPart = Math.floor(b.gold * rng.range(0, 0.5));
    if (bankPart > 0) deposit(b, bankPart);
    b.hp = maxHp(b);
    furnishBot(b, rng);
    world.entities[b.id] = b;
  }
}

// Destino de una visita de bot: ponderado por prestigio (las guaridas lindas atraen más visitas).
function pickVisitTarget(world, b, rng) {
  const pool = Object.values(world.entities).filter((e) => e.id !== b.id);
  const w = pool.map((e) => 1 + prestige(e).total / 20);
  let r = rng() * w.reduce((a, x) => a + x, 0);
  return pool[w.findIndex((x) => (r -= x) < 0)] ?? pool[0];
}

// Una hora simulada de un bot: ingresos, gasto, duelos entre bots, ataques y visitas.
function botHour(world, b, now, rng, bots) {
  sync(b, now);
  const p = world.entities[b.anchor]; // jugador al que orbita este bot
  const r = missionReward(60, b.level);
  // Matchmaking por resultado: si el jugador le gana demasiado seguido, el bot sube su objetivo de poder; si pierde mucho, lo baja.
  if (p) {
    const wc = winChance(p, b), goal = playerTargetWr(p.level) - (b.skill ?? 0), mm = CFG.matchmaking;
    if (wc > goal + mm.band) b.scale = Math.min(mm.scaleMax, (b.scale ?? 1) * mm.scaleUp);
    else if (wc < goal - mm.band) b.scale = Math.max(mm.scaleMin, (b.scale ?? 1) * mm.scaleDown);
  }
  const target = p ? power(p) * (b.scale ?? 1) : 0;
  const behind = p && power(b) < target;
  b.gold += b.bank; b.bank = 0;
  b.gold += Math.round(r.gold * (behind ? 2 : CFG.bots.incomeEff * 0.3));
  if (p && b.level < Math.max(1, p.level + b.offset)) addXp(b, CFG.xpNeed(b.level) - b.xp); // +1 nivel/h máx
  if (behind) {
    // Mejora hasta alcanzar su objetivo de poder, sin pasarse (equipo primero, después atributos de a uno).
    const w = ARCHETYPES[b.arch];
    // Variante de cada pieza según su arquetipo (el atributo que más pesa entre las opciones del slot).
    const pickStat = (slot) => CFG.gear.slots[slot].slice().sort((x, y) => (w[y] ?? 1) - (w[x] ?? 1))[0];
    for (const t of CFG.gear.tiers) for (const slot of Object.keys(CFG.gear.slots))
      if (power(b) < target && b.level >= t.req && itemPrice(t) <= b.gold * 0.5) buyGear(b, slot, t.tier, pickStat(slot));
    while (power(b) < target) {
      const s = CFG.stats.slice().sort((x, y) => b.stats[x] / w[x] - b.stats[y] / w[y])[0];
      if (!buyStat(b, s).ok) break;
    }
  }
  // Oro en mano acotado (1 h de misión): el botín robado a bots es una fuente del sistema controlada; el resto queda en el banco.
  const cap = Math.round(missionReward(CFG.bots.handGoldMissionMin, b.level).gold * (b.wealth ?? 1));
  if (b.gold > cap) { b.bank += b.gold - cap; b.gold = cap; }
  // Duelo entre bots: reputación real para el marcador de facción.
  if (rng() < CFG.bots.duelChancePerHour) {
    const foes = bots.filter((o) => o.faction !== b.faction && !attackBlock(b, o, now, { ignoreEnergy: true, duel: true }));
    if (foes.length) pvp(world, b, foes[Math.floor(rng() * foes.length)], now, { ignoreEnergy: true, duel: true });
  }
  if (p && rng() < CFG.bots.attackChancePerHour) pvp(world, b, p, now, { ignoreEnergy: true });
  // Bots amigos regalan de vez en cuando a su jugador (y siempre devuelven un regalo recibido ese día).
  if (p && (b.friends ?? []).includes(p.id)) {
    const owes = (p.giftsSent?.day === dayKey(now) && p.giftsSent.to.includes(b.id));
    const sent = b.giftsSent?.day === dayKey(now) && b.giftsSent.to.includes(p.id);
    if (!sent && (owes || rng() < CFG.social.botGiftChancePerHour)) sendGift(world, b, p, now);
  }
  if (p) botFriendship(world, b, p, now, rng);
  if (rng() < CFG.bots.visitChancePerHour) lairVisit(world, b, pickVisitTarget(world, b, rng), now, { applaud: rng() < 0.7 });
  if (rng() < 0.05) furnishBot(b, rng);
}

// Procesa cada hora en punto del mundo (hh:00) que ya pasó, en orden y una sola vez.
// Cada hora usa su propia semilla: el resultado no depende de cada cuánto se consulte el juego.
// Si una hora cae en una semana nueva, primero se cierra el escaparate de la semana anterior.
export function tickBots(world, now) {
  const last = Math.floor(now / HOUR);
  if (world.botHour >= last) return 0;
  const from = Math.max(world.botHour + 1, last - CFG.bots.maxCatchUpHours + 1);
  const bots = Object.values(world.entities).filter((e) => e.isBot);
  for (let h = from; h <= last; h++) {
    settleShowcase(world, h * HOUR);
    const rng = mulberry32((world.seed ^ Math.imul(h, 0x85ebca6b)) >>> 0);
    for (const b of bots) botHour(world, b, h * HOUR, rng, bots);
  }
  world.botHour = last;
  return last - from + 1;
}

export { power };
