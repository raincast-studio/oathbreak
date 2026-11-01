// 31/10: plan de la revisión experta (primera hora, guardado, escudo, venganza, evento, invitaciones).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, HOUR, DAY } from '../src/config.js';
import { createClock, memoryStorage, dayKey } from '../src/core.js';
import * as C from '../src/character.js';
import * as S from '../src/systems.js';
import { createGame } from '../src/game.js';

const MON = Date.UTC(2026, 9, 19, 3);
const newGame = (seed = 7, t = MON + 12 * HOUR) => {
  const storage = memoryStorage(), clock = createClock(() => t);
  const g = createGame({ storage, clock, seed });
  g.newCharacter('Tester', 'hero');
  return { g, storage, clock, w: g.debug.world() };
};

test('primera hora: los bots arrancan calibrados y la presa es de tu nivel o menor', () => {
  let wins = 0, n = 60;
  for (let s = 1; s <= n; s++) {
    const { g } = newGame(s);
    const L = g.targets().list.filter((t) => !t.block);
    const prey = L.find((t) => t.prey);
    if (prey) assert.ok(prey.level <= 1, `presa de Nv ${prey.level}`);
    const r = g.attack((prey ?? L[0]).id);
    if (r.report.winner === 'attacker') wins++;
  }
  assert.ok(wins / n >= 0.65, `primera pelea ganada ${wins}/${n}`);
  assert.equal(newGame().g.state().player.gold, CFG.start.gold);
});

test('objetivos del día: no toca "Cobrá el Taller" sin Taller ni "Mandá 2 regalos" sin 2 amigos', () => {
  for (let s = 1; s <= 40; s++) {
    const ids = newGame(s).g.daily().list.map((o) => o.id);
    assert.ok(!ids.includes('workshop') && !ids.includes('gift'), ids.join());
  }
});

test('venganza: nunca la bloquea el tope de ataques recibidos', () => {
  const { g, w } = newGame();
  const p = w.entities.p0, b = Object.values(w.entities).find((e) => e.isBot && e.faction === 'villain');
  p.revenge = [{ id: b.id, name: b.name, ts: g.state().now, used: false }];
  b.received = { day: dayKey(g.state().now), count: 99, bots: 0 };
  assert.equal(S.attackBlock(p, b, g.state().now), null);
});

test('escudo de novato: se retira de a poco (1, 2 y 3 ataques por día en Nv 5, 6 y 7)', () => {
  const e = C.createEntity({ id: 'p', name: 'p', faction: 'hero', now: MON });
  assert.equal(S.shieldInfo(e).mode, 'full');
  for (const [lvl, cap] of [[5, 1], [6, 2], [7, 3], [8, CFG.pvp.maxReceivedPerDay]]) {
    e.level = lvl;
    assert.equal(S.receiveCap(e, false), cap, `Nv ${lvl}`);
    assert.equal(S.receiveCap(e, true), Math.min(cap, CFG.pvp.maxBotAttacksPerDay));
  }
  assert.equal(S.shieldInfo(e).mode, 'none');
});

test('guardado: queda bajo el tope de la nube y los informes viejos pierden las rondas', () => {
  const { g, storage, clock } = newGame();
  for (let d = 0; d < 5; d++) for (let s = 0; s < 4; s++) { clock.advance(6 * HOUR); let r; do r = g.hunt(); while (r.ok); }
  const kb = storage.getItem('oathbreak.save').length / 1024;
  assert.ok(kb < 160, `${kb.toFixed(0)} KB`);
  const ib = g.inbox().list;
  assert.ok(ib.length <= CFG.reports.max && ib.slice(CFG.reports.detailed).every((x) => x.report.rounds === null));
});

test('evento de fin de semana: activo sábado y domingo (ART)', () => {
  const sat = Date.UTC(2026, 9, 24, 15), mon = Date.UTC(2026, 9, 26, 15);
  assert.ok(S.weekendEvent(sat));
  assert.equal(S.weekendEvent(mon), null);
});

test('invitación: el bono de bienvenida se cobra una vez y valida el código', () => {
  const { g } = newGame();
  const g0 = g.state().player.gold;
  assert.equal(g.welcomeBonus('x!').error, 'codigo_invalido');
  assert.ok(g.welcomeBonus('ABC123').ok);
  assert.equal(g.state().player.gold, g0 + CFG.referral.newGold);
  assert.equal(g.welcomeBonus('ABC123').error, 'ya_cobrado');
});
