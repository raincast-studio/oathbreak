// Modelo de simulación reutilizable (lo usan sim.js para reportes y test/balance.test.js para asserts).
import { CFG } from '../src/config.js';
import { createClock, memoryStorage, mulberry32 } from '../src/core.js';
import * as C from '../src/character.js';
import { resolveCombat } from '../src/combat.js';
import { spendByWeights } from '../src/systems.js'; // solo para armar builds de la matriz de combate
import { createGame } from '../src/game.js';

export const BUILDS = {
  balanceado: { fue: 1, def: 1, agi: 1, res: 1 },
  pura_fue: { fue: 100, def: 0.01, agi: 0.01, res: 0.01 },
  pura_def: { fue: 0.01, def: 100, agi: 0.01, res: 0.01 },
  pura_agi: { fue: 0.01, def: 0.01, agi: 100, res: 0.01 },
  pura_res: { fue: 0.01, def: 0.01, agi: 0.01, res: 100 },
  sesgo_fue: { fue: 2, def: 1, agi: 1, res: 1 },
  sesgo_def: { fue: 1, def: 2, agi: 1, res: 1 },
  sesgo_agi: { fue: 1, def: 1, agi: 2, res: 1 },
  sesgo_res: { fue: 1, def: 1, agi: 1, res: 2 },
  fue_res: { fue: 2, def: 1, agi: 1, res: 1.5 },
  fue_agi: { fue: 1.5, def: 0.6, agi: 1.5, res: 0.8 },
  agi_def: { fue: 0.8, def: 1.5, agi: 1.5, res: 0.8 },
};
// Builds "razonables" (sin extremos): ninguna debe dominar y todas deben ser jugables.
export const REASONABLE = ['balanceado', 'sesgo_fue', 'sesgo_def', 'sesgo_agi', 'sesgo_res', 'fue_res', 'fue_agi', 'agi_def'];

function build(weights, gold) {
  const e = C.createEntity({ id: 'x', name: 'x', faction: 'hero', now: 0 });
  e.gold = gold;
  spendByWeights(e, weights, 0);
  return { stats: C.effStats(e), hp: C.maxHp(e), maxHp: C.maxHp(e) };
}

// Winrate de cada build contra el resto a igual inversión de oro (mitad atacando, mitad defendiendo).
export function matrix(gold, n = 600) {
  const names = Object.keys(BUILDS);
  const snaps = Object.fromEntries(names.map((k) => [k, build(BUILDS[k], gold)]));
  const rng = mulberry32(gold);
  const seed = () => (rng() * 2 ** 32) >>> 0;
  const rows = {};
  for (const a of names) {
    let w = 0, tot = 0, ko = 0;
    for (const b of names) {
      if (a === b) continue;
      for (let i = 0; i < n; i++) {
        const asAtk = i % 2 === 0;
        const r = asAtk ? resolveCombat(snaps[a], snaps[b], seed()) : resolveCombat(snaps[b], snaps[a], seed());
        if ((r.winner === 'A') === asAtk) w++;
        if (r.reason === 'KO') ko++;
        tot++;
      }
    }
    rows[a] = { wr: w / tot, ko: ko / tot, s: snaps[a].stats, hp: snaps[a].maxHp };
  }
  let aw = 0;
  for (let i = 0; i < n * 4; i++) if (resolveCombat(snaps.balanceado, snaps.balanceado, seed()).winner === 'A') aw++;
  // Cara a cara entre builds razonables (mitad atacando, mitad defendiendo).
  const h2h = {};
  for (const a of REASONABLE) for (const b of REASONABLE) {
    if (a >= b) continue;
    let w = 0;
    for (let i = 0; i < n; i++) {
      const asAtk = i % 2 === 0;
      const r = asAtk ? resolveCombat(snaps[a], snaps[b], seed()) : resolveCombat(snaps[b], snaps[a], seed());
      if ((r.winner === 'A') === asAtk) w++;
    }
    h2h[`${a}>${b}`] = w / n; h2h[`${b}>${a}`] = 1 - w / n;
  }
  const fieldAvg = Object.fromEntries(REASONABLE.map((a) => [a, REASONABLE.filter((b) => b !== a).reduce((s, b) => s + h2h[`${a}>${b}`], 0) / (REASONABLE.length - 1)]));
  const dominant = REASONABLE.filter((a) => REASONABLE.every((b) => b === a || h2h[`${a}>${b}`] > 0.5));
  return { rows, mirrorAtk: aw / (n * 4), h2h, fieldAvg, dominant };
}

