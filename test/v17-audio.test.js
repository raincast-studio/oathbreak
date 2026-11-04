// v17: sonido procedural. En Node (sin window ni AudioContext) el módulo se importa y todo es no-op.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);

test('audio.js se importa sin window/AudioContext y todo es no-op', async () => {
  assert.equal(typeof globalThis.window, 'undefined');
  const a = await import('../ui/audio.js');
  assert.equal(a.supported(), false);
  assert.equal(a.canVibrate(), false);
  assert.deepEqual(a.prefs(), { sound: true, music: false, vibe: true }); // sonido sí, música no, vibración sí
  for (const n of ['tap', 'tab', 'open', 'close', 'coin', 'coins', 'hit', 'hurt', 'crit', 'dodge', 'win', 'lose', 'levelup', 'evolve', 'quest', 'gift', 'notify', 'error', 'buy', 'place', 'build', 'nada']) a.sfx(n, { ms: 600, at: 0.1 });
  a.cmdSfx('claimMission', true); a.cmdSfx('buyItem', false); a.vibe(30);
  a.setPref('music', true); a.setPref('music', false); a.setPref('inventada', true);
  assert.deepEqual(a.prefs(), { sound: true, music: false, vibe: true });
  assert.deepEqual(a.audioState(), { ctx: 'none', music: false });
});

test('audio.js: liviano, sin archivos de audio y con su propia clave de preferencias', () => {
  assert.ok(statSync(new URL('ui/audio.js', ROOT)).size <= 15 * 1024);
  const src = readFileSync(new URL('ui/audio.js', ROOT), 'utf8');
  assert.doesNotMatch(src, /\.(mp3|ogg|wav|m4a)\b|^import /m);
  assert.match(src, /'oathbreak\.device'/);
  assert.match(readFileSync(new URL('sw.js', ROOT), 'utf8'), /'ui\/audio\.js'/);
});
