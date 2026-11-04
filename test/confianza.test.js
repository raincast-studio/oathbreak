// v17 · Confianza: moderación de nombres (bloqueados, evasiones y permitidos), reportes, cola local y silenciar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOUR } from '../src/config.js';
import { createClock, memoryStorage } from '../src/core.js';
import { createGame } from '../src/game.js';
import * as M from '../src/moderation.js';

const MON = Date.UTC(2026, 9, 19, 3);
const newGame = () => {
  const storage = memoryStorage(), clock = createClock(() => MON + 12 * HOUR);
  const g = createGame({ storage, clock, seed: 7 });
  g.newCharacter('Tester', 'hero');
  return { g, storage, clock };
};

// [texto, categoría esperada]
const BLOCKED = [
  ['Puta', 'insulto'], ['Puto Amo', 'insulto'], ['Mierda', 'insulto'], ['Pelotudo', 'insulto'], ['Pendejo', 'insulto'], ['Cabrón', 'insulto'],
  ['Gilipollas', 'insulto'], ['Malparido', 'insulto'], ['Conchatumadre', 'insulto'], ['hdp', 'insulto'], ['Caralho', 'insulto'], ['Fodase', 'insulto'],
  ['Fuck', 'insulto'], ['Bitch', 'insulto'], ['Asshole', 'insulto'], ['Cunt', 'insulto'],
  ['Verga', 'sexual'], ['Culo', 'sexual'], ['Culos', 'sexual'], ['Porno', 'sexual'], ['Pedófilo', 'sexual'], ['Violador', 'sexual'], ['Orgía', 'sexual'],
  ['Buceta', 'sexual'], ['Pussy', 'sexual'], ['Hentai', 'sexual'],
  ['Maricón', 'odio'], ['Sudaca', 'odio'], ['Negrata', 'odio'], ['Viado', 'odio'], ['Nigga', 'odio'], ['Retrasado', 'odio'], ['Hitler', 'odio'],
  ['Nazi', 'odio'], ['Führer', 'odio'], ['KKK', 'odio'], ['Siegheil', 'odio'], ['卐 Lobo', 'odio'], ['Lobo1488', 'odio'], ['14 88', 'odio'],
  ['Suicida', 'autolesion'], ['KYS', 'autolesion'], ['Matate', 'autolesion'],
  ['Cocaína', 'drogas'], ['Heroin', 'drogas'], ['Fentanilo', 'drogas'], ['Narco', 'drogas'], ['Pasta Base', 'drogas'],
  ['Admin', 'reservado'], ['Administrador', 'reservado'], ['Moderador', 'reservado'], ['Soporte', 'reservado'], ['Staff', 'reservado'],
  ['Oficial', 'reservado'], ['OATHBREAK', 'reservado'], ['GM', 'reservado'], ['Game Master', 'reservado'],
];
// Evasiones: leetspeak, separadores, espacios intercalados, repetidas, mayúsculas, homoglifos, ancho completo e invisibles.
const EVASIONS = [
  'Put4', 'p.u.t.a', 'P U T A', 'p_u_t_a', 'pUuUtA', 'pút4', 'рutа' /* cirílico */, 'ＰＵＴＡ', 'pu​ta', 'Mier Da', 'M1erd4', 'm!erda',
  'H1tl3r', 'N4z1', 'h.i.t.l.e.r', 'Adm1n', '4dmin', 'a d m i n', 'S0porte', '0athbreaker', 'G.M.', 'Moderad0r', 'c.u.l.o', 'Kulo', 'Qulo',
  'Fukk', 'Sh1t', 'S3x', 'Asss', 'Hijo de Puta', 'Com Puta', 'puta123', 'VeeeRGA', 'C0ca1na', '$ud@ca',
];
// Permitidos: falsos positivos de subcadena (Scunthorpe) y nombres comunes en español y portugués.
const ALLOWED = [
  'Computadora', 'Computador', 'Diputado', 'Deputado', 'Disputa', 'Reputación', 'Imputado', 'Caputo', 'Esputo', 'Vergara', 'Maricarmen',
  'Penélope', 'Analía', 'Ana L', 'Kike', 'Paco', 'Heroína', 'Heroine', 'Georgia', 'Borgia', 'Nazareno', 'Ignazio', 'Badminton', 'Scunthorpe',
  'Assassin', 'As de Picas', 'Shitake', 'Ashita', 'Dickens', 'Hancock', 'Peacock', 'Cuervo Negro', 'Crack', 'Matatena', 'Grape', 'Rapero',
  'Therapist', 'Cumbia', 'Enviado', 'Aviadora', 'Pijama', 'Vehículo', 'Calculo', 'Canal', 'Sexto', 'Rei do Forró', 'Pica-Pau', 'Fagner',
  'Fagundes', 'Culiacán', 'Cusco', 'Concha', 'Narcolepsia', 'Mongolia', 'Nigeria', 'Sussex', 'Controlo', 'Ortopedia', 'Semental', 'Method',
  'Spicy', 'Joaokkkk', 'Cunha', 'Rocky88', 'Agente 007', 'Molecular', 'Peculiar', 'Pitágoras', 'Concepción', 'Encarnación', 'Mercedes',
  'Asunción', 'Fulgencio', 'Gonçalo', 'João', 'Conceição', 'Socorro', 'Dolores', 'Nazario', 'Tester', 'Kraken', 'Veneno', 'Dread',
];

