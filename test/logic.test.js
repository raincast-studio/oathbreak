import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, MIN, HOUR, DAY } from '../src/config.js';
import { createClock, memoryStorage } from '../src/core.js';
import * as C from '../src/character.js';
import { resolveCombat, dodgeChance, critChance, baseDamage } from '../src/combat.js';
import * as S from '../src/systems.js';
import { createGame } from '../src/game.js';

const T0 = 1_760_000_000_000;
const fixedClock = () => createClock(() => T0);
const ent = (id, faction, extra = {}) => Object.assign(C.createEntity({ id, name: id, faction, now: T0, isBot: true }), extra);
const world = () => ({ seed: 42, seq: 0, playerId: 'p0', entities: {}, inbox: [] });

test('fórmulas cerradas', () => {
  const e = ent('a', 'hero');
  assert.equal(C.maxHp(e), 50 + 5 * 8);
  assert.equal(CFG.xpNeed(1), 100);
  assert.equal(C.statCost(e, 'fue'), Math.round(10 * 5 ** 1.5 * 1.8));
  assert.equal(C.statCost(e, 'def'), Math.round(10 * 5 ** 1.5 * 0.4));
  C.buyStat(Object.assign(e, { gold: 1e6 }), 'def'); // subir cualquier stat encarece todos por igual
  assert.equal(C.statCost(e, 'fue'), Math.round(10 * (21 / 4) ** 1.5 * 1.8));
  assert.equal(dodgeChance(10, 10), 0.45);
  assert.ok(dodgeChance(100, 1) < 0.9 && dodgeChance(100, 1) > 0.89); // asíntota
  assert.equal(critChance(10, 10), 0.175);
  assert.equal(baseDamage(10, 10), 25 - 13);
  assert.equal(baseDamage(4, 20), 10 * 0.2); // piso del 20%
  assert.deepEqual(S.missionReward(60, 1), { gold: Math.round(CFG.missions.goldBase * 60 ** 0.8 * 1.1), xp: Math.round(CFG.missions.xpBase * 60 ** 0.8 * 1.1) });
});

test('energía regenera 1 cada 20 min, tope 12', () => {
  const e = ent('a', 'hero', { energy: 0 });
  C.syncEnergy(e, T0 + 59 * MIN);
  assert.equal(e.energy, 2);
  C.syncEnergy(e, T0 + 60 * MIN);
  assert.equal(e.energy, 3);
  C.syncEnergy(e, T0 + 10 * HOUR);
  assert.equal(e.energy, 12);
});

test('cada combate arranca con vida completa (la energía es el único límite)', () => {
  const w = world();
  const a = ent('p0', 'hero'), d = ent('b1', 'villain');
  w.entities = { p0: a, b1: d };
  const r1 = S.pvp(w, a, d, T0).report;
  assert.equal(r1.attacker.hpStart, C.maxHp(a));
  a.lastAttackOn = {};
  const r2 = S.pvp(w, a, d, T0 + 1).report;
  assert.equal(r2.attacker.hpStart, C.maxHp(a));
  assert.ok(r1.attacker.hpEnd <= C.maxHp(a));
});

test('combate determinístico por seed', () => {
  const A = { stats: { fue: 20, def: 10, agi: 12, res: 10 }, hp: 150, maxHp: 150 };
  const D = { stats: { fue: 15, def: 15, agi: 8, res: 12 }, hp: 170, maxHp: 170 };
  assert.deepEqual(resolveCombat(A, D, 777), resolveCombat(A, D, 777));
  const r = resolveCombat(A, D, 777);
  assert.ok(r.rounds.length <= CFG.combat.rounds * 4); // 2 actores × (golpe + doble)
  assert.ok(['KO', 'DAMAGE', 'TIE_DEF'].includes(r.reason));
});

test('KO cuando hay diferencia enorme', () => {
  const A = { stats: { fue: 500, def: 50, agi: 50, res: 50 }, hp: 550, maxHp: 550 };
  const D = { stats: { fue: 5, def: 5, agi: 5, res: 5 }, hp: 100, maxHp: 100 };
  const r = resolveCombat(A, D, 1);
  assert.equal(r.winner, 'A');
  assert.equal(r.reason, 'KO');
});

