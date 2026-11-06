// v17 fix-mundo: piso de rivales y bono de regreso (B2), multipestaña (B1), pase visible con catch-up, ranking con la
// fila propia, guerra de facciones creíble (B9) y bots calibrados contra quien los ataca (B10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, HOUR, DAY } from '../src/config.js';
import { createClock, memoryStorage } from '../src/core.js';
import * as S from '../src/systems.js';
import * as BL from '../src/bots.js';
import { createGame } from '../src/game.js';
import * as Se from '../src/season.js';
import { createEntity } from '../src/character.js';
import { ITEM } from '../src/catalog.js';
import { runProfile, PROFILES } from '../sim/model.js';

const MON = Date.UTC(2026, 9, 19, 15); // lunes 12:00 ART
const newGame = (seed = 7, faction = 'hero', storage = memoryStorage()) => {
  const clock = createClock(() => MON);
  const g = createGame({ storage, clock, seed, autosave: false });
  g.newCharacter('Tester', faction);
  return { g, clock, w: g.debug.world(), storage };
};
const drain = (g) => { let r, n = 0; do { r = g.catchUp(2); n++; } while (r.pending && n < 500); return n; };

/* ---------- B2: el que se atrasa no se queda sin rivales ---------- */
test('B2: volver en D7 y D30 en Nv 1–2 (entrando a diario o de una vez) siempre deja ≥ 8 rivales en rango', () => {
  for (const seed of [1, 2, 3]) for (const days of [7, 30]) for (const daily of [false, true]) {
    const { g, clock, w } = newGame(seed, seed % 2 ? 'hero' : 'villain');
    if (daily) for (let d = 0; d < days; d++) { clock.advance(DAY); g.state(); } else clock.advance(days * DAY);
    drain(g);
    const p = w.entities.p0, list = g.targets().list;
    assert.ok(list.length >= CFG.bots.floor.targets, `semilla ${seed} D${days}${daily ? ' a diario' : ''}: ${list.length} rivales`);
    // los bots no se escapan del techo de su ancla: ninguno pasa del rango del jugador
    for (const b of Object.values(w.entities)) if (b.isBot && b.anchor === 'p0') assert.ok(b.level <= p.level + S.levelRange(p.level) + 1, `${b.id} Nv ${b.level}`);
  }
});

test('B2: un guardado con los bots ya fuera de rango (Nv 12–14) recibe relevos creíbles de tu nivel, sin crecer', () => {
  const { g, clock, w } = newGame(5);
  for (const b of Object.values(w.entities)) if (b.isBot) b.level = 12 + (Number(b.id.slice(1)) % 3);
  const n0 = Object.keys(w.entities).length;
  // un rival con lazos (amigo) no se va aunque esté lejos
  const friend = Object.values(w.entities).find((e) => e.isBot && e.faction === 'villain');
  w.entities.p0.friends = [friend.id];
  clock.advance(30 * DAY);
  drain(g);
  const st = g.state(), p = w.entities.p0, list = g.targets().list;
  assert.ok(list.length >= CFG.bots.floor.targets, `${list.length} rivales`);
  assert.equal(Object.keys(w.entities).length, n0, 'mismo cupo de entidades');
  assert.ok(w.entities[friend.id], 'el amigo sigue');
  const fresh = Object.values(w.entities).filter((e) => e.isBot && Number(e.id.slice(1)) >= CFG.bots.count);
  assert.ok(fresh.length >= CFG.bots.floor.targets);
  const names = new Set(Object.values(w.entities).map((e) => e.name.toLowerCase()));
  assert.equal(names.size, Object.keys(w.entities).length, 'nicks únicos');
  for (const b of fresh) {
    assert.ok(S.inRange(p, b) && b.level <= p.level + 1, `${b.name} Nv ${b.level}`);
    assert.ok(b.record.w + b.record.l >= b.level * CFG.bots.floor.fightsPerLvl[0] - 1 && b.rep === b.record.w, 'historial acorde');
    assert.ok(st.now - b.createdAt >= CFG.bots.floor.ageDays[0] * DAY - 1, 'alta de hace semanas');
    assert.ok(b.lair.placed.length >= 2 && b.lair.guestbook.length >= 1, 'guarida con muebles y firmas');
    const seen = BL.lastSeen(w, b, st.now);
    assert.ok(seen != null && seen < st.now && seen > b.createdAt, 'última conexión creíble');
    assert.equal(b.anchor, 'p0');
  }
  // bono de regreso con resumen
  assert.ok(st.comeback && st.comeback.days === 30 && st.comeback.gold > 0 && st.comeback.fresh >= CFG.bots.floor.targets && st.comeback.season);
  assert.equal(st.player.energy, st.player.energyMax);
  assert.ok(g.ackComeback().had);
  assert.equal(g.state().comeback, null);
});

