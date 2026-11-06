// v17 fix-mundo: piso de rivales y bono de regreso (B2), multipestaña (B1), pase visible con catch-up, ranking con la
// fila propia, guerra de facciones creíble (B9) y bots calibrados contra quien los ataca (B10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, HOUR, DAY } from '../src/config.js';
import { createClock, memoryStorage } from '../src/core.js';
import * as S from '../src/systems.js';
import * as BL from '../src/bots.js';
import { createGame } from '../src/game.js';

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
