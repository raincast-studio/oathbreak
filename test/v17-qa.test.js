// v17-qa: carga. index.html precarga (modulepreload) exactamente el grafo estático de ui/main.js, el service worker guarda
// todos esos módulos (sin conexión no puede faltar ninguno) y los avisos de la nube apuntan a lo mismo que ui/cloud.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

function graph(entry) {
  const seen = new Set(), q = [entry];
  while (q.length) {
    const f = q.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    const deps = [...read(f).matchAll(/^\s*(?:import|export)\s[^;]*?from\s*'([^']+)'|^\s*import\s*'([^']+)'/gms)]
      .map((m) => m[1] ?? m[2]).filter((s) => s.startsWith('.'));
    q.push(...deps.map((d) => normalize(join(dirname(f), d))));
  }
  return seen;
}

const html = read('index.html');
const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);

test('index.html precarga todo el grafo de ui/main.js, sin sobrantes', () => {
  const g = graph('ui/main.js');
  const local = preloads.filter((u) => !/^https?:/.test(u));
  assert.deepEqual([...local].sort(), [...g].sort());
  assert.equal(local[0], 'ui/main.js', 'main.js primero');
  assert.match(html, /<script type="module" src="ui\/main\.js"><\/script>/);
});

test('el service worker guarda cada módulo del grafo', () => {
  const sw = read('sw.js');
  for (const f of graph('ui/main.js')) assert.ok(sw.includes(`'${f}'`), `${f} falta en SHELL de sw.js`);
});

test('preconnect y modulepreload de la nube coinciden con ui/cloud.js', () => {
  const cloud = read('ui/cloud.js');
  const lib = cloud.match(/const LIB = '([^']+)'/)[1];
  const url = cloud.match(/const URL = '([^']+)'/)[1];
  assert.ok(preloads.includes(lib), `falta <link rel="modulepreload" href="${lib}">`);
  assert.ok(html.includes(`<link rel="preconnect" href="${url}" crossorigin>`));
  assert.ok(html.includes(`<link rel="preconnect" href="${new URL(lib).origin}" crossorigin>`));
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(csp.includes(new URL(lib).origin), 'la CSP permite la librería');
});

test('pantalla de carga: está en index.html y boot() la quita', () => {
  assert.match(html, /<div id="boot" class="boot" role="status">/);
  assert.match(read('ui/main.js'), /getElementById\('boot'\)\?\.remove\(\)/);
});
