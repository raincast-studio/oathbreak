// v15.1 (revisión técnica): rendimiento sin cambiar el balance (resultados idénticos bit a bit), memo de winChance,
// ponerse al día de a tramos, aviso de energía con la Enfermería, PWA (manifiesto en <head>, archivos del service worker)
// y cifras compactas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { CFG, HOUR } from '../src/config.js';
import { createClock, memoryStorage, mulberry32 } from '../src/core.js';
import * as C from '../src/character.js';
import * as S from '../src/systems.js';
import { resolveCombat } from '../src/combat.js';
import { createGame } from '../src/game.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const T0 = Date.UTC(2026, 9, 19, 15);
const rngStats = (rng) => ({ fue: rng.int(1, 200), def: rng.int(0, 200), agi: rng.int(0, 200), res: rng.int(1, 200) });
const fighter = (st) => { const hp = 50 + st.res * 8; return { stats: st, hp, maxHp: hp }; };

test('combate: con y sin detalle por rondas da el mismo resultado (mismas tiradas)', () => {
  const rng = mulberry32(11);
  for (let i = 0; i < 3000; i++) {
    const A = fighter(rngStats(rng)), D = fighter(rngStats(rng));
    if (i % 5 === 0) D.stats.agi = A.stats.agi; // empate de Agi: el orden se sortea
    const seed = rng.int(0, 2 ** 31);
    const full = resolveCombat(A, D, seed), lite = resolveCombat(A, D, seed, CFG.combat, false);
    assert.equal(lite.rounds.length, 0);
    const { rounds, ...rest } = full;
    assert.deepEqual({ ...lite, rounds: undefined }, { ...rest, rounds: undefined });
    // El detalle es coherente con el resultado: la última vida informada es la final.
    const last = rounds.at(-1);
    if (last) { assert.equal(last.hpA, Math.max(0, Math.round(full.hpEndA))); assert.equal(last.hpD, Math.max(0, Math.round(full.hpEndD))); }
  }
});

test('equipo: effStats y power en una pasada valen lo mismo que la suma pieza por pieza', () => {
  const rng = mulberry32(5);
  const slots = Object.keys(CFG.gear.slots);
  for (let i = 0; i < 300; i++) {
    const e = C.createEntity({ id: `g${i}`, name: 'g', faction: 'hero', now: T0 });
    e.stats = rngStats(rng);
    for (const s of slots) if (rng() < 0.7) { e.gear[s] = rng.int(1, CFG.gear.tiers.length); e.gearStat ??= {}; e.gearStat[s] = rng.pick(CFG.gear.slots[s]); }
    const naive = {};
    for (const st of CFG.stats) {
      let b = 0;
      for (const [slot, tier] of Object.entries(e.gear)) {
        const t = CFG.gear.tiers.find((x) => x.tier === tier), target = C.gearStatOf(e, slot);
        if (target === st || target === '*') b += C.tierBonus(t, target);
      }
      naive[st] = e.stats[st] + b;
    }
    assert.deepEqual(C.effStats(e), naive);
    for (const st of CFG.stats) assert.equal(C.effStat(e, st), naive[st]);
    assert.equal(C.power(e), Math.round(CFG.stats.reduce((a, s) => a + CFG.statCostMul[s] * naive[s], 0) * 10) / 10);
  }
});

test('winChance: la versión que corta antes (banda/tope) coincide con comparar el valor exacto, y retoma la cuenta parcial', () => {
  const rng = mulberry32(21);
  for (let i = 0; i < 400; i++) {
    const a = C.createEntity({ id: `wa${i}`, name: 'a', faction: 'hero', now: T0 }), d = C.createEntity({ id: `wd${i}`, name: 'd', faction: 'villain', now: T0 });
    a.stats = rngStats(rng); d.stats = rngStats(rng);
    const lo = rng.range(0.1, 0.7), hi = lo + 0.12;
    S.winChanceCacheClear();
    const band = S.winChanceBand(a, d, lo, hi);      // puede dejar una cuenta parcial en el memo
    const clamp = S.winChanceMap(a, d, (wc) => Math.min(1.4, Math.max(0.7, 1.6 - wc)));
    const exact = S.winChance(a, d);                  // retoma la parcial
    S.winChanceCacheClear();
    assert.equal(S.winChance(a, d), exact, 'la cuenta retomada da lo mismo que la completa');
    assert.equal(band, exact > hi ? 1 : exact < lo ? -1 : 0);
    assert.equal(clamp, Math.min(1.4, Math.max(0.7, 1.6 - exact)));
  }
});

test('winChance: el memo invalida al cambiar atributos o equipo y no crece sin tope', () => {
  S.winChanceCacheClear();
  const a = C.createEntity({ id: 'ma', name: 'a', faction: 'hero', now: T0 }), d = C.createEntity({ id: 'md', name: 'd', faction: 'villain', now: T0 });
  a.stats = { fue: 30, def: 10, agi: 10, res: 10 }; d.stats = { fue: 10, def: 10, agi: 30, res: 10 };
  const w1 = S.winChance(a, d);
  a.gear.arma = CFG.gear.tiers.length; // un arma grande cambia la chance: no puede salir del memo
  const w2 = S.winChance(a, d);
  S.winChanceCacheClear();
  assert.equal(S.winChance(a, d), w2);
  assert.notEqual(w1, w2);
  const rng = mulberry32(3);
  for (let i = 0; i < 4500; i++) { a.stats = rngStats(rng); S.winChanceBand(a, d, 0.4, 0.6, 2); }
  assert.ok(S.winChanceCacheSize() <= 4000, `memo: ${S.winChanceCacheSize()}`);
});