test('B2: el bono de regreso llega recién a los 3 días, una vez, y el mundo es igual de a tramos o de una vez', () => {
  const a = newGame(9), b = newGame(9);
  a.clock.advance(2 * DAY + 20 * HOUR); assert.equal(a.g.state().comeback, null);
  b.clock.advance(3 * DAY + HOUR); assert.ok(b.g.state().comeback);
  b.g.ackComeback(); b.clock.advance(HOUR); assert.equal(b.g.state().comeback, null);
  // determinismo: relevos de a tramos (interfaz) = todo en state()
  const c = newGame(11), d = newGame(11);
  for (const x of [c, d]) { for (const e of Object.values(x.w.entities)) if (e.isBot) e.level = 14; x.clock.advance(4 * DAY); }
  drain(c.g); c.g.state(); d.g.state();
  const ids = (x) => Object.values(x.w.entities).filter((e) => e.isBot).map((e) => `${e.id}:${e.name}:${e.level}:${e.stats.fue}`).sort().join();
  assert.equal(ids(c), ids(d));
  assert.ok(c.g.targets().list.length >= CFG.bots.floor.targets);
});

/* ---------- B1: dos pestañas no se pisan el guardado ---------- */
test('B1: con el juego abierto en dos pestañas, la desactualizada no pisa el progreso ni recupera energía', () => {
  const storage = memoryStorage(), clock = createClock(() => MON);
  let staleA = 0;
  const A = createGame({ storage, clock, seed: 3, onStale: () => staleA++ });
  A.newCharacter('Tester', 'hero');
  const e0 = A.state().player.energy;
  // se abre una segunda pestaña: lee el guardado y pasa a ser la dueña
  const B = createGame({ storage, clock: createClock(() => MON) });
  const T = B.targets().list.filter((t) => !t.block);
  assert.ok(B.attack(T[0].id).ok && B.attack(T[1].id).ok);
  const saved = JSON.parse(storage.getItem('oathbreak.save'));
  assert.equal(saved.entities.p0.energy, e0 - 2 * CFG.energy.pvpCost);
  // la pestaña vieja (con la energía de antes) intenta jugar y guardar: se rechaza sin tocar el guardado
  assert.equal(A.isStale(), true);
  assert.equal(staleA, 1);
  assert.equal(A.attack(T[2].id).error, 'otra_pestana');
  assert.equal(A.state().error, 'otra_pestana');
  A.save(); A.debug.toNext('day'); // tampoco escribe (y "Jugar acá" vuelve al reloj del guardado)
  assert.equal(JSON.parse(storage.getItem('oathbreak.save')).entities.p0.energy, e0 - 2 * CFG.energy.pvpCost);
  // "Jugar acá" en la vieja: relee el guardado (con el progreso de B) y la otra queda desactualizada
  assert.ok(A.reload().ok);
  assert.equal(A.state().player.energy, e0 - 2 * CFG.energy.pvpCost);
  assert.equal(B.isStale(), true);
  assert.equal(B.attack(T[3].id).error, 'otra_pestana');
  assert.ok(A.attack(T[3].id).ok);
  assert.equal(JSON.parse(storage.getItem('oathbreak.save')).entities.p0.energy, e0 - 3 * CFG.energy.pvpCost);
  // aviso de otra pestaña por BroadcastChannel
  assert.ok(A.yieldTab().ok); assert.equal(A.claimMission().error, 'otra_pestana');
});

