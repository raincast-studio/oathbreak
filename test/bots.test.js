// v17: bots que pasan por humanos, retiro progresivo y marca «Eco».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, HOUR, DAY } from '../src/config.js';
import { createClock, memoryStorage } from '../src/core.js';
import * as S from '../src/systems.js';
import * as BL from '../src/bots.js';
import { migrate } from '../src/migrate.js';
import { createGame } from '../src/game.js';
import { firstHour } from '../sim/model.js';

const MON = Date.UTC(2026, 9, 19, 15); // lunes 12:00 ART
const newGame = (seed = 7) => {
  const clock = createClock(() => MON);
  const g = createGame({ storage: memoryStorage(), clock, seed, autosave: false });
  g.newCharacter('Tester', 'hero');
  return { g, clock, w: g.debug.world() };
};
const botsOf = (w) => Object.values(w.entities).filter((e) => e.isBot);
const withCfg = (patch, fn) => {
  const saved = structuredClone(CFG.bots);
  try { Object.assign(CFG.bots, patch.bots ?? {}); Object.assign(CFG.bots.retire, patch.retire ?? {}); return fn(); } finally { Object.assign(CFG.bots, saved); }
};

test('nicks: únicos, de 3 a 16 caracteres, variados y con el gancho de moderación', () => {
  const all = [];
  for (let s = 1; s <= 30; s++) {
    const names = botsOf(newGame(s).w).map((b) => b.name);
    assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length, `repetidos en la semilla ${s}`);
    for (const n of names) assert.match(n, /^[A-Za-z0-9_]{3,16}$/);
    all.push(...names);
  }
  assert.ok(new Set(all).size / all.length > 0.85, 'poca variedad entre mundos');
  const share = (re) => all.filter((n) => re.test(n)).length / all.length;
  assert.ok(share(/\d/) > 0.25 && share(/\d/) < 0.7, 'números ocasionales');
  assert.ok(share(/^[a-z0-9_]+$/) > 0.03 && share(/_/) > 0.1, 'minúsculas y guiones bajos');
  BL.setBotNameFilter((n) => !/a/i.test(n));
  try { assert.ok(botsOf(newGame(3).w).every((b) => !/a/i.test(b.name))); } finally { BL.setBotNameFilter(null); }
});

test('guaridas de bots: ninguna igual a otra y los muebles repartidos por la sala', () => {
  const { w } = newGame(11);
  const sig = botsOf(w).map((b) => `${b.lair.rooms[0].floor}|${b.lair.rooms[0].wall}|${b.lair.placed.map((p) => `${p.id}@${p.x},${p.y}`).sort().join()}`);
  assert.equal(new Set(sig).size, sig.length);
  const ys = botsOf(w).flatMap((b) => b.lair.placed.map((p) => p.y));
  assert.ok(ys.filter((y) => y >= 4).length / ys.length > 0.3, 'todo amontonado arriba');
});

test('horario humano: duerme, juega más a la tarde y noche, días sin entrar y volumen diario como antes', () => {
  const { w } = newGame(5);
  const bots = botsOf(w), s0 = Math.floor(MON / HOUR);
  let night = 0, eve = 0, morn = 0, tot = 0, actions = 0, idleDays = 0;
  for (const b of bots) {
    const p = BL.profile(w, b), perDay = new Map();
    for (let s = s0; s < s0 + 28 * 24; s++) {
      const x = BL.slot(w, b, s);
      if (!x) continue;
      const loc = s + p.tz, ld = Math.floor(loc / 24), lh = loc - ld * 24, dow = (((ld + 4) % 7) + 7) % 7;
      if (lh === 3 && dow >= 1 && dow <= 5) night++; // madrugada de lunes a viernes: siempre duerme
      tot++; actions += x.k;
      if (lh >= 17) eve++; else if (lh >= 6 && lh < 12) morn++;
      perDay.set(ld, (perDay.get(ld) ?? 0) + 1);
    }
    idleDays += 28 - perDay.size;
  }
  assert.equal(night, 0);
  assert.ok(eve / tot > 0.45 && morn / tot < 0.2, `tarde/noche ${(eve / tot).toFixed(2)} · mañana ${(morn / tot).toFixed(2)}`);
  assert.ok(idleDays / bots.length >= 2, 'días sin entrar');
  // Acciones visibles (visitas + ataques) por bot y por día, cerca de las tasas de config × 24.
  const want = (CFG.bots.visitChancePerHour + CFG.bots.attackChancePerHour) * 24, got = actions / bots.length / 28;
  // (algo más que antes entre bots: sus guaridas con piso y pared atraen; las visitas que recibe el jugador quedan iguales)
  assert.ok(got / want > 0.9 && got / want < 1.4, `${got.toFixed(2)} acciones/día (antes ${want.toFixed(2)})`);
  // Determinista: el mismo bot en una copia del guardado da el mismo horario.
  const copy = JSON.parse(JSON.stringify(w));
  for (let s = s0; s < s0 + 72; s++) assert.deepEqual(BL.slot(copy, copy.entities.b3, s), BL.slot(w, w.entities.b3, s));
});

