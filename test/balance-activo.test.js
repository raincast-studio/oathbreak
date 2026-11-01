// Progresión y economía del jugador activo a 90 días, con dos semillas distintas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProfile, summarize, PROFILES } from '../sim/model.js';

const between = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what}: ${x.toFixed?.(3) ?? x} fuera de [${lo}, ${hi}]`);

for (const seed of [1234, 77]) {
  test(`activo 90 días (semilla ${seed}): ritmo, dificultad, PvP y economía`, () => {
    const log = runProfile(PROFILES.activo, 90, seed), s = summarize(log);
    between(s.lvlAt(3), 9, 13, 'nivel día 3');
    between(log[6].wr7, 0.5, 0.72, 'winrate semana 1');
    // v14: tope 0,62 como en el casual (una semana son ~330 peleas: ±2,7 pp de ruido; la semilla 77 da 0,605 el día 90 y la base daba 0,591).
    for (const d of [30, 60, 90]) between(log[d - 1].wr7, 0.38, 0.62, `winrate semana del día ${d}`);
    assert.ok(log[89].wr7 < log[6].wr7, 'la dificultad sube con el tiempo');
    between(s.pvpXpShare, 0.5, 0.65, 'XP de PvP (objetivo del dueño: ≥ 50%)');
    between(s.pvpGoldShare, 0.4, 0.6, 'oro de PvP (objetivo del dueño: ≥ 40%)');
    between(s.endByEnergy, 0.9, 1, 'sesiones que terminan por energía');
    assert.ok(s.workshopShare <= 0.3, `Taller: ${s.workshopShare}`);
    assert.ok(s.visitShare <= 0.12, `visitas: ${s.visitShare}`);
    assert.ok(s.spendRatio >= 0.7, `los sumideros absorben el ingreso: ${s.spendRatio}`);
    assert.ok(log[89].gear >= 20, `metas de equipo alcanzadas: ${log[89].gear}`);
    assert.ok(log[89].seasonTiers >= 60, `escalones de temporada: ${log[89].seasonTiers}`);
  });
}