/* ---------- Pase: visible, variado y con catch-up ---------- */
test('pase: catch-up ×2 solo por debajo del escalón esperado para el día de la temporada', () => {
  const start = Se.seasonStart(MON), p = createEntity({ id: 'p0', name: 'Tester', faction: 'hero', now: MON });
  assert.equal(Se.addGlory(p, 'win', start + HOUR), CFG.season.glory.win, 'día 0: sin catch-up');
  const mid = start + 14 * DAY, exp = Se.expectedTier(mid);
  assert.ok(exp >= 10 && exp <= 12, `esperado el día 14: ${exp}`);
  assert.equal(Se.addGlory(p, 'win', mid), CFG.season.glory.win * CFG.season.catchUp.mult, 'atrasado: ×2');
  p.season.glory = exp * CFG.season.gloryPerTier;
  assert.equal(Se.addGlory(p, 'win', mid), CFG.season.glory.win, 'al día: sin catch-up');
  const st = Se.seasonStatus(p, mid);
  assert.equal(st.boost, 1); assert.equal(st.expected, exp);
});

test('pase: escalones variados (oro, XP, renombre, cofres y decoración del catálogo) que cambian con la temporada', () => {
  const k = Se.seasonKey(MON);
  const types = (key, f) => Array.from({ length: 30 }, (_, i) => Se.tierReward(i + 1, 10, f, key));
  const a = types(k, 'hero');
  assert.equal(a[0].type, 'gold');
  assert.deepEqual([...new Set(a.map((r) => r.type))].sort(), ['chest', 'gold', 'item', 'renown', 'xp']);
  assert.ok(a.some((r, i) => i >= 3 && r.type !== a[i - 3].type), 'no es un ciclo de 3');
  const decor = a.filter((r) => r.decor).map((r) => r.id);
  assert.ok(decor.length >= 6 && new Set(decor).size === decor.length && decor.every((id) => ITEM[id] && !ITEM[id].season));
  assert.ok(decor.every((id) => !ITEM[id].faction || ITEM[id].faction === 'hero'));
  assert.notDeepEqual(types(k + 1, 'hero').filter((r) => r.decor).map((r) => r.id), decor, 'otra temporada, otra decoración');
  assert.equal(a.filter((r) => r.type === 'gold' || r.type === 'chest').length, 9, 'mismo oro que el ciclo de 3');
  const p = createEntity({ id: 'p0', name: 'Tester', faction: 'hero', now: MON });
  const t = a.findIndex((r) => r.decor) + 1;
  Se.addGlory(p, 'daily', MON, (t * CFG.season.gloryPerTier) / CFG.season.glory.daily);
  const r = Se.claimTier(p, t, MON);
  assert.ok(r.ok && r.reward.decor && p.lair.inventory.some((i) => i.id === r.reward.id));
});

test('pase: la fachada da escalón, próximo premio y para cobrar (tarjeta de Inicio y badge del avatar)', () => {
  const { g, w } = newGame(4);
  Se.addGlory(w.entities.p0, 'daily', MON, (2 * CFG.season.gloryPerTier) / CFG.season.glory.daily);
  const s = g.state().season;
  assert.equal(s.reached, 2); assert.equal(s.claimable, 2); assert.equal(s.next.tier, 3); assert.equal(s.boost, 1);
  g.claimSeasonTier(1); assert.equal(g.state().season.claimable, 1);
});

test('pase: quien entra a mitad de temporada termina más arriba con catch-up (activo, desde el día 14)', () => {
  const cu = CFG.season.catchUp, end = {};
  try {
    for (const on of [false, true]) { CFG.season.catchUp = on ? cu : null; end[on] = runProfile(PROFILES.activo, 13, 1234, { startDay: 14 }).at(-1).seasonReached; }
  } finally { CFG.season.catchUp = cu; }
  assert.ok(end[false] <= 17 && end[true] >= end[false] + 6, `sin ${end[false]} · con ${end[true]}`);
});