test('moderación: ≥ 60 casos entre bloqueados, evasiones y permitidos', () => {
  assert.ok(BLOCKED.length + EVASIONS.length + ALLOWED.length >= 60);
});

test('moderación: bloquea insultos, sexual, odio, autolesión, drogas y suplantación (con su categoría)', () => {
  for (const [t, cat] of BLOCKED) {
    const r = M.checkText(t);
    assert.equal(r.ok, false, `debería bloquear: ${t}`);
    assert.equal(r.category, cat, `categoría de ${t}`);
  }
});

test('moderación: atrapa evasiones', () => {
  for (const t of EVASIONS) assert.equal(M.checkText(t).ok, false, `evasión sin bloquear: ${JSON.stringify(t)}`);
});

test('moderación: no bloquea palabras comunes ni nombres en es/pt (Scunthorpe)', () => {
  for (const t of ALLOWED) assert.ok(M.checkText(t).ok, `falso positivo: ${t} (${M.checkText(t).category})`);
});

test('normalización: tildes, leetspeak, homoglifos y separadores', () => {
  assert.equal(M.normalize('Pálád1n_de-Ac3r0'), 'paladin de acero');
  assert.equal(M.normalize('ＣＡＲＡ'), 'cara');
  assert.equal(M.normalize('р0$t@'), 'posta');
  assert.equal(M.normalize('Kiosco'), 'ciosco'); // k y q se comparan como c
});

test('nombres: limpieza (invisibles, RTL, espacios, largo) y mínimos', () => {
  assert.equal(M.cleanName('  Luz   Roja  '), 'Luz Roja');
  assert.equal(M.cleanName('Ab‮cd​'), 'Abcd');
  assert.equal(M.cleanName('x'.repeat(30)).length, 16);
  assert.equal(M.validateName('ab').error, 'nombre_corto');
  assert.equal(M.validateName('...').error, 'nombre_corto');
  assert.equal(M.validateName('a​b').error, 'nombre_corto');
  assert.deepEqual(M.validateName(' Halcón '), { ok: true, name: 'Halcón' });
  // Las 16 letras se cuentan por carácter: no se corta un emoji por la mitad.
  assert.equal(Array.from(M.cleanName('Zafiro😀😀😀😀😀😀😀😀😀😀😀😀')).length, 16);
});