test('atacante gana: roba 10%; defensor gana: recompensa del sistema y el atacante no pierde oro', () => {
  let sawA = false, sawD = false;
  for (let seed = 1; seed < 60; seed++) {
    const w = world();
    const a = ent('p0', 'hero', { gold: 1000 }), d = ent('b1', 'villain', { gold: 500 });
    w.seed = seed; w.entities = { p0: a, b1: d };
    const r = S.pvp(w, a, d, T0).report;
    if (r.winner === 'attacker') { sawA = true; assert.equal(a.gold, 1050 + r.loot.win); assert.ok(r.loot.win > 0); assert.equal(d.gold, 450); assert.equal(r.loot.bounty, 0); }
    else { sawD = true; assert.equal(a.gold, 1000); assert.ok(r.loot.bounty > 0); assert.equal(d.gold, 500 + r.loot.bounty); assert.equal(r.loot.gold, 0); }
  }
  assert.ok(sawA && sawD);
});

test('recompensa de defensa: escala con la chance del atacante; una cuenta "sparring" no cobra', () => {
  const d = ent('d', 'villain');
  const even = ent('a', 'hero'), strong = ent('b', 'hero', { stats: { fue: 50, def: 50, agi: 50, res: 50 } });
  const base = S.missionReward(30, 1).gold;
  const wc = S.winChance(even, d);
  assert.equal(S.defenseBounty(even, d).gold, Math.round(base * Math.min(1.5, Math.max(0.5, 0.5 + 2 * wc))));
  assert.equal(S.defenseBounty(strong, d).gold, Math.round(base * 1.5));
  assert.equal(S.defenseBounty(even, strong).reason, 'rival_debil'); // sin chances reales: no paga
  // Cuenta secundaria pura Def contra una cuenta principal desarrollada: mucho atributo, cero chances → no paga.
  const main = ent('m', 'villain', { stats: { fue: 30, def: 30, agi: 30, res: 30 } });
  const sparring = ent('s', 'hero', { stats: { fue: 5, def: 120, agi: 5, res: 5 } });
  assert.ok(S.winChance(sparring, main) < 0.2);
  assert.equal(S.defenseBounty(sparring, main).reason, 'rival_debil');
  const weak = even;
  // una vez por atacante por día
  assert.ok(S.defenseBounty(weak, d, T0).gold > 0);
  assert.equal(S.defenseBounty(weak, d, T0 + 1).reason, 'ya_cobrada_hoy');
});

test('el defensor fuerte gana y cobra recompensa sin quitarle oro al atacante', () => {
  const w = world();
  const a = ent('p0', 'hero', { gold: 1000, isBot: false, inbox: [] });
  const d = ent('b1', 'villain', { gold: 0, stats: { fue: 80, def: 60, agi: 40, res: 30 } });
  d.hp = C.maxHp(d); w.entities = { p0: a, b1: d };
  const r = S.pvp(w, a, d, T0).report;
  assert.equal(r.winner, 'defender');
  assert.equal(a.gold, 1000);
  assert.equal(d.gold, r.loot.bounty);
  assert.equal(a.inbox[0].role, 'attacker');
});

test('reglas de bloqueo de ataque', () => {
  const a = ent('a', 'hero'), d = ent('d', 'villain');
  assert.equal(S.attackBlock(a, ent('x', 'hero'), T0), 'misma_faccion');
  assert.equal(S.attackBlock(a, Object.assign(ent('y', 'villain'), { level: 5 }), T0), 'fuera_de_rango');
  assert.equal(S.attackBlock(Object.assign(ent('z', 'hero'), { level: 20 }), Object.assign(ent('q', 'villain'), { level: 16 }), T0), null); // 20% de 20 = 4
  a.energy = 0; assert.equal(S.attackBlock(a, d, T0), 'sin_energia'); a.energy = 12;
  a.lastAttackOn.d = T0 - 30 * MIN; assert.equal(S.attackBlock(a, d, T0), 'cooldown_objetivo');
  assert.equal(S.attackBlock(a, d, T0 + 31 * MIN), null);
  d.received = { day: -99, count: 0 };
  const w = world(); w.entities = { a, d };
  for (let i = 0; i < 5; i++) { a.lastAttackOn = {}; a.hp = 100; S.pvp(w, a, d, T0 + 2 * HOUR + i); }
  a.lastAttackOn = {}; a.hp = 100;
  assert.equal(S.attackBlock(a, d, T0 + 2 * HOUR + 10), 'objetivo_protegido');
  assert.equal(S.attackBlock(a, d, T0 + 2 * HOUR + DAY), null);
});

