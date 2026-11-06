// Misiones, banco, curación, PvP y bots. Opera sobre el "world" (estado serializable completo).
import { CFG, CONTRACTS, HOUR, MIN, DAY } from './config.js';
import { deriveSeed, dayKey, weekKey, mulberry32 } from './core.js';
import { addXp, buyStat, buyGear, itemPrice, effStats, maxHp, statCost, sync, createEntity, power } from './character.js';
import { resolveCombat } from './combat.js';
import { vaultPct, towerPct } from './effects.js';
import { missionReward, isPosInt } from './economy.js';
import { missionDrop, pvpMilestone, furnishBot, visit as lairVisit, syncWorkshop, prestige, settleShowcase } from './lair.js';
import { bump } from './objectives.js';
import { track } from './telemetry.js';
import { addGlory } from './season.js';
import { weekendEvent } from './events.js';
import { sendGift, botFriendship } from './social.js';
import * as BL from './bots.js';

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
// Techo de nivel de un bot: el de su ancla + su desvío habitual + 2, nunca fuera de su rango (sin ancla, sin techo).
const botCeil = (world, b) => { const p = world.entities[b.anchor]; return p ? p.level + Math.min(levelRange(p.level), (b.offset ?? 0) + 2) : Infinity; };

// Cupos de defensas recibidas por día, separados: los ataques de bots no consumen el cupo de ataques de jugadores reales.
// Ataques que puede recibir por día: con el escudo de novato retirándose (Nv 5–7) el tope es más bajo.
export function receiveCap(d, fromBot) {
  const full = fromBot ? CFG.pvp.maxBotAttacksPerDay : CFG.pvp.maxReceivedPerDay;
  if (d.isBot) return fromBot ? full : (CFG.bots.receiveFromPlayers ?? full); // v17: cupo propio de los bots (null = el de un jugador)
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
function markAttacked(def, att, now, loot, ts = now) {
  if (def.isBot) return;
  def.revenge = [{ id: att.id, name: att.name, ts, loot, used: false }, ...(def.revenge ?? []).filter((r) => now - r.ts < revengeWindow())].slice(0, 20);
}

// Motivo por el que A no puede atacar a D (null = puede).
export function attackBlock(a, d, now, { ignoreEnergy = false, duel = false } = {}) {
  if (a.id === d.id) return 'mismo_jugador';
  if (a.faction === d.faction) return 'misma_faccion';
  if (BL.gone(d, now)) return 'fuera_de_rango'; // v17: un bot retirado ya no juega
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
// v15: memo por (ids, atributos efectivos y vida): al volver tras días afuera, la mayoría de las horas repiten el par.
const WC = new Map();
const WC_MAX = 4000; // ~100 B por clave: < 0,5 MB; al llenarse se vacía entero (las claves viejas no vuelven)
const wcKey = (a, d, A, D, n) => {
  const a1 = A.stats, d1 = D.stats; // la vida (hp = maxHp) sale de res: alcanza con los atributos efectivos
  return `${a.id}|${d.id}|${n}|${a1.fue},${a1.def},${a1.agi},${a1.res}|${d1.fue},${d1.def},${d1.agi},${d1.res}`;
};
const pairSeed = (a, d) => {
  let h = 2166136261;
  for (const ch of `${a.id}|${d.id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h;
};
const wcStore = (key, v) => { if (WC.size >= WC_MAX && !WC.has(key)) WC.clear(); WC.set(key, v); };
// Cada entrada del memo es el valor exacto (número) o una cuenta parcial { w, i }: w victorias en las primeras i
// peleas. La pelea i siempre usa la misma semilla, así que una cuenta parcial se puede retomar donde quedó.
function wcRun(A, D, h, n, st, stop) {
  for (; st.i < n; ) {
    if (resolveCombat(A, D, (h + Math.imul(st.i + 1, 0x9e3779b1)) >>> 0, CFG.combat, false).winner === 'A') st.w++;
    st.i++;
    if (stop?.(st)) return st;
  }
  return st;
}
function wcEntry(a, d, n) {
  const A = snap(a), D = snap(d, true), key = wcKey(a, d, A, D, n);
  return { A, D, key, hit: WC.get(key) };
}
export function winChance(a, d, n = CFG.matchmaking.samples) {
  const { A, D, key, hit } = wcEntry(a, d, n);
  if (typeof hit === 'number') return hit;
  const st = wcRun(A, D, pairSeed(a, d), n, hit ? { ...hit } : { w: 0, i: 0 });
  const v = st.w / n;
  wcStore(key, v);
  return v;
}
export const winChanceCacheSize = () => WC.size; // para los tests
export const winChanceCacheClear = () => WC.clear(); // para los tests
// v15.1: f(winChance(a, d)) para una f monótona (una banda, un tope): da lo mismo que calcular el valor exacto, pero deja
// de simular apenas f queda decidida. El valor final está entre w/n y (w + faltan)/n; si f da lo mismo en los dos
// extremos, por ser monótona da lo mismo en todo el medio. Lo usan el emparejamiento de los bots, la calibración, la
// recompensa del defensor y el riesgo de XP, que solo comparan o acotan la chance.
export function winChanceMap(a, d, f, n = CFG.matchmaking.samples) {
  const { A, D, key, hit } = wcEntry(a, d, n);
  if (typeof hit === 'number') return f(hit);
  const decided = (st) => f(st.w / n) === f((st.w + n - st.i) / n);
  const st0 = hit ? { ...hit } : { w: 0, i: 0 };
  const st = decided(st0) ? st0 : wcRun(A, D, pairSeed(a, d), n, st0, decided);
  wcStore(key, st.i >= n ? st.w / n : st);
  return f(st.w / n);
}
// −1 si queda por debajo de lo, 1 si queda por encima de hi, 0 si queda en la banda.
export const winChanceBand = (a, d, lo, hi, n) => winChanceMap(a, d, (wc) => (wc > hi ? 1 : wc < lo ? -1 : 0), n);

// Recompensa del defensor: solo si el atacante tenía chances reales (≥ 20%) y una vez por atacante por día.
export function defenseBounty(att, def, now) {
  const b = CFG.pvp.defenseBounty;
  if (winChanceMap(att, def, (wc) => wc < b.minAttackerChance)) return { gold: 0, reason: 'rival_debil' };
  // Antiabuso: un atacante que casi nunca gana (cuenta "sparring") no genera recompensa.
  const rec = att.recent ?? [];
  if (rec.length >= b.recentMin && rec.filter(Boolean).length / rec.length < b.minAttackerWinrate) return { gold: 0, reason: 'atacante_sin_victorias' };
  if (now != null) {
    const d = dayKey(now);
    if (def.bountyFrom?.day !== d) def.bountyFrom = { day: d, ids: {} };
    if ((def.bountyFrom.ids[att.id] ?? 0) >= b.perPairPerDay) return { gold: 0, reason: 'ya_cobrada_hoy' };
    def.bountyFrom.ids[att.id] = (def.bountyFrom.ids[att.id] ?? 0) + 1;
  }
  const r = winChanceMap(att, def, (wc) => Math.min(b.ratioMax, Math.max(b.ratioMin, 0.5 + 2 * wc))); // atacante más peligroso → más recompensa
  return { gold: Math.round(missionReward(b.missionMin, att.level).gold * r), reason: null };
}

function snap(e, defending = false) {
  const stats = effStats(e);
  const tw = defending ? towerPct(e) : 0;
  if (tw) for (const k of ['def', 'agi']) stats[k] = Math.round(stats[k] * (1 + tw));
  const hp = CFG.hp.base + stats.res * CFG.hp.perRes; // = maxHp(e): la Torre no toca res
  return { stats, hp, maxHp: hp }; // cada combate arranca con vida completa
}
export { weekendEvent } from './events.js';

// Oro robable: lo que la Bóveda no protege.
export const lootable = (e) => Math.floor(e.gold * (1 - vaultPct(e)));
const head = (e) => ({ id: e.id, name: e.name, lvl: e.level, faction: e.faction });
export const pvpXp = (rivalLevel) => missionReward(CFG.pvp.xpWinMissionMin, rivalLevel).xp;

// Presa del día: un rival de tu rango elegido por semilla (mismo para todo el día mientras siga en rango).
export function preyOf(world, e, now) {
  if (e.prey?.day === dayKey(now) && world.entities[e.prey.id]) return e.prey.id; // fijada en el día (ver fixPrey)
  const cands = Object.values(world.entities)
    .filter((o) => o.faction !== e.faction && inRange(e, o) && (o.isBot || o.level >= CFG.pvp.newbieLevel) && !BL.retireStage(o, now)) // v17: un bot que se retira ya no es presa (un Eco sí)
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
  const risk = opts.duel ? 1 : winChanceMap(att, def, (wc) => Math.min(CFG.pvp.riskXpMax, Math.max(CFG.pvp.riskXpMin, 1.6 - wc)));
  const seed = deriveSeed(world);
  const A = snap(att), D = snap(def, true);
  const res = resolveCombat(A, D, seed, CFG.combat, !opts.duel); // v15.1: los duelos entre bots no guardan informe: sin detalle

  const revenge = !opts.duel && revengeOn(att, def.id, now);
  if (revenge) revenge.used = true;
  if (!opts.duel) { att.lastAttackOn[def.id] = now; bumpReceived(def, now, att.isBot); }

  const win = res.winner === 'A' ? att : def;
  const lose = win === att ? def : att;
  syncWorkshop(att, now); syncWorkshop(def, now);

  // Atacante gana: roba 10% del oro no protegido. Defensor gana: recompensa del sistema; el atacante no pierde oro.
  let loot = 0, bounty = 0, bountyReason = null;
  let winGold = 0;
  const ev = weekendEvent(now);
  if (win === att) {
    loot = Math.floor(lootable(def) * CFG.pvp.lootPct); def.gold -= loot; att.gold += loot;
    // Bono de victoria creado por el sistema (no sale del rival): premia cazar por sobre las misiones.
    if (!opts.duel && CFG.pvp.winGoldMissionMin) { winGold = Math.round(missionReward(CFG.pvp.winGoldMissionMin, def.level).gold * risk * (ev?.winGoldMult ?? 1)); att.gold += winGold; }
  }
  else { const b = defenseBounty(att, def, now); bounty = b.gold; bountyReason = b.reason; def.gold += bounty; }
  if (!opts.duel) { att.recent = [...(att.recent ?? []), win === att].slice(-CFG.pvp.defenseBounty.recentWindow); }

  const xpWin = Math.round(pvpXp(lose.level) * (win === att ? risk : 1) * (ev?.xpWinMult ?? 1));
  const xpLose = Math.max(1, Math.round(xpWin * CFG.pvp.xpLosePct));
  // v17 (B2): un bot no pasa del techo de su ancla (nivel del jugador + rango) por la XP de peleas: antes, con el jugador
  // ausente, los duelos lo subían igual y al mes nadie quedaba en el rango de un Nv 1.
  const gain = (e, n) => (e.isBot && e.level >= botCeil(world, e) ? 0 : addXp(e, n));
  const lvlWin = gain(win, xpWin);
  const lvlLose = gain(lose, xpLose);
  win.rep += CFG.pvp.repWin;
  if (!opts.duel) addWeeklyRep(win, now, CFG.pvp.repWin);
  else if (!BL.isEco(win)) botWar(world, win.faction, now, seed); // v17 (B9): los duelos suman a la guerra (con impulso)
  win.record.w++; lose.record.l++;
  const trophy = pvpMilestone(win);
  let prey = null;
  if (!opts.duel) {
    bump(world, att, 'hunt', now);
    if (win === att) { bump(world, att, 'win', now); addGlory(att, 'win', now); }
    if (win === def) addGlory(def, 'win', now);
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
    id: `r${world.seq}`, ts: opts.ts ?? now, seed, // opts.ts: hora que se muestra (v17: los bots la reparten en la franja)
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
    markAttacked(def, att, now, win === att ? loot : 0, opts.ts ?? now);
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
  p.tm = 0; // v17: hitos de la primera hora por estrenar (src/telemetry.js)
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
  for (const b of Object.values(world.entities)) if (b.isBot && b.anchor === p.id) calibrateBot(b, p, 60);
}

// Ajusta un bot de a un punto de atributo hasta que la chance estimada del jugador quede en la banda objetivo y deja
// la escala de poder en lo calibrado (si no, en su primera hora el bot volvía a subir al poder del jugador: regresión R1
// de la revisión de la v13, sesión 2 al 34%). Devuelve dónde quedó respecto de la banda (−1, 0 o 1).
export function calibrateBot(b, p, maxSteps = 6) {
  const mm = CFG.matchmaking;
  const w = ARCHETYPES[b.arch] ?? ARCHETYPES.balanceado;
  const goal = playerTargetWr(p.level) - (b.skill ?? 0);
  const lo = goal - mm.band, hi = goal + mm.band;
  let wc = winChanceBand(p, b, lo, hi);
  for (let i = 0; i < maxSteps; i++) {
    if (wc < 0) {
      const s = CFG.stats.filter((k) => b.stats[k] > 1).sort((x, y) => b.stats[y] / w[y] - b.stats[x] / w[x])[0];
      if (!s) break;
      b.stats[s]--;
    } else if (wc > 0) {
      b.stats[CFG.stats.slice().sort((x, y) => b.stats[x] / w[x] - b.stats[y] / w[y])[0]]++;
    } else break;
    wc = winChanceBand(p, b, lo, hi);
  }
  b.hp = maxHp(b);
  const pp = power(p);
  if (pp > 0) b.scale = Math.max(mm.scaleMin, Math.min(mm.scaleMax, power(b) / pp));
  return wc;
}

/* ---------- Facción: marcador semanal (solo reputación ganada en combate esta semana) ---------- */
export { weekKey };

function addWeeklyRep(e, now, n) {
  const w = weekKey(now);
  if (e.repWeek?.week !== w) e.repWeek = { week: w, count: 0 };
  e.repWeek.count += n;
}

export function factionScore(world, now, w = weekKey(now)) {
  const s = { hero: 0, villain: 0 };
  for (const e of Object.values(world.entities)) if (e.repWeek?.week === w && !BL.isEco(e)) s[e.faction] += e.repWeek.count; // v17: sin Ecos
  if (world.war?.week === w) { s.hero += world.war.hero; s.villain += world.war.villain; } // v17 (B9): el resto de cada facción
  return s;
}

// v17 (B9): impulso de la guerra a favor de los héroes (−1..1 × swing + daily): de la semilla, la semana y el día.
export function warMomentum(world, now) {
  const F = CFG.faction.bots;
  if (!F) return 0;
  const r = (k, n) => (BL.hash32(world.seed ?? 0, k, n) / 4294967296) * 2 - 1;
  return F.swing * r('war', weekKey(now)) + F.daily * r('warday', dayKey(now));
}
// Un duelo ganado por un bot suma 1 a su facción con probabilidad share × (1 ± impulso). Va en world.war (un solo
// contador por semana: no crece el guardado). La moneda sale de la semilla del combate: determinista.
function botWar(world, faction, now, seed) {
  const F = CFG.faction.bots;
  if (!F) return;
  const pr = F.share * (1 + warMomentum(world, now) * (faction === 'hero' ? 1 : -1));
  if ((Math.imul(seed ^ 0x27d4eb2d, 0x165667b1) >>> 0) / 4294967296 >= pr) return;
  const w = weekKey(now);
  if (world.war?.week !== w) world.war = { week: w, hero: 0, villain: 0 };
  world.war[faction] += CFG.pvp.repWin;
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
    // v17: nicks de jugador únicos (antes, nombres temáticos de una lista fija por facción).
    const b = createEntity({ id: `b${i}`, name: BL.botName(world, i, faction), faction, isBot: true, now });
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
    furnishBot(b, mulberry32(BL.hash32(world.seed, b.id, 0xf0b))); // rng aparte: la decoración no cambia los atributos de los bots
    world.entities[b.id] = b;
  }
}

// Destino de una visita de bot: ponderado por prestigio (las guaridas lindas atraen más visitas).
function pickVisitTarget(world, b, rng, weights) {
  // v15: los pesos se calculan una vez por hora (antes, por cada visita de cada bot).
  // v15.1: sin armar arreglos por visita; suma y recorrido en el mismo orden → el mismo destino que antes.
  const all = weights ?? visitWeights(world);
  let sum = 0;
  for (let i = 0; i < all.ents.length; i++) if (all.ents[i].id !== b.id) sum += all.w[i];
  let r = rng() * sum, first;
  for (let i = 0; i < all.ents.length; i++) {
    const e = all.ents[i];
    if (e.id === b.id) continue;
    first ??= e;
    if ((r -= all.w[i]) < 0) return e;
  }
  return first;
}
function visitWeights(world) {
  const ents = Object.values(world.entities);
  return { ents, w: ents.map((e) => 1 + prestige(e).total / 20) };
}

// Una hora simulada de un bot: emparejamiento (siempre, invisible) y, si estuvo en línea, lo que se ve: visitas,
// ataques, duelos, regalos y solicitudes. v17: las acciones salen en ráfagas dentro de la franja que terminó, con su
// minuto (nunca antes de que exista el destinatario ni del día anterior), siguiendo el horario humano del bot.
function botHour(world, b, now, rng, bots, weights) {
  const stage = BL.retireStage(b, now);
  if (stage >= 3) return; // se fue: no juega (no es objetivo; sigue en listas de amigos como inactivo)
  sync(b, now);
  const p = world.entities[b.anchor]; // jugador al que orbita este bot
  const s = Math.floor(now / HOUR) - 1; // franja que acaba de terminar
  const on = BL.slot(world, b, s, BL.activity(b, now));
  const r = missionReward(60, b.level);
  // Matchmaking por resultado: si el jugador le gana demasiado seguido, el bot sube su objetivo de poder; si pierde mucho, lo baja.
  if (p) {
    const goal = playerTargetWr(p.level) - (b.skill ?? 0), mm = CFG.matchmaking;
    const band = winChanceBand(p, b, goal - mm.band, goal + mm.band);
    if (band > 0) b.scale = Math.min(mm.scaleMax, (b.scale ?? 1) * mm.scaleUp);
    else if (band < 0) b.scale = Math.max(mm.scaleMin, (b.scale ?? 1) * mm.scaleDown);
  }
  const target = p ? power(p) * (b.scale ?? 1) : 0;
  const behind = p && power(b) < target;
  b.gold += b.bank; b.bank = 0;
  b.gold += Math.round(r.gold * (behind ? 2 : CFG.bots.incomeEff * 0.3));
  if (p) {
    // v17: progreso humano. Las primeras horas del jugador, +1 nivel/h como antes (calibración). Después sube cuando
    // juega, con rachas (un nivel adelante o atrás cada pocos días) y pausas; si quedó muy atrás, se pone al día.
    const H = CFG.bots.human, warm = now - (p.createdAt ?? 0) < H.warmupH * HOUR;
    const day = warm ? null : BL.dayOf(world, b, s);
    const lag = Math.min(p.level + levelRange(p.level), Math.max(1, p.level + b.offset + (day?.drift ?? 0))) - b.level; // nunca fuera de rango
    if (lag > 0 && (warm || on || (!day.paused && lag >= H.catchUpLag))) addXp(b, CFG.xpNeed(b.level) - b.xp); // +1 nivel/h máx
  }
  if (behind) {
    // Mejora hasta alcanzar su objetivo de poder, sin pasarse (equipo primero, después atributos de a uno).
    const w = ARCHETYPES[b.arch];
    // Variante de cada pieza según su arquetipo (el atributo que más pesa entre las opciones del slot).
    const pickStat = (slot) => CFG.gear.slots[slot].slice().sort((x, y) => (w[y] ?? 1) - (w[x] ?? 1))[0];
    for (const t of CFG.gear.tiers) for (const slot of Object.keys(CFG.gear.slots))
      if (b.level >= t.req && itemPrice(t) <= b.gold * 0.5 && power(b) < target) buyGear(b, slot, t.tier, pickStat(slot)); // lo barato primero
    while (power(b) < target) {
      const s = CFG.stats.slice().sort((x, y) => b.stats[x] / w[x] - b.stats[y] / w[y])[0];
      if (!buyStat(b, s).ok) break;
    }
    // v14: hasta el Nv 15, después de comprar, un ajuste fino (hasta 3 puntos) para no pasarse de la banda objetivo.
    // Después del Nv 15 alcanza con la escala (los asserts de 90 días miden esa etapa).
    if (p && p.level < CFG.matchmaking.playerWr.from) calibrateBot(b, p, 3);
  }
  // Oro en mano acotado (1 h de misión): el botín robado a bots es una fuente del sistema controlada; el resto queda en el banco.
  const cap = Math.round(missionReward(CFG.bots.handGoldMissionMin, b.level).gold * (b.wealth ?? 1));
  if (b.gold > cap) { b.bank += b.gold - cap; b.gold = cap; }
  if (!on) return; // durmiendo, sin entrar hoy o en pausa: nada visible
  // Las tasas de config son por día: se reparten en las horas en línea de este bot.
  const per = 24 / Math.max(0.5, BL.onlineHours(world, b));
  // Las reglas (cupos por día, cooldowns, semana) corren a la hora en punto, como siempre; lo que se muestra (informe,
  // libro de visitas, regalo, solicitud) lleva el minuto de la ráfaga, nunca antes de que exista el destinatario.
  const at = (off, to) => Math.max(s * HOUR + off, to?.createdAt ?? 0);
  const pa = CFG.bots.attackChancePerHour / (CFG.bots.attackChancePerHour + CFG.bots.visitChancePerHour);
  // Ráfaga: cada acción visible es un ataque a su jugador o una visita (en la proporción de las tasas de config).
  for (const off of on.offs) {
    if (p && rng() < pa) pvp(world, b, p, now, { ignoreEnergy: true, ts: at(off, p) });
    else { const h = pickVisitTarget(world, b, rng, weights); lairVisit(world, b, h, now, { applaud: rng() < 0.7, ts: at(off, h), noXp: b.level >= botCeil(world, b) }); }
  }
  // Duelos entre bots (invisibles: solo reputación para el ranking), en la misma cantidad diaria que antes.
  const nd = CFG.bots.duelChancePerHour * per * BL.activity(b, now);
  for (let i = 0, n = Math.floor(nd) + (rng() < nd % 1 ? 1 : 0); i < n; i++) {
    const foes = bots.filter((o) => o.faction !== b.faction && !attackBlock(b, o, now, { ignoreEnergy: true, duel: true }));
    if (foes.length) pvp(world, b, foes[Math.floor(rng() * foes.length)], now, { ignoreEnergy: true, duel: true });
  }
  const last = on.offs[on.k - 1];
  // Bots amigos regalan de vez en cuando a su jugador (y devuelven el regalo recibido ese día, si entran ese día).
  if (p && stage < 2 && (b.friends ?? []).includes(p.id)) {
    const owes = (p.giftsSent?.day === dayKey(now) && p.giftsSent.to.includes(b.id));
    const sent = b.giftsSent?.day === dayKey(now) && b.giftsSent.to.includes(p.id);
    if (!sent && (owes || rng() < CFG.social.botGiftChancePerHour * per)) sendGift(world, b, p, now, at(last, p));
  }
  if (p) botFriendship(world, b, p, now, rng, { per, quiet: stage >= 2, ts: at(last, p) });
  if (rng() < 0.05 * per) furnishBot(b, rng);
}

// Procesa cada hora en punto del mundo (hh:00) que ya pasó, en orden y una sola vez.
// Cada hora usa su propia semilla: el resultado no depende de cada cuánto se consulte el juego.
// Si una hora cae en una semana nueva, primero se cierra el escaparate de la semana anterior.
// v15.1: maxHours permite ponerse al día de a tramos (la interfaz cede el hilo entre tramos al volver tras días
// afuera); como cada hora es independiente del corte, el mundo queda idéntico al de hacerlo de una vez.
export function tickBots(world, now, maxHours = Infinity) {
  const last = Math.floor(now / HOUR);
  if (world.botHour >= last) return 0;
  const from = Math.max(world.botHour + 1, last - CFG.bots.maxCatchUpHours + 1);
  const to = Math.min(last, from + Math.max(1, maxHours) - 1);
  const list = () => Object.values(world.entities).filter((e) => e.isBot);
  let bots = list();
  for (let h = from; h <= to; h++) {
    settleShowcase(world, h * HOUR);
    if (world.botDay !== dayKey(h * HOUR) && rebalanceBots(world, h * HOUR)?.relays) bots = list(); // v17: una vez por día, antes de jugar la hora
    const rng = mulberry32((world.seed ^ Math.imul(h, 0x85ebca6b)) >>> 0);
    const weights = visitWeights(world);
    for (const b of bots) botHour(world, b, h * HOUR, rng, bots, weights);
  }
  world.botHour = to;
  return to - from + 1;
}
// v17: reparto diario de bots. (1) Los bots cuya ancla dejó de jugar (activeDays) pasan a orbitar a un jugador activo.
// (2) Con bots.retire.enabled se retiran de a poco los que sobran en el rango de cada jugador activo según la proporción
// máxima del plan, sin bajar de los pisos: minTargets rivales y minPeers de tu facción en tu rango, y capacidad para
// recibir los huntsPerDay ataques de cada cazador (cada objetivo recibe hasta pvp.maxReceivedPerDay por día).
// (3) Si falta algún piso (se fueron jugadores) o se apagó el mecanismo, vuelven bots retirados (como quien vuelve de
// un descanso). Determinista: orden fijo por semilla y una sola vez por día (world.botDay).
export function rebalanceBots(world, now) {
  world.botDay = dayKey(now);
  const R = CFG.bots.retire;
  const bots = Object.values(world.entities).filter((e) => e.isBot);
  const humans = (world.players ?? []).map((id) => world.entities[id])
    .filter((e) => e && !e.isBot && now - (e.lastSeen ?? e.createdAt ?? 0) < R.activeDays * DAY);
  if (!humans.length) return null;
  const order = bots.slice().sort((a, b) => BL.hash32(world.seed, a.id, 77) - BL.hash32(world.seed, b.id, 77));
  // 1) Anclas: al jugador activo con menos bots entre los que el bot puede alcanzar (los bots no bajan de nivel).
  const load = new Map(humans.map((h) => [h.id, 0]));
  for (const b of bots) if (load.has(b.anchor)) load.set(b.anchor, load.get(b.anchor) + 1);
  for (const b of order) if (!load.has(b.anchor)) {
    const reach = humans.filter((h) => h.level + levelRange(h.level) >= b.level);
    const to = (reach.length ? reach : humans).slice().sort((x, y) => load.get(x.id) - load.get(y.id) || (x.id < y.id ? -1 : 1))[0];
    b.anchor = to.id; load.set(to.id, load.get(to.id) + 1);
  }
  // Quien vuelve después de irse se quedó sin bots propios: recupera de a poco (hasta perDay por día) de los más cargados.
  const fair = Math.floor(bots.length / humans.length);
  for (let moved = 0, h; moved < CFG.bots.retire.perDay && (h = humans.find((x) => load.get(x.id) < fair / 2)); moved++) {
    const b = order.find((x) => load.get(x.anchor) > fair && x.level <= h.level + levelRange(h.level));
    if (!b) break;
    load.set(b.anchor, load.get(b.anchor) - 1); b.anchor = h.id; load.set(h.id, load.get(h.id) + 1);
  }
  // 2) Conteos en el rango de cada jugador activo: humanos y bots activos, rivales (opp) y de su facción (same).
  const cap = CFG.pvp.maxReceivedPerDay, capBot = CFG.bots.receiveFromPlayers ?? cap;
  const C = humans.map((h) => {
    const c = { h, Hopp: 0, Hsame: 0, Bopp: 0, Bsame: 0 };
    for (const o of humans) if (o !== h && inRange(h, o)) c[o.faction === h.faction ? 'Hsame' : 'Hopp']++;
    for (const b of bots) if (!b.ret && inRange(h, b)) c[b.faction === h.faction ? 'Bsame' : 'Bopp']++;
    c.needOpp = Math.max(R.minTargets - c.Hopp, Math.ceil((R.huntsPerDay * (c.Hsame + 1) - cap * c.Hopp) / capBot), 0);
    c.needSame = Math.max(R.minPeers - c.Hsame, 0);
    return c;
  });
  const age = R.since == null ? 0 : (now - R.since) / DAY;
  const share = (R.plan.filter(([d]) => age >= d).at(-1) ?? R.plan[0])[1];
  const key = (c, b) => (b.faction === c.h.faction ? 'Bsame' : 'Bopp');
  const need = (c, b) => (b.faction === c.h.faction ? c.needSame : c.needOpp);
  const shareOf = (c) => (c.Bopp + c.Bsame) / (c.Bopp + c.Bsame + c.Hopp + c.Hsame + 1);
  let retired = 0, back = 0;
  if (R.enabled) for (const b of order) {
    if (retired >= R.perDay) break;
    if (b.ret) continue;
    const P = C.filter((c) => inRange(c.h, b));
    const act = bots.filter((x) => !x.ret).length;
    const excess = P.length ? P.some((c) => shareOf(c) > share) : act / (act + humans.length) > share;
    if (!excess || !P.every((c) => c[key(c, b)] - 1 >= need(c, b))) continue;
    b.ret = { at: now }; retired++;
    for (const c of P) c[key(c, b)]--;
  }
  // 3) Regresos: primero los que faltan para los pisos (el bot pasa a orbitar a ese jugador); con el mecanismo
  // apagado, de a poco todos.
  const comeBack = (b, c) => {
    delete b.ret; back++;
    if (!c) return;
    b.anchor = c.h.id;
    for (const x of C) if (inRange(x.h, b)) x[key(x, b)]++;
    if (!inRange(c.h, b)) c[key(c, b)]++; // todavía fuera de rango: sube de nivel hasta alcanzarlo
  };
  for (const c of C) for (const fac of [c.h.faction === 'hero' ? 'villain' : 'hero', c.h.faction]) {
    const k = fac === c.h.faction ? 'Bsame' : 'Bopp', n = fac === c.h.faction ? c.needSame : c.needOpp;
    while (c[k] < n && back < 2 * R.perDay) {
      const pool = order.filter((b) => b.ret && b.faction === fac);
      const b = pool.find((x) => inRange(c.h, x)) ?? pool.filter((x) => x.level <= c.h.level).sort((x, y) => y.level - x.level)[0];
      if (!b) break;
      comeBack(b, c);
    }
  }
  if (!R.enabled) for (const b of order) { if (back >= R.perDay) break; if (b.ret) comeBack(b, null); }
  // 4) v17 (B2): piso de rivales en el rango de cada jugador activo (relevos de bots que no le sirven a nadie).
  let relays = 0;
  for (const h of humans) relays += ensureTargets(world, h, now);
  return { retired, back, share, relays };
}

/* ---------- v17 (B2): piso de rivales en el rango de cada jugador ---------- */
// Rivales que el jugador h puede tener a la vista: de la otra facción, en su rango, que juegan (bots no retirados del
// todo; jugadores reales sin escudo de novato).
export function rivalsInRange(world, h, now) {
  let n = 0;
  for (const e of Object.values(world.entities))
    if (e.faction !== h.faction && inRange(h, e) && (e.isBot ? !BL.gone(e, now) : e.level >= CFG.pvp.newbieLevel)) n++;
  return n;
}
// Lazos con algún jugador real: un bot así no se puede ir sin que se note.
function tied(world, b, now) {
  for (const id of world.players ?? []) {
    const p = world.entities[id];
    if (!p) continue;
    if ((p.friends ?? []).includes(b.id) || p.lair.guestbook.some((g) => g.id === b.id) || (p.revenge ?? []).some((r) => r.id === b.id && now - r.ts < CFG.pvp.revengeH * HOUR)) return true;
    if ((p.friendReq?.in ?? []).some((r) => r.id === b.id) || (p.friendReq?.out ?? []).some((r) => r.id === b.id) || (p.giftbox ?? []).some((g) => g.from === b.id)) return true;
  }
  return false;
}
// Faltan rivales en el rango de h: devuelve cuántos y los bots que pueden dejar su lugar (fuera del rango de todo
// jugador activo y sin lazos; primero los retirados, después los más lejanos). Orden fijo por semilla.
export function targetDeficit(world, h, now) {
  const F = CFG.bots.floor;
  const miss = F.targets - rivalsInRange(world, h, now);
  if (miss <= 0) return { miss: 0, donors: [] };
  const act = (world.players ?? []).map((id) => world.entities[id])
    .filter((e) => e && (e === h || now - (e.lastSeen ?? e.createdAt ?? 0) < CFG.bots.retire.activeDays * DAY));
  const foe = h.faction === 'hero' ? 'villain' : 'hero';
  const donors = Object.values(world.entities)
    .filter((b) => b.isBot && b.faction === foe && act.every((x) => !inRange(x, b)) && !tied(world, b, now))
    .sort((a, b) => BL.gone(b, now) - BL.gone(a, now) || Math.abs(b.level - h.level) - Math.abs(a.level - h.level) || (a.id < b.id ? -1 : 1));
  return { miss, donors };
}
// Llega un jugador nuevo de tu nivel en lugar de `old` (que deja de jugar): nick y perfil horario propios (id nuevo),
// alta de hace 2–17 semanas, récord y reputación acordes a su nivel, guarida decorada con algunas firmas y atributos
// calibrados contra h como cualquier bot. Mismo lugar en el mundo: el guardado no crece.
export function relayBot(world, old, h, now) {
  const F = CFG.bots.floor;
  const i = world.botSeq = Math.max(world.botSeq ?? 0, CFG.bots.count);
  world.botSeq++;
  const r = mulberry32(BL.hash32(world.seed, 'relay', i));
  const b = createEntity({ id: `b${i}`, name: BL.botName(world, i, old.faction), faction: old.faction, isBot: true, now });
  b.createdAt = now - Math.round(r.range(F.ageDays[0], F.ageDays[1]) * DAY);
  b.arch = r.pick(Object.keys(ARCHETYPES));
  b.offset = r.int(-2, 1); // de tu nivel o un poco menos: la presa del día prefiere a los de tu nivel o menor
  b.skill = r.range(-CFG.matchmaking.skillSpread, CFG.matchmaking.skillSpread);
  b.wealth = r.range(CFG.bots.wealth[0], CFG.bots.wealth[1]);
  b.scale = 1;
  const lvl = Math.max(1, Math.min(h.level + levelRange(h.level), h.level + b.offset));
  addXp(b, cumXp(lvl));
  b.gold += Math.round(cumXp(lvl) * (CFG.missions.goldBase / CFG.missions.xpBase) * CFG.bots.incomeEff);
  spendByWeights(b, ARCHETYPES[b.arch], r.range(0.15, 0.4));
  const bankPart = Math.floor(b.gold * r.range(0, 0.5));
  if (bankPart > 0) deposit(b, bankPart);
  const fights = Math.round(lvl * r.range(F.fightsPerLvl[0], F.fightsPerLvl[1])), w = Math.round(fights * r.range(F.winPct[0], F.winPct[1]));
  b.record = { w, l: fights - w }; b.rep = w;
  furnishBot(b, mulberry32(BL.hash32(world.seed, b.id, 0xf0b)));
  // Firmas de otros que lo visitaron en los últimos días (las guaridas de bots guardan pocas).
  const others = Object.values(world.entities).filter((e) => e.isBot && e.id !== old.id && !BL.gone(e, now));
  for (let k = r.int(1, CFG.lair.visit.guestbookMaxBot); k > 0 && others.length; k--) {
    const v = r.pick(others);
    b.lair.guestbook.push({ id: v.id, name: v.name, faction: v.faction, lvl: v.level, ts: now - Math.round(r.range(0.2, 6) * DAY), applause: r() < 0.7, tip: 0 });
  }
  b.lair.guestbook.sort((x, y) => y.ts - x.ts);
  b.anchor = h.id;
  calibrateBot(b, h, 60);
  delete world.entities[old.id];
  world.entities[b.id] = b;
  for (const id of world.players ?? []) { const p = world.entities[id]; if (p?.lastAttackOn) delete p.lastAttackOn[old.id]; }
  return b;
}
// Completa el piso de rivales de h con relevos (hasta max). Devuelve cuántos llegaron.
export function ensureTargets(world, h, now, max = Infinity) {
  if (!h || h.isBot) return 0;
  const { miss, donors } = targetDeficit(world, h, now);
  let n = 0;
  for (const old of donors) { if (n >= Math.min(miss, max)) break; relayBot(world, old, h, now); n++; }
  if (n) h.fresh = (h.fresh ?? 0) + n; // para el resumen de "Mientras no estabas"
  return n;
}

// Horas de bots que faltan simular hasta `now` (con el tope de maxCatchUpHours).
export function botHoursPending(world, now) {
  const last = Math.floor(now / HOUR);
  return world.botHour >= last ? 0 : last - Math.max(world.botHour + 1, last - CFG.bots.maxCatchUpHours + 1) + 1;
}

export { power };