test('"Al azar": ninguna combinación posible queda bloqueada, y los nombres de bots tampoco', () => {
  for (const f of ['hero', 'villain']) for (const a of M.NAME_POOL[f]) for (const s of M.NAME_POOL.suffix) assert.ok(M.validateName(a + s).ok, a + s);
  let x = 0;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 200; i++) assert.ok(M.validateName(M.randomName(i % 2 ? 'hero' : 'villain', rnd)).ok);
  const { g } = newGame();
  for (const e of Object.values(g.debug.world().entities)) assert.ok(M.checkText(e.name).ok, `bot: ${e.name}`);
});

test('fachada: crear personaje con nombre bloqueado → nombre_no_permitido; limpio y con Términos aceptados', () => {
  const g = createGame({ storage: memoryStorage(), clock: createClock(() => MON), seed: 1 });
  assert.equal(g.newCharacter('P.u.t.0', 'hero').error, 'nombre_no_permitido');
  assert.equal(g.newCharacter('Adm1n', 'villain').error, 'nombre_no_permitido');
  assert.equal(g.hasCharacter(), false);
  assert.ok(g.newCharacter('  Luz​ Roja ', 'hero', { terms: '2026-11' }).ok);
  const p = g.debug.world().entities.p0;
  assert.equal(p.name, 'Luz Roja');
  assert.deepEqual(p.consent, { terms: '2026-11', ts: MON });
  assert.ok(g.debug.events().some((e) => e.type === 'signup' && e.terms === '2026-11'));
});

test('reportar: valida jugador, motivo y nota; devuelve un reporte compacto', () => {
  const { g } = newGame();
  const id = Object.keys(g.debug.world().entities).find((k) => k !== 'p0');
  assert.equal(g.reportPlayer('p0', 'nombre').error, 'jugador_invalido');
  assert.equal(g.reportPlayer('nadie', 'nombre').error, 'jugador_invalido');
  assert.equal(g.reportPlayer('__proto__', 'nombre').error, 'jugador_invalido');
  assert.equal(g.reportPlayer(id, 'spam').error, 'motivo_invalido');
  assert.equal(g.reportPlayer(id, 'otro', { x: 1 }).error, 'nota_invalida');
  const r = g.reportPlayer(id, 'otro', `  hola\u0000 ${'x'.repeat(300)}`, 'arena', 'r12');
  assert.ok(r.ok);
  assert.equal(r.report.t, id);
  assert.equal(r.report.r, 'otro');
  assert.equal(r.report.w, 'arena');
  assert.equal(r.report.ref, 'r12');
  assert.equal(Array.from(r.report.x).length, M.NOTE_MAX);
  assert.ok(!r.report.x.includes('\u0000'));
  assert.equal(g.reportPlayer(id, 'trampa', '', 'cualquiera', '<script>').report.w, 'otro');
  assert.equal(g.reportPlayer(id, 'trampa', '', 'arena', '<script>').report.ref, undefined);
  assert.ok(g.debug.events().some((e) => e.type === 'report' && e.reason === 'otro'));
});