test('lo visible lleva la hora de la franja en línea del bot y su "última vez activo" es coherente', () => {
  const { g, clock, w } = newGame(9);
  clock.advance(3 * DAY); g.state();
  const now = clock.now(), gb = g.lair().guestbook;
  assert.ok(gb.length > 0);
  for (let i = 1; i < gb.length; i++) assert.ok(gb[i - 1].ts >= gb[i].ts, 'libro ordenado');
  for (const v of gb.filter((x) => w.entities[x.id]?.isBot)) {
    const b = w.entities[v.id], s = Math.floor(v.ts / HOUR);
    assert.ok(BL.slot(w, b, s, BL.activity(b, v.ts)), `${b.name} visitó fuera de su horario`);
    const seen = BL.lastSeen(w, b, now);
    assert.ok(seen >= v.ts && seen <= now);
  }
  assert.ok(new Set(gb.map((x) => new Date(x.ts).getUTCMinutes())).size > Math.min(4, gb.length - 1), 'no todo a la hora en punto');
});

test('solicitudes a un bot: contesta en 1–6 h y recién cuando está en línea', () => {
  const { g, clock, w } = newGame(4);
  const b = botsOf(w).find((x) => x.faction === 'villain');
  assert.ok(g.addFriend(b.id).ok);
  const req = b.friendReq.in.find((r) => r.id === 'p0');
  assert.ok(req.replyAt - MON >= HOUR && req.replyAt - MON <= 6 * HOUR);
  for (let h = 0; h < 72 && b.friendReq.in.some((r) => r.id === 'p0'); h++) { clock.advance(HOUR); g.state(); }
  assert.ok(!b.friendReq.in.some((r) => r.id === 'p0'), 'nunca contestó');
  const at = w.botHour; // la hora en que contestó (franja at−1)
  assert.ok(BL.slot(w, b, at - 1, 1) && at * HOUR >= req.replyAt);
});

test('primera hora: winrate por sesión ~79/68/72/63/66% (±3 pp)', () => {
  const wr = firstHour(80, 5);
  [0.79, 0.68, 0.72, 0.63, 0.66].forEach((x, i) => assert.ok(Math.abs(wr[i] - x) <= 0.03, `sesión ${i + 1}: ${(wr[i] * 100).toFixed(1)}%`));
});