export const PROFILES = {
  activo: { sessions: [8, 13, 18, 23], visitsPerDay: 10, weights: BUILDS.balanceado },
  casual: { sessions: [9, 21], visitsPerDay: 6, weights: BUILDS.balanceado, skipDays: [2, 5] }, // no juega martes ni viernes
  sesgado: { sessions: [8, 13, 18, 23], visitsPerDay: 10, weights: { fue: 1.4, def: 0.8, agi: 1.1, res: 0.9 } },
  fue_res: { sessions: [8, 13, 18, 23], visitsPerDay: 10, weights: BUILDS.fue_res },
  agi_def: { sessions: [8, 13, 18, 23], visitsPerDay: 10, weights: BUILDS.agi_def },
  elector: { sessions: [8, 13, 18, 23], visitsPerDay: 10, weights: BUILDS.balanceado, picky: true },     // elige presa y botín
  decorador: { sessions: [9, 14, 21], visitsPerDay: 20, weights: BUILDS.balanceado, decor: 0.3 },       // gasta 30% en decoración
};

// Simula un jugador usando SOLO la fachada pública. Devuelve un registro por día.
// opts.setup(g, clock): antes de empezar (p. ej. sumar jugadores reales) · opts.session(g, now, i) y opts.after(g, now, i): al empezar y al terminar cada
// sesión del jugador simulado · opts.onDay(g, day): al cerrar cada día.
export function runProfile(prof, days = 30, seed = 1234, opts = {}) {
  const D0 = opts.startDay ?? 0; // v17: días después del lunes 19/10 (p. ej. 14 = entrar a mitad de temporada)
  const clock = createClock(() => Date.UTC(2026, 9, 19 + D0, 3)); // lunes 00:00 ART
  const g = createGame({ storage: memoryStorage(), clock, seed, autosave: false });
  g.newCharacter('Sim', 'hero');
  opts.setup?.(g, clock);
  const acc = {
    missionGold: 0, missionXp: 0, lootIn: 0, lootHuman: 0, winGold: 0, lootOut: 0, bounty: 0, preyGold: 0, pvpXp: 0, attacks: 0, wins: 0, defended: 0, defWins: 0,
    workshop: 0, visitGold: 0, dailyGold: 0, dailyXp: 0, visitXp: 0, seasonGold: 0, buildSpend: 0, decorSpend: 0, statSpend: 0, gearSpend: 0, visits: 0,
    gifts: 0, giftsIn: 0, seasonTiers: 0, endEnergy: 0, endTargets: 0, sessions: 0, daysPlayed: 0, preys: 0,
  };
  const daily = [];
  const seen = new Set();
  const log = [];
  const ses = prof.sessions;
  const gold = () => g.state().player.gold;

  for (let d = 0; d < days; d++) {
    const today = { attacks: 0, wins: 0 };
    const weekday = (d % 7) + 1; // 1 = lunes
    const plays = !(prof.skipDays ?? []).includes(weekday);
    if (plays) acc.daysPlayed++;
    for (let i = 0; plays && i < ses.length; i++) {
      g.debug.advance(Date.UTC(2026, 9, 19 + D0 + d, ses[i] + 3) - clock.now());
      acc.sessions++;
      opts.session?.(g, clock.now(), i);
      if (g.state().player.mission?.done) { const c = g.claimMission(); acc.missionGold += c.gold; acc.missionXp += c.xp; }
      { const wk = g.claimWorkshop(); if (wk.ok) acc.workshop += wk.gold; }
      // Social: hacerse amigo de quienes lo visitan, regalar, abrir regalos y visitar.
      const fr = g.friends();
      for (const gb of g.lair().guestbook.slice(0, 5)) if (fr.list.length < 15 && !fr.list.some((f) => f.id === gb.id)) g.addFriend(gb.id);
      for (const f of g.friends().list) if (!f.giftedToday) { const r = g.sendGift(f.id); if (r.ok) acc.gifts++; }
      { const o = g.openGifts(); if (o.ok) acc.giftsIn += o.opened; }
      const perSes = Math.ceil(prof.visitsPerDay / ses.length);
      for (const t of g.visitSuggestions().list.filter((x) => !x.visitedToday).slice(0, perSes)) {
        const r = g.visit(t.id); if (r.ok) { acc.visitGold += r.gold; acc.visitXp += r.xp; acc.visits++; }
      }
      // Caza: al azar, o eligiendo presa y mejor botín entre rivales débiles/parejos.
      for (;;) {
        let r;
        if (prof.picky) {
          const ev = (x) => ({ debil: 0.8, parejo: 0.55, fuerte: 0.35, muy_fuerte: 0.15 })[x.band] * (x.loot + 15); // valor esperado aproximado
          const t = g.targets().list.filter((x) => !x.block).sort((a, b) => b.prey - a.prey || ev(b) - ev(a))[0];
          r = t ? g.attack(t.id) : g.hunt();
        } else r = g.hunt();
        if (!r.ok) { if (r.error === 'sin_energia') acc.endEnergy++; else acc.endTargets++; break; }
        const rep = r.report, won = rep.winner === 'attacker';
        acc.attacks++; today.attacks++;
        if (won) { acc.wins++; today.wins++; acc.lootIn += rep.loot.gold; acc.winGold += rep.loot.win ?? 0; if (!g.debug.world().entities[rep.defender.id]?.isBot) acc.lootHuman += rep.loot.gold; }
        if (rep.prey) { acc.preyGold += rep.prey.gold; acc.preys++; acc.pvpXp += rep.prey.xp; }
        acc.pvpXp += rep.xp.attacker;
      }
      for (const it of g.inbox().list) {
        if (it.role !== 'defender' || seen.has(it.report.id)) continue;
        seen.add(it.report.id);
        acc.defended++;
        if (it.report.winner === 'defender') { acc.defWins++; acc.bounty += it.report.loot.bounty; } else acc.lootOut += it.report.loot.gold;
        acc.pvpXp += it.report.xp.defender;
      }
      // Gastos (antes de los objetivos, para que "Mejorá 2 atributos" avance): equipo, edificios, decoración, atributos.
      const lvl = g.state().player.level;
      for (const it of g.shop().items.filter((x) => !x.owned && x.req <= lvl).sort((a, b) => a.price - b.price))
        if (it.price <= gold()) { const r = g.buyGear(it.slot, it.tier); if (r.ok) acc.gearSpend += r.price; }
      for (const k of ['taller', 'enfermeria', 'boveda', 'generador', 'torre']) {
        const b = g.lair().buildings.find((x) => x.key === k);
        if (b.next && b.next.req <= lvl && b.next.price <= gold() * 0.6) { const r = g.upgradeBuilding(k); if (r.ok) acc.buildSpend += r.price; }
      }
      if (prof.decor) {
        const budget = gold() * prof.decor;
        for (const it of g.lairShop().list.filter((x) => x.price <= budget).sort((a, b) => b.prestige / b.price - a.prestige / a.price).slice(0, 2)) {
          const r = g.buyItem(it.id); if (r.ok) { acc.decorSpend += r.price; g.autoPlace(r.uid); }
        }
        const rs = g.renownShop();
        for (const it of rs.list.sort((a, b) => a.renown - b.renown)) if (it.renown <= g.renownShop().renown) { const r = g.buyRenownItem(it.id); if (r.ok) g.autoPlace(r.uid); }
        if (g.state().player.gold >= (g.lair().nextRoom?.price ?? Infinity) * 2) g.buyRoom();
        for (const inv of g.lair().inventory.slice(0, 3)) { const r = g.autoPlace(inv.uid); if (!r.ok && r.error === 'sin_espacio') break; }
      }
      // Ahorra para la próxima pieza de equipo disponible; el resto va a atributos.
      const nextGear = g.shop().items.filter((x) => !x.owned && x.req <= g.state().player.level).sort((a, b) => a.price - b.price)[0];
      { const r = g.autoSpend(prof.weights, nextGear ? Math.min(gold(), nextGear.price) : 0); if (r.ok) acc.statSpend += r.gold; }
      for (const o of g.daily().list) if (o.done && !o.claimed) { const c = g.claimDaily(o.id); if (c.ok) { acc.dailyGold += c.gold; acc.dailyXp += c.xp; } }
      { const c = g.claimDaily('bonus'); if (c.ok) acc.dailyGold += c.gold; }
      for (const t of g.season().list) if (t.unlocked && !t.claimed) { const c = g.claimSeasonTier(t.tier); if (c.ok) { acc.seasonTiers++; if (c.reward.type === 'gold') acc.seasonGold += c.reward.amount; } }
      const gap = ((ses[(i + 1) % ses.length] - ses[i] + 24) % 24) || 24;
      const c = g.contracts().list.filter((x) => x.min <= gap * 60).sort((a, b) => b.min - a.min)[0];
      if (c && !g.state().player.mission) g.startMission(c.id);
      opts.after?.(g, clock.now(), i);
    }
    if (!plays) g.debug.advance(Date.UTC(2026, 9, 20 + D0 + d, 3) - clock.now() - 1);
    daily.push(today);
    opts.onDay?.(g, d + 1);
    const s = g.state().player;
    const lair = g.lair();
    const last7 = daily.slice(-7);
    const sc = g.showcase(undefined, undefined).list;
    log.push({
      day: d + 1, lvl: s.level, gold: s.gold + s.bank, stats: Object.values(s.stats).reduce((a, b) => a + b, 0),
      wr7: last7.reduce((a, x) => a + x.wins, 0) / Math.max(1, last7.reduce((a, x) => a + x.attacks, 0)),
      bld: lair.buildings.map((b) => b.level).join(''), streak: lair.visits.streak, renown: s.renown, prestige: lair.prestige.total,
      showcaseRank: sc.findIndex((x) => x.id === 'p0') + 1, gear: Object.values(s.gear).reduce((a, b) => a + b, 0),
      seasonReached: g.season().reached,
      ...acc,
    });
  }
  return log;
}

