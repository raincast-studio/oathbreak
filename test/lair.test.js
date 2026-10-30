import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, MIN, HOUR, DAY } from '../src/config.js';
import { createClock, memoryStorage, mulberry32 } from '../src/core.js';
import * as C from '../src/character.js';
import * as S from '../src/systems.js';
import * as Lr from '../src/lair.js';
import { createGame } from '../src/game.js';
import * as So from '../src/social.js';

const T0 = Date.UTC(2026, 9, 20, 15); // mediodía ART
const ent = (id, faction, extra = {}) => Object.assign(C.createEntity({ id, name: id, faction, now: T0, isBot: true }), extra);
const world = () => ({ seed: 42, seq: 0, playerId: 'p0', entities: {}, inbox: [] });

test('edificios: precio exponencial, nivel requerido y efectos', () => {
  const e = ent('a', 'hero', { gold: 1e6 });
  assert.equal(Lr.buildingPrice('boveda', 1), 300);
  assert.equal(Lr.buildingPrice('boveda', 3), Math.round(300 * 2.2 ** 2));
  assert.ok(Lr.upgradeBuilding(e, 'generador', T0).ok);
  assert.equal(Lr.upgradeBuilding(e, 'generador', T0).error, 'nivel_insuficiente'); // nivel 2 pide Nv 5
  e.level = 30;
  for (let i = 0; i < 4; i++) assert.ok(Lr.upgradeBuilding(e, 'generador', T0).ok);
  assert.equal(Lr.upgradeBuilding(e, 'generador', T0).error, 'nivel_maximo');
  e.energy = 0; e.energyTs = T0;
  C.syncEnergy(e, T0 + 10 * HOUR);
  assert.equal(e.energy, 18);
  Lr.upgradeBuilding(e, 'enfermeria', T0);
  e.hp = 0; e.hpTs = T0;
  C.syncHp(e, T0 + 105 * MIN);
  assert.equal(Math.round(e.hp), C.maxHp(e));
});

test('bóveda protege parte del oro del robo', () => {
  let robbed = 0;
  for (let seed = 1; seed < 80 && !robbed; seed++) {
    const w = world(); w.seed = seed;
    const a = ent('p0', 'hero', { stats: { fue: 60, def: 60, agi: 60, res: 60 } });
    const d = ent('b1', 'villain', { gold: 1000 });
    a.hp = C.maxHp(a); d.lair.buildings.boveda = 3; // 30%
    w.entities = { p0: a, b1: d };
    const r = S.pvp(w, a, d, T0).report;
    if (r.winner === 'attacker') { robbed = r.loot.gold; }
  }
  assert.equal(robbed, 70); // 10% de los 700 no protegidos
});

test('torre de vigía sube Def/Agi solo al defender', () => {
  const w = world();
  const a = ent('p0', 'hero'), d = ent('b1', 'villain');
  d.lair.buildings.torre = 5;
  w.entities = { p0: a, b1: d };
  const r = S.pvp(w, a, d, T0).report;
  assert.equal(r.defender.stats.def, Math.round(5 * 1.15));
  assert.equal(r.attacker.stats.def, 5);
});

test('taller: produce por hora, tope 12 h, cobro', () => {
  const e = ent('a', 'hero', { gold: 1e6, level: 10 });
  Lr.upgradeBuilding(e, 'taller', T0);
  const rate = Lr.workshopRate(e);
  assert.equal(Lr.workshopInfo(e, T0 + 2 * HOUR).stored, Math.floor(rate * 2));
  assert.equal(Lr.workshopInfo(e, T0 + 30 * HOUR).stored, Math.floor(rate * 12));
  const g = e.gold;
  const r = Lr.claimWorkshop(world(), e, T0 + 30 * HOUR);
  assert.equal(e.gold, g + r.gold);
  assert.equal(Lr.claimWorkshop(world(), e, T0 + 30 * HOUR).error, 'taller_vacio');
});

test('visita: 1 toque, beneficio mutuo, tope diario 10 con oro y renombre hasta 30', () => {
  const w = world();
  const v = ent('p0', 'hero', { gold: 0 });
  const hosts = Array.from({ length: 35 }, (_, i) => ent(`h${i}`, i % 2 ? 'hero' : 'villain', { gold: 1e6 }));
  hosts[0].level = 10; Lr.upgradeBuilding(hosts[0], 'taller', T0 - HOUR);
  Lr.syncWorkshop(hosts[0], T0); const before = hosts[0].lair.workshop.stored;
  const r1 = Lr.visit(w, v, hosts[0], T0);
  assert.ok(r1.ok && r1.gold === S.missionReward(4, 1).gold && r1.xp === 5);
  assert.equal(hosts[0].lair.guestbook[0].id, 'p0');
  assert.equal(hosts[0].lair.applause.voters.length, 1);
  assert.ok(r1.hostTip > 0 && hosts[0].lair.renown === 1);
  // potenciador +1% durante 1 h
  Lr.syncWorkshop(hosts[0], T0 + HOUR); const after = hosts[0].lair.workshop.stored;
  assert.ok(Math.abs((after - before) - Lr.workshopRate(hosts[0]) * 1.01) < 0.01);
  // repetir el mismo anfitrión no paga
  assert.equal(Lr.visit(w, v, hosts[0], T0).repeat, true);
  let gold = 0, renown = 0;
  for (let i = 1; i < 35; i++) { const r = Lr.visit(w, v, hosts[i], T0); gold += r.gold ? 1 : 0; renown += r.renown; }
  assert.equal(gold, 9);
  assert.equal(renown, 20);
  // al día siguiente se resetea
  assert.ok(Lr.visit(w, v, hosts[0], T0 + DAY).gold > 0);
});