test('retiro progresivo: de a poco, sin bajar del piso de objetivos, etapas y regreso', () => withCfg({ retire: { enabled: true, since: MON - 90 * DAY }, bots: { receiveFromPlayers: 30 } }, () => {
  const { g, clock, w } = newGame(5);
  for (let i = 0; i < 15; i++) g.debug.addPlayer(`Jugador${i}`, i % 2 ? 'hero' : 'villain');
  const p = w.entities.p0, b0 = botsOf(w).find((b) => b.faction === 'villain');
  p.friends = [b0.id]; b0.friends = ['p0'];
  for (let d = 0; d < 12; d++) {
    for (let h = 0; h < 4; h++) { clock.advance(6 * HOUR); for (const id of w.players) { w.entities[id].lastSeen = clock.now(); w.entities[id].level = 8; } g.state(); }
    const now = clock.now();
    for (const id of w.players) {
      const e = w.entities[id], opp = Object.values(w.entities).filter((o) => o.faction !== e.faction && S.inRange(e, o) && !BL.gone(o, now));
      assert.ok(opp.length >= CFG.bots.retire.minTargets, `día ${d}: ${id} con ${opp.length} rivales`);
    }
  }
  const now = clock.now(), st = botsOf(w).map((b) => BL.retireStage(b, now));
  assert.ok(st.filter((x) => x === 3).length >= 4 && st.filter((x) => x === 0).length >= CFG.bots.retire.minTargets, st.join(''));
  const gone = botsOf(w).find((b) => BL.gone(b, now) && b.faction !== p.faction), leaving = botsOf(w).find((b) => BL.retireStage(b, now) === 1);
  assert.ok(!g.targets().list.some((t) => t.id === gone.id) && S.attackBlock(p, gone, now) === 'fuera_de_rango');
  assert.ok(!g.ranking().list.some((x) => w.entities[x.id].ret) && !g.showcase().list.some((x) => w.entities[x.id].ret));
  if (leaving) assert.notEqual(S.preyOf(w, p, now), leaving.id);
  // El amigo que se fue sigue en la lista, como inactivo y con su última vez congelada; se sugieren reales.
  b0.ret = { at: now - 6 * DAY };
  const fr = g.friends();
  const f = fr.list.find((x) => x.id === b0.id);
  assert.ok(f && f.inactive && f.seen <= now - DAY);
  assert.ok(fr.suggest.length > 0 && fr.suggest.every((x) => !w.entities[x.id].isBot));
  // Apagado el mecanismo, vuelven de a poco.
  CFG.bots.retire.enabled = false;
  const before = botsOf(w).filter((b) => b.ret).length;
  clock.advance(2 * DAY); g.state();
  assert.ok(botsOf(w).filter((b) => b.ret).length < before);
}));

test('sin jugadores reales extra (el cliente) el retiro activado deja los pisos: nunca menos de minTargets rivales', () => withCfg({ retire: { enabled: true } }, () => {
  const { g, clock, w } = newGame(8);
  for (let d = 0; d < 6; d++) { w.entities.p0.level = 6 + 2 * d; clock.advance(DAY); g.state(); } // el jugador progresa
  const p = w.entities.p0, now = clock.now();
  assert.ok(Object.values(w.entities).filter((o) => o.isBot && o.faction !== p.faction && S.inRange(p, o) && !o.ret).length >= CFG.bots.retire.minTargets);
}));

test('marca Eco: dato en la fachada, fuera de ranking, escaparate y guerra; siguen siendo presa', () => {
  const { g, w } = newGame(6);
  assert.ok(g.targets().list.every((t) => !t.eco));
  withCfg({ bots: { label: 'eco' } }, () => {
    const t = g.targets().list;
    assert.ok(t.length && t.every((x) => x.eco));
    assert.ok(t.some((x) => x.prey));
    assert.equal(g.ranking().list.length, 0);
    assert.ok(g.showcase().list.every((x) => x.id === 'p0'));
    for (const b of botsOf(w)) b.repWeek = { week: 99999, count: 5 };
    assert.deepEqual(S.factionScore(w, MON), { hero: 0, villain: 0 });
  });
});

test('migración v5 → v6 y volver tras 72 h sin tareas largas', () => {
  const { w } = newGame(2);
  const v5 = JSON.parse(JSON.stringify(w));
  v5.version = 5; delete v5.botDay;
  const m = migrate(v5, CFG.saveVersion);
  assert.equal(m.version, 6);
  assert.ok('botDay' in m);
  const clock = createClock(() => MON), storage = memoryStorage();
  storage.setItem('oathbreak.save', JSON.stringify(v5));
  const g = createGame({ storage, clock, autosave: false });
  assert.ok(g.state().ok);
  clock.advance(72 * HOUR);
  const t = performance.now();
  for (let r; (r = g.catchUp(6)).pending;);
  assert.ok(performance.now() - t < 2000);
});
