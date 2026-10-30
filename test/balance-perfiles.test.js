// Otros perfiles: casual (saltea días), builds sesgadas, elegir objetivo y decorador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProfile, summarize, PROFILES } from '../sim/model.js';

const between = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what}: ${x.toFixed?.(3) ?? x} fuera de [${lo}, ${hi}]`);

test('casual 90 días: progresa y no queda aplastado', () => {
  const log = runProfile(PROFILES.casual, 90), s = summarize(log);
  between(s.lvlAt(3), 6, 11, 'nivel día 3');
  for (const d of [30, 60, 90]) between(log[d - 1].wr7, 0.38, 0.62, `winrate día ${d}`);
  assert.ok(log[89].lvl >= 35, `nivel día 90: ${log[89].lvl}`);
});

test('ninguna build se escapa del emparejamiento (60 días)', () => {
  for (const name of ['fue_res', 'agi_def', 'sesgado']) {
    const log = runProfile(PROFILES[name], 60);
    for (const d of [30, 60]) between(log[d - 1].wr7, 0.38, 0.62, `${name} winrate día ${d}`);
  }
});

test('elegir objetivo rinde más que cazar al azar (botín, presas)', () => {
  const a = runProfile(PROFILES.activo, 30), e = runProfile(PROFILES.elector, 30);
  const pvpGold = (log) => log[29].lootIn + log[29].preyGold;
  assert.ok(pvpGold(e) >= pvpGold(a) * 1.2, `elector ${pvpGold(e)} vs azar ${pvpGold(a)}`);
  assert.ok(e[29].preys >= 20 && a[29].preys === 0, 'la presa hay que ir a buscarla');
});

test('decorador: llega al podio del escaparate y usa la tienda de renombre', () => {
  const log = runProfile(PROFILES.decorador, 30);
  assert.ok(log[29].prestige >= 100, `prestigio ${log[29].prestige}`);
  assert.ok(log[29].showcaseRank <= 3, `puesto ${log[29].showcaseRank}`);
});
