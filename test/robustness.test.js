// Validación de entradas, guardados, semanas, objetivos, escaparate y casos borde señalados en la revisión.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, MIN, HOUR, DAY } from '../src/config.js';
import { createClock, memoryStorage, dayKey, weekKey, SAVE_KEY, BACKUP_KEY } from '../src/core.js';
import * as C from '../src/character.js';
import * as S from '../src/systems.js';
import * as Lr from '../src/lair.js';
import { createGame } from '../src/game.js';
import { summary } from '../src/reports.js';

const MON = Date.UTC(2026, 9, 19, 3); // lunes 19/10/2026 00:00 ART
const newGame = (t = MON + 12 * HOUR, seed = 7) => {
  const storage = memoryStorage(), clock = createClock(() => t);
  const g = createGame({ storage, clock, seed });
  g.newCharacter('Tester', 'hero');
  return { g, storage, clock };
};

test('fachada: montos, ids y claves inválidas no rompen la economía', () => {
  const { g } = newGame();
  const gold0 = g.state().player.gold;
  for (const bad of [NaN, Infinity, -5, 0, 1.5, '10', null, undefined]) {
    assert.equal(g.deposit(bad).ok, false, `deposit(${bad})`);
    assert.equal(g.withdraw(bad).ok, false, `withdraw(${bad})`);
  }
  for (const k of ['toString', '__proto__', 'constructor', 'hasOwnProperty']) {
    assert.equal(g.upgradeBuilding(k).ok, false);
    assert.equal(g.buyGear(k, 1).ok, false);
    assert.equal(g.buyStat(k).ok, false);
    assert.equal(g.attack(k).ok, false);
    assert.equal(g.visit(k).ok, false);
    assert.equal(g.buyRenownItem(k).ok, false);
    assert.equal(g.claimDaily(k).ok, false);
  }
  assert.equal(g.buyGear('arma', '1').ok, false);
  assert.equal(g.buyGear('arma', 1.5).ok, false);
  const p = g.state().player;
  assert.equal(p.gold, gold0);
  assert.ok(Number.isFinite(p.gold) && Number.isFinite(p.bank));
});

test('grilla: coordenadas fraccionarias, NaN, sala como texto y rotación no entera se rechazan', () => {
  const { g } = newGame();
  g.debug.world().entities.p0.gold = 1e6;
  const uid = g.buyItem('mesa').uid;
  for (const [room, x, y, rot] of [[0, 0.001, 0, 0], [0, NaN, 0, 0], ['0', 0, 0, 0], [0, 0, 0, 0.5], [0, -1, 0, 0], [9, 0, 0, 0], [0, 0, 0, 7]])
    assert.equal(g.placeItem(uid, room, x, y, rot).error, 'posicion_invalida', JSON.stringify([room, x, y, rot]));
  assert.ok(g.placeItem(uid, 0, 0, 0, 0).ok);
  const uid2 = g.buyItem('mesa').uid;
  assert.equal(g.placeItem(uid2, 0, 1, 0, 0).error, 'casilla_ocupada');
});

test('guardados: versión futura y corrupto bloquean y no se pisan; migración desde v2', () => {
  for (const raw of [JSON.stringify({ version: 99, entities: {} }), '{no es json']) {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, raw);
    const g = createGame({ storage, clock: createClock(() => MON) });
    assert.ok(g.saveIssue());
    assert.equal(g.newCharacter('Tester', 'hero').ok, false);
    assert.equal(storage.getItem(SAVE_KEY), raw); // intacto
    g.debug.discardBadSave();
    assert.equal(storage.getItem(BACKUP_KEY), raw); // respaldado antes de descartar
    assert.ok(g.newCharacter('Tester', 'hero').ok);
  }
  // v2 → v3
  const { g, storage, clock } = newGame();
  const w = JSON.parse(g.debug.exportSave());
  w.version = 2;
  for (const e of Object.values(w.entities)) { e.lair.rooms[0].floor = 'piso_piedra'; e.lair.applause = { week: 1, count: 3 }; delete e.lair.tips; }
  storage.setItem(SAVE_KEY, JSON.stringify(w));
  const g2 = createGame({ storage, clock });
  assert.equal(g2.saveIssue(), null);
  assert.ok(g2.lair().ok && g2.state().ok);
  assert.equal(g2.debug.world().entities.p0.lair.rooms[0].floor, null);
});

test('exportar e importar guardado', () => {
  const { g } = newGame();
  const json = g.debug.exportSave();
  const { g: g2 } = newGame(MON, 99);
  assert.ok(g2.debug.importSave(json).ok);
  assert.equal(g2.state().player.name, 'Tester');
  assert.equal(g2.debug.importSave('{"x":1}').ok, false);
});