test('cola de reportes: ≤ 20 entradas y ≤ 2 KB, sin duplicados; se envía y si falla queda en cola', async () => {
  const st = memoryStorage();
  const rep = (i, r = 'nombre', x) => ({ t: `b${i}`, n: `Jugador ${i}`, r, w: 'arena', ts: MON + i, ...(x && { x }) });
  for (let i = 0; i < 40; i++) M.queueReport(st, rep(i, 'otro', 'nota bastante larga para probar el tope de bytes '.repeat(2).slice(0, 100)));
  let q = M.readReports(st);
  assert.ok(q.length <= M.QUEUE_MAX);
  assert.ok(new TextEncoder().encode(st.getItem(M.REPORT_KEY)).length <= M.QUEUE_BYTES);
  assert.equal(q.at(-1).t, 'b39'); // se descarta lo más viejo
  M.queueReport(st, rep(39, 'otro'));
  assert.equal(M.readReports(st).filter((r) => r.t === 'b39' && r.r === 'otro').length, 1);
  for (let i = 0; i < 30; i++) M.queueReport(st, rep(100 + i));
  assert.ok(M.readReports(st).length <= 20);
  // Sin la función en la nube (o sin conexión): no tira error y no pierde nada.
  const before = M.readReports(st).length;
  assert.equal((await M.flushReports(st, async () => { throw new Error('PGRST202'); })).ok, false);
  assert.equal((await M.flushReports(st, async () => ({ ok: false }))).ok, false);
  assert.equal(M.readReports(st).length, before);
  // Con la función: se vacía (lo que llegó mientras se enviaba, queda).
  const r = await M.flushReports(st, async (list) => { M.queueReport(st, rep(999)); return { ok: list.length > 0 }; });
  assert.ok(r.ok);
  q = M.readReports(st);
  assert.deepEqual(q.map((x) => x.t), ['b999']);
  // Guardado ilegible: cola vacía, sin romper.
  st.setItem(M.REPORT_KEY, '{no es json');
  assert.deepEqual(M.readReports(st), []);
});

test('silenciar: oculta solicitudes, regalos y firmas; rechaza la solicitud pendiente; se puede quitar', () => {
  const { g } = newGame();
  const w = g.debug.world(), p = w.entities.p0;
  const [a, b] = Object.keys(w.entities).filter((k) => k !== 'p0');
  p.friendReq = { in: [{ id: a, name: w.entities[a].name, faction: w.entities[a].faction, level: 1, ts: MON + 12 * HOUR }], out: [] };
  p.giftbox = [{ id: 'gato', from: a, fromName: 'x', ts: MON }, { id: 'gato', from: b, fromName: 'y', ts: MON }];
  p.lair.guestbook = [{ id: a, name: 'x', faction: 'hero', ts: MON }, { id: b, name: 'y', faction: 'hero', ts: MON }];
  assert.equal(g.friends().requests.length, 1);
  assert.equal(g.mute('p0').error, 'jugador_invalido');
  assert.ok(g.mute(a).ok);
  const fr = g.friends();
  assert.equal(fr.requests.length, 0);
  assert.deepEqual(fr.giftbox.map((x) => x.from), [b]);
  assert.deepEqual(g.lair().guestbook.map((x) => x.id), [b]);
  assert.deepEqual(g.muted().list.map((x) => x.id), [a]);
  assert.equal(g.openGifts().opened, 1); // el regalo del silenciado se descarta
  assert.ok(g.mute(a, false).ok);
  assert.deepEqual(g.muted().list, []);
  assert.equal(g.lair().guestbook.length, 2);
});

test('descargar mis datos: el guardado completo en JSON', () => {
  const { g } = newGame();
  const d = JSON.parse(g.exportData());
  assert.equal(d.entities.p0.name, 'Tester');
  assert.equal(createGame({ storage: memoryStorage() }).exportData(), null);
});

test('seguridad del cliente: CSP en index.html y sin innerHTML con datos ajenos', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1] ?? '';
  for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", 'https://*.supabase.co', 'wss://*.supabase.co', 'https://fonts.gstatic.com']) assert.ok(csp.includes(d), d);
  assert.ok(!/script-src[^;]*'unsafe-(inline|eval)'/.test(csp));
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('fonts.googleapis.com/css2'), 'la CSP va antes de cargar recursos');
  // innerHTML solo en art.js (SVG del catálogo) y en el helper h() (prop html, que nadie usa con datos).
  const files = [...readdirSync(new URL('../ui/', import.meta.url)).map((f) => `ui/${f}`), ...readdirSync(new URL('../ui/tabs/', import.meta.url)).map((f) => `ui/tabs/${f}`)].filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // sin comentarios
    if (!['ui/art.js', 'ui/kit.js'].includes(f)) assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src), `${f} usa un sumidero de HTML`);
    assert.ok(!/[{,]\s*html\s*:/.test(src), `${f} usa la prop html de h()`);
  }
});
