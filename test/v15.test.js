// v15: eventos rotativos, cofres extra del pase, costo de atributos sin bajadas, estado de interfaz en la partida,
// tope de solicitudes de bots y arte para todo el catálogo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, HOUR, DAY } from '../src/config.js';
import { createClock, memoryStorage, weekKey } from '../src/core.js';
import * as C from '../src/character.js';
import * as Se from '../src/season.js';
import { weekendEvent } from '../src/events.js';
import { ITEMS } from '../src/catalog.js';
import { createGame } from '../src/game.js';

const MON = Date.UTC(2026, 9, 19, 3);
const newGame = (seed = 7) => {
  const clock = createClock(() => MON + 12 * HOUR);
  const g = createGame({ storage: memoryStorage(), clock, seed });
  g.newCharacter('Tester', 'hero');
  return { g, clock, w: g.debug.world() };
};

test('eventos: rotan 3 distintos en 3 fines de semana seguidos y no hay evento entre semana', () => {
  const sat = Date.UTC(2026, 9, 24, 15);
  const ids = [0, 1, 2].map((k) => weekendEvent(sat + k * 7 * DAY).id);
  assert.equal(new Set(ids).size, 3, ids.join());
  assert.equal(weekendEvent(sat + 2 * DAY), null); // lunes
  assert.equal(weekendEvent(sat).id, weekendEvent(sat + DAY).id); // sábado y domingo, el mismo
  assert.equal(weekKey(sat), weekKey(sat + DAY));
});

test('pase: después del escalón 30 hay cofres extra (oro + renombre) cada gloryPerExtra', () => {
  const p = C.createEntity({ id: 'p', name: 'p', faction: 'hero', now: MON });
  const full = CFG.season.tiers * CFG.season.gloryPerTier;
  Se.addGlory(p, 'daily', MON, (full + 2 * CFG.season.gloryPerExtra) / CFG.season.glory.daily);
  const st = Se.seasonStatus(p, MON);
  assert.equal(st.reached, CFG.season.tiers);
  assert.equal(st.extraReached, 2);
  const g0 = p.gold, r0 = p.lair.renown;
  assert.ok(Se.claimTier(p, CFG.season.tiers + 1, MON).ok);
  assert.ok(p.gold > g0 && p.lair.renown > r0);
  assert.equal(Se.claimTier(p, CFG.season.tiers + 3, MON).error, 'escalon_bloqueado');
});

test('atributos: ningún punto cuesta menos que el anterior (mezcla de multiplicadores)', () => {
  for (const s of CFG.stats) {
    let prev = 0;
    for (let t = 20; t < 60; t++) {
      const c = C.statCost({ stats: { fue: t, def: 0, agi: 0, res: 0 }, gear: {} }, s);
      assert.ok(c >= prev, `${s} punto ${t}: ${c} < ${prev}`);
      prev = c;
    }
  }
});

test('estado de interfaz en la partida: solo claves conocidas y chicas', () => {
  const { g } = newGame();
  assert.ok(g.setUi('tutorial', { mission: true }).ok);
  assert.deepEqual(g.uiState().ui.tutorial, { mission: true });
  assert.equal(g.setUi('otra', 1).error, 'clave_invalida');
  assert.equal(g.setUi('tutorial', 'x'.repeat(400)).error, 'valor_muy_grande');
});

test('solicitudes de bots: como mucho CFG.social.maxBotRequestsPending pendientes', () => {
  const { g, clock } = newGame();
  clock.advance(5 * DAY); g.state();
  assert.ok(g.friends().requests.length <= CFG.social.maxBotRequestsPending, `${g.friends().requests.length}`);
});

test('arte: cada objeto del catálogo (salvo pisos y paredes, que son patrones) tiene dibujo', async () => {
  const { artMarkup, FLOOR_BG, WALL_BG } = await import('../ui/art.js');
  for (const it of ITEMS) {
    if (it.cat === 'piso') assert.ok(FLOOR_BG[it.id], it.id);
    else if (it.cat === 'pared') assert.ok(WALL_BG[it.id], it.id);
    else assert.match(artMarkup(it.id) ?? '', /^<svg /, it.id);
  }
});