test('consultas no escriben el guardado si el mundo no avanzó', () => {
  const { g, storage } = newGame();
  g.state();
  let writes = 0;
  const orig = storage.setItem;
  storage.setItem = (k, v) => { writes++; orig(k, v); };
  for (let i = 0; i < 10; i++) { g.state(); g.lair(); g.targets(); g.daily(); g.showcase(); }
  assert.equal(writes, 0);
  g.startMission('h1');
  assert.equal(writes, 1);
});

test('las consultas no modifican el mundo ni exponen referencias vivas', () => {
  const { g, clock } = newGame();
  g.debug.world().entities.p0.gold = 1e6;
  g.upgradeBuilding('taller');
  clock.advance(5 * HOUR);
  g.state(); // materializa el tiempo
  const before = JSON.stringify(g.debug.world());
  for (const q of ['state', 'lair', 'targets', 'daily', 'showcase', 'visitSuggestions', 'inbox', 'contracts', 'shop', 'lairShop', 'renownShop']) g[q]();
  assert.equal(JSON.stringify(g.debug.world()), before);
  const st = g.state();
  st.player.stats.fue = 500;
  g.startMission('h1');
  assert.notEqual(g.debug.world().entities.p0.stats.fue, 500);
});

test('semana de lunes a domingo en ART', () => {
  assert.equal(weekKey(MON), weekKey(MON + 6 * DAY + 23 * HOUR));       // domingo 23 h: misma semana
  assert.equal(weekKey(MON + 7 * DAY), weekKey(MON) + 1);               // lunes siguiente 00:00
  assert.equal(weekKey(MON - 1), weekKey(MON) - 1);                     // domingo anterior 23:59
  assert.equal(dayKey(MON), dayKey(MON + DAY - 1));
});

test('Taller: no paga retroactivo al subir de nivel', () => {
  const e = C.createEntity({ id: 'a', name: 'a', faction: 'hero', now: MON, isBot: true });
  e.gold = 1e6;
  Lr.upgradeBuilding(e, 'taller', MON);
  const rate1 = Lr.workshopRate(e);
  e.mission = { start: MON, end: MON + 11 * HOUR, reward: { gold: 0, xp: 1e6 } };
  S.claimMission(e, MON + 11 * HOUR); // sube muchos niveles
  assert.ok(e.level > 10);
  assert.equal(Math.floor(e.lair.workshop.stored), Math.floor(rate1 * 11));
});

test('potenciadores del Taller no se acumulan sin Taller', () => {
  const w = { seed: 1, seq: 0, playerId: 'x', entities: {}, inbox: [] };
  const h = C.createEntity({ id: 'h', name: 'h', faction: 'hero', now: MON, isBot: true });
  for (let i = 0; i < 200; i++) {
    const v = C.createEntity({ id: `v${i}`, name: 'v', faction: 'villain', now: MON, isBot: true });
    Lr.visit(w, v, h, MON + i * HOUR);
  }
  assert.ok(h.lair.boosts.length <= CFG.lair.visit.hostBoostMax);
});

test('piso: el comprado vuelve al inventario al reemplazarlo; exclusivos no se reciclan', () => {
  const e = C.createEntity({ id: 'a', name: 'a', faction: 'hero', now: MON, isBot: true });
  const u1 = Lr.grantItem(e, 'piso_piedra');
  Lr.placeItem(e, u1, 0, 0, 0, 0);
  const u2 = Lr.grantItem(e, 'piso_marmol');
  Lr.placeItem(e, u2, 0, 0, 0, 0);
  assert.ok(e.lair.inventory.some((i) => i.id === 'piso_piedra'));
  const t = Lr.grantItem(e, 'trofeo_racha');
  assert.equal(Lr.recycleItem(e, t).error, 'no_reciclable');
});

test('PvP: rango simétrico, novatos protegidos, banda de poder', () => {
  const mk = (id, f, lvl, isBot = true) => Object.assign(C.createEntity({ id, name: id, faction: f, now: MON, isBot }), { level: lvl });
  assert.equal(S.inRange(mk('a', 'hero', 20), mk('b', 'villain', 16)), S.inRange(mk('b', 'villain', 16), mk('a', 'hero', 20)));
  const novato = mk('n', 'villain', 3, false);
  assert.equal(S.attackBlock(mk('a', 'hero', 3), novato, MON), 'novato_protegido');
  const a = mk('a', 'hero', 10), b = mk('b', 'villain', 10);
  assert.ok(['parejo', 'debil', 'fuerte'].includes(S.powerBand(a, b)));
  b.stats = { fue: 40, def: 30, agi: 30, res: 30 };
  assert.equal(S.powerBand(a, b), 'muy_fuerte');
  assert.equal(S.powerBand(b, a), 'debil');
});