test('racha: 3 visitas/día; escudo semanal; premio a los 7 días', () => {
  const w = world();
  const v = ent('p0', 'hero');
  const hosts = Array.from({ length: 3 }, (_, i) => ent(`h${i}`, 'villain'));
  for (const h of hosts) { So.addFriend(v, h, T0); So.acceptFriend(h, v, T0); }
  // La racha del día pide 3 visitas y 1 regalo.
  const day = (d) => { for (const h of hosts) Lr.visit(w, v, h, T0 + d * DAY); So.sendGift(w, v, hosts[0], T0 + d * DAY); };
  for (let d = 0; d < 3; d++) day(d);
  assert.equal(v.lair.streak.count, 3);
  day(4); // saltea el día 3 → usa escudo
  assert.equal(v.lair.streak.count, 4);
  assert.equal(v.lair.streak.shields, 0);
  for (let d = 5; d < 8; d++) day(d);
  assert.equal(v.lair.streak.count, 7);
  assert.ok(v.lair.inventory.some((i) => i.id === 'trofeo_racha'));
});

test('grilla: límites, superposición, apilado y set completo', () => {
  const e = ent('a', 'hero');
  const uid = (id) => Lr.grantItem(e, id);
  assert.ok(Lr.placeItem(e, uid('mesa'), 0, 0, 0, 0).ok);               // ocupa (0,0)-(1,0)
  assert.equal(Lr.placeItem(e, uid('sillon'), 0, 1, 0, 0).error, 'casilla_ocupada');
  assert.equal(Lr.placeItem(e, uid('sillon'), 0, 7, 0, 0).error, 'fuera_de_sala');
  assert.ok(Lr.placeItem(e, e.lair.inventory.find((i) => i.id === 'sillon').uid, 0, 7, 0, 1).ok); // rotado 1×2 entra
  const lamp = uid('lampara');
  assert.ok(Lr.placeItem(e, lamp, 0, 1, 0, 0).stacked);                  // lámpara sobre la mesa
  assert.equal(Lr.placeItem(e, uid('candelabro'), 0, 1, 0, 0).error, 'casilla_ocupada');
  const base = Lr.prestige(e).total;
  assert.ok(Lr.placeItem(e, uid('gato'), 0, 3, 3, 0).ok);                // completa "Rincón acogedor"
  const p = Lr.prestige(e);
  assert.equal(p.sets[0].id, 'rincon');
  assert.ok(p.total > base + 5);
  // quitar la mesa baja también la lámpara
  const mesa = e.lair.placed.find((x) => x.id === 'mesa').uid;
  assert.equal(Lr.removeItem(e, mesa).removed, 2);
});

test('tienda rotativa: determinística por día, filtra facción, reciclaje 25%', () => {
  const w = world();
  const h = ent('a', 'hero', { gold: 1e6 }), v = ent('b', 'villain');
  const s1 = Lr.dailyShop(w, h, T0).map((i) => i.id), s2 = Lr.dailyShop(w, h, T0 + HOUR).map((i) => i.id);
  assert.deepEqual(s1, s2);
  assert.ok(!Lr.dailyShop(w, v, T0).some((i) => i.faction === 'hero'));
  const r = Lr.buyItem(w, h, 'mesa', T0);
  assert.ok(r.ok);
  assert.equal(Lr.recycleItem(h, r.uid).gold, Math.floor(150 * 0.25));
  assert.equal(Lr.buyItem(w, h, 'trofeo_racha', T0).error, 'no_disponible_hoy');
});

test('fachada: flujo de guarida y migración de partida v1', () => {
  const storage = memoryStorage(), clock = createClock(() => T0);
  const g = createGame({ storage, clock, seed: 5 });
  g.newCharacter('Tester', 'villain');
  const sug = g.visitSuggestions().list;
  assert.ok(sug.length >= 10);
  const v = g.visit(sug[0].id);
  assert.ok(v.ok && v.gold > 0 && v.lair.rooms.length >= 1);
  assert.ok(g.lair().visits.today === 1);
  // simular un save v1
  const w = g.debug.world();
  const v1 = JSON.parse(JSON.stringify(w)); v1.version = 1;
  for (const e of Object.values(v1.entities)) delete e.lair;
  storage.setItem('oathbreak.save', JSON.stringify(v1));
  const g2 = createGame({ storage, clock });
  assert.ok(g2.state().ok);
  assert.ok(g2.lair().ok);
});