// Métricas derivadas para asserts y reportes.
// "Oro de bots" = botín robado a bots + recompensas de defensa + presas: es oro CREADO por el sistema (en E6, con
// jugadores reales, el robo entre jugadores pasa a ser una transferencia de suma cero).
export function summarize(log) {
  const L = log[log.length - 1];
  const xpTotal = L.missionXp + L.pvpXp + L.dailyXp + L.visitXp;
  const botGold = L.lootIn - (L.lootHuman ?? 0) + L.bounty + L.preyGold; // v17: el botín robado a jugadores reales es una transferencia, no cuenta
  const pvpGold = botGold + L.winGold;
  const goldIn = L.missionGold + pvpGold + L.workshop + L.visitGold + L.dailyGold + L.seasonGold;
  const spent = L.buildSpend + L.decorSpend + L.statSpend + L.gearSpend;
  return {
    day: L.day, lvl: L.lvl, wr7: L.wr7,
    pvpXpShare: L.pvpXp / xpTotal,
    pvpGoldShare: pvpGold / goldIn,
    workshopShare: L.workshop / L.missionGold,
    visitShare: L.visitGold / L.missionGold,
    botGoldShare: botGold / goldIn,
    goldIn, goldPerDay: goldIn / L.day, spent, spendRatio: spent / goldIn,
    endByEnergy: L.endEnergy / Math.max(1, L.endEnergy + L.endTargets),
    lvlAt: (day) => log[day - 1]?.lvl,
  };
}