/* ---------- Ranking con tu fila y tu facción ---------- */
test('ranking: rivales y tu facción, siempre con tu fila (#N de M) y la meta cercana', () => {
  const { g, w } = newGame(6);
  const heroes = Object.values(w.entities).filter((e) => e.isBot && e.faction === 'hero');
  heroes.forEach((b, i) => { b.rep = 100 + i * 10; });
  const p = w.entities.p0; p.rep = 5;
  const r = g.ranking();
  assert.ok(r.ok && r.list.every((t) => t.faction === 'villain' && !t.me && 'block' in t));
  assert.equal(r.me.pos, heroes.length + 1); assert.equal(r.me.of, heroes.length + 1);
  const m = g.ranking('mine');
  assert.equal(m.list.length, Math.min(20, heroes.length + 1));
  assert.equal(m.list[0].rep, 100 + (heroes.length - 1) * 10);
  // fuera del top 20 la meta es el #20; adentro, el de arriba
  if (m.me.pos > 20) assert.deepEqual([m.me.goal.pos, m.me.goal.gap], [20, m.list[19].rep - p.rep + 1]);
  else assert.equal(m.me.goal.pos, m.me.pos - 1);
  p.rep = 1e6;
  const top = g.ranking('mine');
  assert.equal(top.me.pos, 1); assert.equal(top.me.goal, null); assert.ok(top.list[0].me);
  assert.equal(g.ranking('otro').error, 'alcance_invalido');
});

/* ---------- B9: la guerra de facciones no es trivial ---------- */
test('B9: el resto de cada facción pelea: el día 1 no es 2–0 y, sin cazar, cada bando gana algunas semanas', () => {
  const winners = { hero: 0, villain: 0, null: 0 };
  for (const seed of [11, 22, 33, 44]) {
    const { g, clock } = newGame(seed);
    clock.advance(DAY); const d1 = g.state().faction;
    assert.ok(d1.hero >= 20 && d1.villain >= 20, `día 1: ${JSON.stringify(d1)}`);
    const seen = new Set();
    for (let d = 1; d < 36; d++) { clock.advance(DAY); const lp = g.state().lastPrize; if (lp && !seen.has(lp.week)) { seen.add(lp.week); winners[lp.faction.winner]++; } }
  }
  assert.ok(winners.hero >= 4 && winners.villain >= 4, JSON.stringify(winners));
  // con la marca Eco, los duelos de bots no cuentan
  const saved = CFG.bots.label;
  try {
    CFG.bots.label = 'eco';
    const { g, clock } = newGame(5);
    clock.advance(DAY);
    assert.deepEqual(g.state().faction, { hero: 0, villain: 0 });
  } finally { CFG.bots.label = saved; }
});

/* ---------- B10: un bot anclado a otro jugador pelea espejado a quien lo ataca ---------- */
test('B10: bots espejados al atacante con varios jugadores reales; con uno solo, nada cambia', () => {
  const { g, w } = newGame(8);
  const p0 = w.entities.p0, foe = Object.values(w.entities).find((e) => e.isBot && e.faction === 'villain');
  assert.equal(S.mirrorK(w, p0, foe), 1, 'un solo jugador: todos orbitan a p0');
  const r = g.debug.addPlayer('Fuerte', 'hero');
  const p1 = w.entities[r.id];
  for (const k of CFG.stats) p1.stats[k] = 40;
  foe.anchor = p1.id;
  const k = S.mirrorK(w, p0, foe);
  assert.ok(k < 0.5 + 1e-9 || Math.abs(k - S.power(p0) / S.power(p1)) < 1e-9, `k ${k}`);
  assert.equal(S.mirrorK(w, p1, foe), 1, 'su ancla lo ve como es');
  assert.equal(S.mirrorK(w, foe, p0), 1, 'los bots que atacan no se espejan');
  // la banda que ve p0 es la de la pelea espejada (más fácil que el bot "real" calibrado contra p1)
  const raw = S.winChance(p0, foe), mir = S.winChance(p0, foe, undefined, k);
  assert.ok(mir >= raw);
  foe.level = p0.level;
  const rep = S.pvp(w, p0, foe, MON + HOUR, { ignoreEnergy: true }).report;
  assert.ok(rep.defender.stats.fue <= Math.ceil(foe.stats.fue * Math.max(k, 0.5)) + 5);
});
