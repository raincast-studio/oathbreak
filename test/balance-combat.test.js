// Balance de combate como asserts: triángulo de builds sin dominante.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matrix } from '../sim/model.js';

const between = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what}: ${x.toFixed?.(3) ?? x} fuera de [${lo}, ${hi}]`);

test('combate: ninguna build le gana a todas, todas las razonables son jugables, sin ventaja por atacar', () => {
  for (const gold of [4000, 15000, 60000]) {
    const m = matrix(gold, 400);
    assert.deepEqual(m.dominant, [], `con ${gold} oro hay una build que le gana a todas: ${m.dominant}`);
    for (const [k, v] of Object.entries(m.fieldAvg)) between(v, 0.38, 0.66, `${k} contra el campo con ${gold} oro`);
    for (const k of ['pura_fue', 'pura_def', 'pura_agi', 'pura_res']) assert.ok(m.rows[k].wr <= 0.6, `${k} con ${gold} oro: ${m.rows[k].wr}`);
    between(m.mirrorAtk, 0.45, 0.55, `espejo atacante con ${gold} oro`);
  }
});