// Primera hora: winrate por sesión de 12 ataques (presa o primer objetivo disponible), gastando en atributos y con
// misión de 4 h entre sesiones. Es la medición de la v14 (79/68/72/63/66% con 80 semillas y 5 sesiones).
export function firstHour(seeds = 80, sessions = 5, t0 = Date.UTC(2026, 9, 19, 15)) {
  const res = Array.from({ length: sessions }, () => [0, 0]);
  for (let s = 1; s <= seeds; s++) {
    const clock = createClock(() => t0);
    const g = createGame({ storage: memoryStorage(), clock, seed: s, autosave: false });
    g.newCharacter('Tester', s % 2 ? 'hero' : 'villain');
    for (let ses = 0; ses < sessions; ses++) {
      if (g.state().player.mission) g.claimMission();
      for (let i = 0; i < 12; i++) {
        const L = g.targets().list.filter((t) => !t.block); if (!L.length) break;
        const r = g.attack((L.find((x) => x.prey) ?? L[0]).id); if (!r.ok) break;
        res[ses][0] += r.report.winner === 'attacker'; res[ses][1]++;
      }
      for (const o of g.daily().list) g.claimDaily(o.id);
      g.autoSpend({ fue: 1, def: 1, agi: 1, res: 1 });
      const c = g.contracts().list.find((k) => k.min === 240); if (c) g.startMission(c.id);
      clock.advance(4 * 3_600_000); g.state();
    }
  }
  return res.map(([w, t]) => (t ? w / t : 0));
}