test('HP mínimo 1 tras combate', () => {
  const w = world();
  const a = ent('p0', 'hero', { stats: { fue: 500, def: 5, agi: 5, res: 5 } }), d = ent('b1', 'villain');
  w.entities = { p0: a, b1: d };
  S.pvp(w, a, d, T0);
  assert.ok(d.hp >= 1);
});

test('banco: comisión 10% y oro depositado no se roba', () => {
  const e = ent('a', 'hero', { gold: 1000 });
  assert.deepEqual(S.deposit(e, 1000), { ok: true, deposited: 900, fee: 100 });
  assert.equal(e.gold, 0);
  assert.equal(e.bank, 900);
  assert.equal(S.withdraw(e, 900).ok, true);
});

test('misión: una a la vez, cobro solo al terminar, sube nivel', () => {
  const e = ent('a', 'hero');
  assert.ok(S.startMission(e, 'h5', T0).ok);
  assert.equal(S.startMission(e, 'h1', T0).error, 'mision_activa');
  assert.equal(S.claimMission(e, T0 + 479 * MIN).error, 'en_curso');
  const r = S.claimMission(e, T0 + 480 * MIN);
  assert.ok(r.ok && r.levels >= 1);
  assert.equal(e.mission, null);
  assert.equal(S.startMission(ent('v', 'villain'), 'h1', T0).error, 'contrato_invalido');
});

test('compra de stat y equipo', () => {
  const e = ent('a', 'hero', { gold: 10_000 });
  assert.ok(C.buyStat(e, 'fue').ok);
  assert.equal(e.stats.fue, 6);
  assert.equal(C.buyGear(e, 'arma', 2).error, 'nivel_insuficiente');
  assert.ok(C.buyGear(e, 'arma', 1).ok);
  assert.equal(C.effStat(e, 'fue'), 6 + CFG.gear.tiers[0].bonus);
  assert.ok(C.buyGear(e, 'amuleto', 1).ok);
  assert.equal(C.effStat(e, 'def'), 5 + Math.max(1, Math.floor(CFG.gear.tiers[0].bonus / 2)));
  assert.equal(C.buyGear(e, 'arma', 1).error, 'ya_equipado');
});

test('informes: máximo 50 FIFO', () => {
  const w = world();
  const a = ent('p0', 'hero', { isBot: false, inbox: [] });
  for (let i = 0; i < 60; i++) {
    const d = ent(`b${i}`, 'villain');
    w.entities = { p0: a, [d.id]: d };
    a.lastAttackOn = {};
    S.pvp(w, a, d, T0 + i, { ignoreEnergy: true });
  }
  assert.equal(a.inbox.length, 50);
  assert.ok(a.inbox.every((x, i, arr) => i === 0 || arr[i - 1].report.ts >= x.report.ts)); // ordenada por fecha
});

test('fachada: flujo completo + persistencia + offline', () => {
  const storage = memoryStorage(), clock = fixedClock();
  const g = createGame({ storage, clock, seed: 9 });
  assert.equal(g.newCharacter('ab', 'hero').error, 'nombre_corto');
  assert.ok(g.newCharacter('Tester', 'hero').ok);
  assert.ok(g.startMission('h2').ok);
  clock.advance(61 * MIN);
  assert.ok(g.claimMission().ok);
  const t = g.targets().list.find((x) => !x.block);
  assert.ok(t);
  const r = g.attack(t.id);
  assert.ok(r.ok, r.error);
  assert.equal(g.state().player.energy, 11);
  g.debug.advance(24 * HOUR); // bots corren offline y pueden atacar
  const g2 = createGame({ storage, clock });
  const s = g2.state();
  assert.ok(s.ok);
  assert.equal(s.player.energy, 12);
  assert.ok(g2.inbox().list.length >= 1);
});