test('informe: la razón y el % de vida son coherentes', () => {
  const w = { seed: 3, seq: 0, playerId: 'p0', entities: {}, inbox: [] };
  for (let i = 0; i < 300; i++) {
    const a = C.createEntity({ id: 'p0', name: 'A', faction: 'hero', now: MON, isBot: true });
    const d = C.createEntity({ id: 'b', name: 'D', faction: 'villain', now: MON, isBot: true });
    a.stats = { fue: 10, def: 5, agi: 8, res: 20 }; d.stats = { fue: 12, def: 9, agi: 6, res: 9 };
    w.entities = { p0: a, b: d };
    const r = S.pvp(w, a, d, MON + i).report;
    if (r.reason === 'DAMAGE') {
      const winPct = r.dealtPct[r.winner], losePct = r.dealtPct[r.winner === 'attacker' ? 'defender' : 'attacker'];
      assert.ok(winPct >= losePct, `gana con ${winPct}% contra ${losePct}%`);
    }
    const text = summary(r, 'p0').join('\n');
    assert.match(text, /Vida quitada: vos \d+% · rival \d+%/);
  }
});

test('objetivos diarios: progreso, cobro y bono', () => {
  const { g } = newGame();
  const d = g.daily();
  assert.equal(d.list.length, 3);
  g.claimDaily('inexistente'); // un comando materializa los objetivos del día en el mundo
  const w = g.debug.world(), p = w.entities.p0;
  for (const o of d.list) p.daily.progress[o.id] = o.target;
  assert.equal(g.claimDaily('bonus').error, 'objetivos_incompletos');
  for (const o of d.list) assert.ok(g.claimDaily(o.id).ok);
  assert.equal(g.claimDaily(d.list[0].id).error, 'ya_cobrado');
  const r0 = p.lair.renown;
  assert.ok(g.claimDaily('bonus').ok);
  assert.equal(p.lair.renown, r0 + CFG.daily.bonusRenown);
  g.debug.toNext('day');
  assert.ok(g.daily().list.every((o) => !o.claimed));
});

test('escaparate: un jugador inactivo no gana; premio semanal al top 3 por facción', () => {
  const { g } = newGame();
  for (let i = 0; i < 7; i++) { g.debug.advance(DAY); g.state(); }
  const list = g.showcase().list;
  const me = list.findIndex((x) => x.id === 'p0');
  assert.ok(me > 10, `jugador inactivo quedó en el puesto ${me + 1}`);
  assert.ok(g.state().lastPrize?.winners.length === 6);
  const w = g.debug.world();
  const winner = w.entities[w.lastPrize.winners[0].id];
  assert.ok(winner.lair.owned.marco_honor);
});

test('visitas: anfitrión recibe propina y renombre; aplauso único por visitante por semana', () => {
  const w = { seed: 1, seq: 0, playerId: 'x', entities: {}, inbox: [] };
  const h = C.createEntity({ id: 'h', name: 'h', faction: 'hero', now: MON, isBot: true });
  const v = C.createEntity({ id: 'v', name: 'v', faction: 'villain', now: MON, isBot: true });
  const g0 = h.gold;
  const r = Lr.visit(w, v, h, MON);
  assert.ok(r.hostTip > 0 && h.gold === g0 + r.hostTip && h.lair.renown === 1);
  Lr.visit(w, v, h, MON + DAY);
  assert.equal(h.lair.applause.voters.length, 1);
});

test('tienda de renombre', () => {
  const { g } = newGame();
  const p = g.debug.world().entities.p0;
  assert.equal(g.buyRenownItem('farol_aurora').error, 'renombre_insuficiente');
  p.lair.renown = 30;
  const r = g.buyRenownItem('farol_aurora');
  assert.ok(r.ok && p.lair.renown === 5);
  assert.equal(g.buyRenownItem('mesa').error, 'item_invalido');
});

test('bots: el resultado no depende de cada cuánto se consulta', () => {
  const run = (stepH) => {
    const { g, clock } = newGame(MON, 11);
    for (let t = 0; t < 48; t += stepH) { clock.advance(stepH * HOUR); g.state(); }
    const w = g.debug.world();
    return Object.values(w.entities).filter((e) => e.isBot).map((b) => b.level + ':' + b.gold + ':' + b.rep).join('|');
  };
  assert.equal(run(1), run(24));
});