test('ponerse al día de a tramos deja el mundo idéntico a hacerlo de una vez (72 h y más)', () => {
  const run = (sliced) => {
    const st = memoryStorage(), clock = createClock(() => T0);
    const g = createGame({ storage: st, clock, seed: 9 });
    g.newCharacter('Tramos', 'villain');
    for (let i = 0; i < 4; i++) g.hunt();
    g.debug.advance(100 * HOUR);
    if (sliced) {
      let r, n = 0;
      do { r = g.catchUp(5); n++; assert.ok(r.ok); } while (r.pending);
      assert.ok(n >= 14, `tramos: ${n}`); // tope de 72 h en tramos de 5
      assert.equal(g.catchUp(5).hours, 0);
    }
    g.state();
    return st.getItem('oathbreak.save');
  };
  assert.equal(run(true), run(false));
  const g = createGame({ storage: memoryStorage(), clock: createClock(() => T0) });
  assert.equal(g.catchUp().error, 'sin_personaje');
  g.newCharacter('Otro', 'hero');
  assert.equal(g.catchUp(0).error, 'horas_invalidas');
  assert.deepEqual(g.catchUp(), { ok: true, hours: 0, pending: 0 });
});

test('energía llena: el aviso usa el ritmo de la Enfermería', () => {
  const clock = createClock(() => T0);
  const g = createGame({ storage: memoryStorage(), clock, seed: 2 });
  g.newCharacter('Enfermo', 'hero');
  const w = g.debug.world(), p = w.entities[w.playerId];
  p.lair.buildings = { ...(p.lair.buildings ?? {}), enfermeria: 5 };
  p.energy = 2; p.energyTs = clock.now();
  const st = g.state().player;
  const regen = CFG.lair.buildings.enfermeria.values[4];
  assert.equal(st.energyFullMs, st.nextEnergyMs + (st.energyMax - 3) * regen * 60_000);
  p.energy = st.energyMax;
  assert.equal(g.state().player.energyFullMs, 0);
});

test('PWA: manifiesto y metadatos en <head>, un solo </body>, íconos reales', () => {
  const html = read('index.html');
  const body = html.indexOf('<body');
  assert.ok(body > 0 && html.indexOf('</head>') < body);
  for (const tag of ['<link rel="manifest"', '<meta name="theme-color"', '<title>', '<link rel="apple-touch-icon"'])
    assert.ok(html.indexOf(tag) > 0 && html.indexOf(tag) < body, `${tag} fuera de <head>`);
  assert.equal(html.match(/<\/body>/g).length, 1);
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.id, '/oathbreak/');
  assert.equal(m.start_url, './'); assert.equal(m.scope, './'); assert.equal(m.display, 'standalone');
  for (const ic of m.icons) {
    const png = readFileSync(new URL(ic.src, ROOT));
    const [w, h] = ic.sizes.split('x').map(Number);
    assert.equal(png.readUInt32BE(16), w); assert.equal(png.readUInt32BE(20), h);
  }
  assert.ok(m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
});

test('service worker: guarda todos los módulos del juego y todas las etapas, y existen', () => {
  const sw = read('sw.js');
  const shell = JSON.parse(`[${sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].replace(/'/g, '"').replace(/,\s*$/, '')}]`);
  for (const f of shell) if (f !== './') assert.ok(existsSync(new URL(f, ROOT)), `falta ${f}`);
  const js = [...readdirSync(new URL('src/', ROOT)).map((f) => `src/${f}`), ...readdirSync(new URL('ui/', ROOT)).filter((f) => f.endsWith('.js')).map((f) => `ui/${f}`),
    ...readdirSync(new URL('ui/tabs/', ROOT)).map((f) => `ui/tabs/${f}`)].filter((f) => f.endsWith('.js'));
  for (const f of js) assert.ok(shell.includes(f), `${f} no está en el SHELL del service worker (sin conexión faltaría)`);
  for (const f of ['hero', 'villain']) for (let i = 1; i <= 10; i++) {
    const s = String(i).padStart(2, '0');
    assert.ok(existsSync(new URL(`ui/img/${f}/s${s}.webp`, ROOT)) && existsSync(new URL(`ui/img/${f}/s${s}_av.webp`, ROOT)));
  }
  assert.match(sw, /const VERSION = 'oathbreak-[^']+'/);
  // La página solo recarga cuando el jugador tocó "Actualizar" (no en la primera instalación).
  const ex = read('ui/extras.js');
  assert.match(ex, /controllerchange', \(\) => \{ if \(wantReload\)/);
});

test('cifras compactas: k y M sin "1.000k"', async () => {
  globalThis.addEventListener ??= () => {};
  globalThis.matchMedia ??= () => ({ matches: false });
  const { compact } = await import('../ui/kit.js');
  const got = [9999, 10000, 12449, 99960, 999499, 999500, 1234567, -15000].map(compact);
  assert.deepEqual(got, ['9.999', '10k', '12,4k', '100k', '999k', '1M', '1,2M', '-15k']);
});
