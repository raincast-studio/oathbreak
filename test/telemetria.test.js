// v17 · Telemetría: cola y envío por lotes, errores, opt-out, privacidad, hitos y economía de la fachada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, CFG } from '../src/game.js';
import { createClock, memoryStorage } from '../src/core.js';
import { FIRSTS } from '../src/telemetry.js';
import * as T from '../ui/telemetry-sink.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const T0 = Date.UTC(2026, 10, 9, 15); // lunes 12:00 ART
// Sink con reloj y transporte de prueba: status() decide la respuesta; sent guarda los lotes.
function rig({ status = () => 200, storage = memoryStorage() } = {}) {
  const r = { t: T0, sent: [], storage };
  r.sink = T.createSink({ storage, now: () => r.t, random: mulberry(7), transport: async (b) => { r.sent.push(b); return { status: status(b) }; } });
  return r;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('cola: tope por cantidad y bytes, descarta lo más viejo que no es de embudo, sobrevive a la recarga', () => {
  const r = rig();
  r.sink.emit('signup', { faction: 'hero' });
  r.sink.emit('onb_view', { step: 'faction' });
  for (let i = 0; i < T.TM.maxEvents + 80; i++) r.sink.emit('gold', { src: 'pvp', d: i, bal: 1000 + i, pad: 'x'.repeat(150) });
  const d = r.sink.diag();
  assert.ok(d.queue.length <= T.TM.maxEvents);
  assert.ok(d.bytes <= T.TM.maxBytes, `${d.bytes} B`);
  assert.ok(new TextEncoder().encode(r.storage.getItem(T.KEYS.q)).length <= T.TM.maxBytes + 64);
  assert.ok(d.dropped > 0);
  assert.equal(d.queue[0].t, 'signup', 'los eventos de embudo no se descartan');
  assert.equal(d.queue[1].t, 'onb_view');
  assert.equal(d.queue.at(-1).p.d, T.TM.maxEvents + 79, 'queda lo más nuevo');
  assert.ok(d.recent.length === T.TM.recent);
  // Recarga: la cola y la sesión vuelven del almacenamiento; un almacenamiento ilegible no rompe.
  const again = T.createSink({ storage: r.storage, now: () => r.t });
  assert.equal(again.diag().queue.length, d.queue.length);
  assert.equal(again.diag().sid, d.sid);
  assert.equal(again.tid, r.sink.tid);
  r.storage.setItem(T.KEYS.q, '{no es json');
  assert.deepEqual(T.createSink({ storage: r.storage, now: () => r.t }).diag().queue, []);
  // Sin almacenamiento (modo privado): todo en memoria.
  const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => {} };
  const mem = T.createSink({ storage: bad, now: () => r.t });
  assert.ok(mem.emit('app_open', {}));
  assert.equal(mem.diag().queue.length, 1);
});

test('envío: lotes acotados, se vacía al confirmar, backoff al fallar, 400 descarta, sin sesión espera', async () => {
  let code = 503;
  const r = rig({ status: () => code });
  for (let i = 0; i < 120; i++) r.sink.emit('pvp', { role: 'attacker', won: i % 2 === 0, loot: i });
  let f = await r.sink.flush();
  assert.equal(f.reason, 'reintento');
  const b = r.sent[0];
  assert.ok(b.ev.length <= T.TM.batchMax && JSON.stringify(b).length <= T.TM.batchBytes);
  assert.equal(b.v, T.APP_VERSION);
  assert.match(b.tid, /^[0-9a-f]{16}$/);
  assert.ok(b.ev.every((e) => /^s[0-9a-f]{12}$/.test(e.sid) && Number.isInteger(e.q) && e.ts === T0));
  assert.equal(r.sink.diag().queue.length, 120, 'si falla no se pierde nada');
  const wait1 = r.sink.diag().retryAt - r.t;
  assert.ok(wait1 >= T.TM.backoffMin * 0.75 && wait1 <= T.TM.backoffMin * 1.25);
  assert.equal((await r.sink.flush()).reason, 'backoff');
  r.t += wait1; await r.sink.flush();
  const wait2 = r.sink.diag().retryAt - r.t;
  assert.ok(wait2 > wait1, 'el backoff crece');
  for (let i = 0; i < 20; i++) { r.t = r.sink.diag().retryAt; await r.sink.flush(); }
  assert.ok(r.sink.diag().retryAt - r.t <= T.TM.backoffMax * 1.25, 'con techo');
  // Vuelve el servidor: se manda de a lotes; lo que llega mientras se envía, queda.
  code = 200; r.t = r.sink.diag().retryAt;
  const slow = T.createSink({ storage: memoryStorage(), now: () => r.t, transport: async () => { slow.emit('visit', { host: 'bot' }); return { status: 200 }; } });
  slow.emit('pvp', { won: true });
  assert.ok((await slow.flush()).ok);
  assert.deepEqual(slow.diag().queue.map((e) => e.t), ['visit']);
  let n = 0;
  do f = await r.sink.flush(); while (f.more && ++n < 10);
  assert.equal(r.sink.diag().queue.length, 0);
  assert.equal(r.sink.diag().fails, 0);
  // 400: el lote es inválido; se descarta (y se informa como tm_dropped) en vez de trabar la cola.
  code = 400;
  r.sink.emit('gold', { src: 'x', d: 1 });
  assert.equal((await r.sink.flush()).reason, 'rechazado');
  assert.equal(r.sink.diag().queue.length, 0);
  code = 200;
  r.sink.emit('app_open', {});
  await r.sink.flush();
  assert.ok(r.sent.at(-1).ev.some((e) => e.t === 'tm_dropped' && e.p.n >= 1));
  // Sin sesión de Supabase: no cuenta como fallo ni activa backoff.
  code = -1;
  r.sink.emit('app_open', {});
  assert.equal((await r.sink.flush()).reason, 'sin_sesion');
  assert.equal(r.sink.diag().fails, 0);
  assert.equal(r.sink.diag().queue.length, 1);
  // Destino 'none': no hay transporte, la cola queda para el panel.
  assert.equal(T.TRANSPORTS.none, null);
  const none = T.createSink({ storage: memoryStorage(), now: () => r.t });
  none.emit('app_open', {});
  assert.equal((await none.flush()).reason, 'none');
});

test('sesión: mismo sid dentro de 30 min, nuevo después; session_end con duración y primer plano', async () => {
  const r = rig();
  r.sink.emit('app_open', {});
  const s1 = r.sink.diag().sid;
  r.t += 10 * 60_000;
  r.sink.onHide({ lt: 0 });
  await new Promise((ok) => setImmediate(ok));
  const end = r.sent.at(-1).ev.find((e) => e.t === 'session_end');
  assert.equal(end.sid, s1);
  assert.equal(end.p.dur, 600);
  assert.equal(end.p.fg, 600);
  r.t += 5 * 60_000; r.sink.onShow();
  assert.equal(r.sink.diag().sid, s1);
  r.t += 2 * 60_000; r.sink.onHide();
  r.t += CFG.telemetry.sessionGapMin * 60_000 + 1; r.sink.onShow();
  r.sink.emit('pvp', {});
  assert.notEqual(r.sink.diag().sid, s1);
  assert.equal(r.sink.diag().queue.at(-1).q, 1);
});

test('errores: firma, deduplicación, tope por sesión, ruido, pila recortada y sin datos personales', async () => {
  const r = rig();
  const boom = (i) => ({ kind: 'error', message: `Cannot read properties of undefined (reading '${i % 2 ? 'a' : 'a'}') item ${i} de ana@example.com`,
    filename: 'https://raincast-studio.github.io/oathbreak/ui/tabs/guarida.js?v=17#x', lineno: 120, colno: 7,
    stack: `TypeError: x\n    at draw (https://raincast-studio.github.io/oathbreak/ui/tabs/guarida.js?v=17:120:7)\n    at go (https://raincast-studio.github.io/oathbreak/ui/main.js:250:3)\n${'    at f (x.js:1:1)\n'.repeat(20)}` });
  for (let i = 0; i < 25; i++) r.sink.captureError(boom(i));
  let errs = r.sink.diag().queue.filter((e) => e.t === 'error');
  assert.equal(errs.length, 1, 'la misma firma se manda una vez');
  const e = errs[0].p;
  assert.match(e.sig, /^[0-9a-f]{8}$/);
  assert.equal(e.src, 'ui/tabs/guarida.js:120:7');
  assert.ok(!/https?:|\?v=|#x/.test(e.stack + e.src), 'sin origen ni query string');
  assert.ok(e.stack.split('\n').length <= 6);
  assert.ok(!e.msg.includes('@') && e.msg.includes('[email]'));
  assert.ok(e.msg.length <= 200);
  // Rechazo de promesa: el origen sale del primer cuadro del juego.
  r.sink.captureError({ kind: 'rejection', message: 'falló la carga', stack: 'Error\n    at a (https://cdn.jsdelivr.net/npm/x.js:1:2)\n    at b (https://h.io/oathbreak/src/game.js:40:5)' });
  assert.equal(r.sink.diag().queue.at(-1).p.src, 'src/game.js:40:5');
  // Ruido de extensiones y ResizeObserver: no se registra.
  assert.equal(r.sink.captureError({ message: 'x', filename: 'chrome-extension://abc/content.js' }), null);
  assert.equal(r.sink.captureError({ message: 'ResizeObserver loop completed with undelivered notifications.' }), null);
  // Tope de firmas distintas por sesión.
  for (let i = 0; i < 30; i++) r.sink.captureError({ message: `distinto ${'abcdefghijklmnopqrstuvwxyz'[i % 26]}${i}`, filename: `ui/f${i}.js`, lineno: i, colno: 1 });
  errs = r.sink.diag().queue.filter((x) => x.t === 'error');
  assert.equal(errs.length, T.TM.errSigs);
  // Al ocultar: las repeticiones salen con el total (n) y la misma hora de la primera vez.
  r.t += 60_000;
  r.sink.onHide();
  await new Promise((ok) => setImmediate(ok));
  const rep = r.sent.flatMap((b) => b.ev).find((x) => x.t === 'error' && x.p.sig === e.sig && x.p.n > 1);
  assert.equal(rep.p.n, 25);
  assert.equal(rep.ts, errs[0].ts);
});

test('opt-out: apagado no encola, no manda, vacía la cola e ignora errores; se puede volver a prender', async () => {
  const r = rig();
  r.sink.emit('app_open', {});
  assert.equal(r.sink.enabled(), true, 'encendido por defecto');
  r.sink.setEnabled(false);
  assert.equal(r.storage.getItem(T.KEYS.off), '1');
  assert.equal(r.sink.diag().queue.length, 0);
  assert.equal(r.sink.emit('pvp', { won: true }), null);
  assert.equal(r.sink.captureError({ message: 'x', filename: 'ui/a.js' }), null);
  r.sink.ingest({ ts: T0, pid: 'p0', type: 'signup', faction: 'hero' });
  assert.equal((await r.sink.flush({ force: true })).reason, 'off');
  assert.equal(r.sent.length, 0);
  assert.equal(r.sink.diag().queue.length, 0);
  // Persiste entre recargas.
  assert.equal(T.createSink({ storage: r.storage, now: () => r.t }).enabled(), false);
  r.sink.setEnabled(true);
  assert.ok(r.sink.emit('app_open', {}));
});

test('privacidad: ningún evento lleva nombre, email ni el id local; scrub de propiedades', () => {
  const clock = createClock(() => T0);
  const r = rig();
  const g = createGame({ storage: memoryStorage(), clock, seed: 11, onEvent: (e) => r.sink.ingest(e) });
  const NAME = 'Zorrocotroco';
  r.sink.emit('onb_view', { step: 'faction' });
  r.sink.emit('onb_name', { ok: true, rnd: false, name: NAME, email: 'yo@mail.com', nota: `escribime a yo@mail.com`, nested: { name: NAME }, list: [NAME] });
  assert.ok(g.newCharacter(NAME, 'villain', { terms: '2026-11-borrador' }).ok);
  const c = g.contracts().list[0];
  g.startMission(c.id); g.cancelMission();
  for (let i = 0; i < 6; i++) g.hunt();
  const s = g.visitSuggestions().list[0]; if (s) g.visit(s.id);
  const fr = g.friends().suggest?.[0]; if (fr) g.addFriend(fr.id);
  g.deposit(5);
  g.reportPlayer(Object.keys(g.debug.world().entities).find((k) => k !== 'p0'), 'otro', `soy ${NAME}, mail yo@mail.com`, 'arena');
  clock.advance(3 * 3_600_000); g.state();
  const q = r.sink.diag().queue;
  assert.ok(q.length > 15, `${q.length} eventos`);
  const txt = JSON.stringify(q);
  assert.ok(!txt.includes(NAME), 'sin nombre de héroe');
  assert.ok(!/@/.test(txt), 'sin emails');
  for (const ev of q) {
    for (const k of Object.keys(ev.p)) assert.ok(!/^(name|nombre|email|mail|nick|pid)$/i.test(k), `${ev.t}.${k}`);
    for (const v of Object.values(ev.p)) assert.ok(v === null || ['string', 'number', 'boolean'].includes(typeof v), `${ev.t}: propiedades planas`);
  }
  for (const t of ['signup', 'session_start', 'mission_start', 'mission_cancel', 'pvp', 'first', 'gold', 'report']) assert.ok(q.some((e) => e.t === t), t);
  assert.deepEqual(T.scrub({ email: 'a@b.co', name: 'x', ok: 1, s: 'mail a@b.co.', inf: Infinity }), { ok: 1, s: 'mail [email].', inf: null });
  // Las pilas de Firefox (fn@archivo.js:1:2) no se confunden con emails.
  assert.equal(T.scrubText('draw@ui/main.js:10:2 y load@main.js:3:4'), 'draw@ui/main.js:10:2 y load@main.js:3:4');
});

test('fachada: hitos de la primera hora una sola vez, oro por categoría fuera del guardado, viejos sin hitos', () => {
  const clock = createClock(() => T0);
  const evs = [];
  const g = createGame({ storage: memoryStorage(), clock, seed: 5, onEvent: (e) => evs.push(e) });
  g.newCharacter('Probador', 'hero');
  clock.advance(7 * 60_000);
  const c = g.contracts().list[0];
  g.startMission(c.id); g.cancelMission(); g.startMission(c.id); g.cancelMission();
  for (let i = 0; i < 4; i++) g.hunt();
  const firsts = evs.filter((e) => e.type === 'first');
  assert.equal(firsts.filter((e) => e.k === 'mission').length, 1);
  assert.equal(firsts.find((e) => e.k === 'mission').min, 7);
  assert.equal(firsts.filter((e) => e.k === 'hunt').length, 1);
  assert.ok(firsts.every((e) => FIRSTS.includes(e.k)));
  const gold = evs.filter((e) => e.type === 'gold');
  assert.ok(gold.length > 0 && gold.every((e) => Number.isInteger(e.d) && e.d !== 0 && typeof e.src === 'string'));
  assert.ok(gold.some((e) => e.src === 'pvp' && e.d > 0));
  const w = g.debug.world(), p = w.entities.p0;
  assert.equal(gold.at(-1).bal, p.gold + p.bank);
  assert.ok(!w.events.some((e) => e.type === 'gold'), '`gold` no entra al buffer del guardado');
  assert.ok(JSON.stringify({ tm: p.tm }).length <= 12, 'hitos: un entero chico');
  // Comisión del banco = sumidero 'bank'; mientras no estabas = 'world'.
  evs.length = 0;
  if (p.gold >= 20) { g.deposit(20); assert.ok(evs.some((e) => e.type === 'gold' && e.src === 'bank' && e.d < 0)); }
  // Guardado de antes de v17 (sin e.tm): no emite "primera vez".
  delete p.tm;
  evs.length = 0;
  g.startMission(c.id);
  assert.ok(!evs.some((e) => e.type === 'first'));
  assert.ok(evs.some((e) => e.type === 'mission_start' && e.id === c.id && e.min > 0));
});

test('versión y archivos: APP_VERSION = VERSION del service worker; migración y KPIs presentes y cerrados', () => {
  const sw = read('sw.js');
  assert.ok(sw.match(/const VERSION = '([^']+)'/)[1].endsWith(T.APP_VERSION));
  for (const f of ['ui/telemetry-sink.js', 'ui/telemetry-panel.js']) assert.match(sw, new RegExp(`'${f}'`));
  assert.match(read('ui/main.js').split('\n').find((l) => l.startsWith('import ')), /telemetry-sink/, 'el sink se importa primero');
  const sql = read('supabase/migrations/20261107_telemetry.sql');
  for (const s of ['security definer', "set search_path = ''", 'auth.uid()', 'partition by range (ts)', 'enable row level security',
    'grant execute on function public.track_events(jsonb) to authenticated', 'delete from analytics.events where user_id = v_uid'])
    assert.ok(sql.includes(s), s);
  assert.ok(!/create policy|grant (select|insert|update|delete|all) on/i.test(sql), 'sin lectura ni escritura directa para clientes');
  const kpi = read('supabase/queries/kpis.sql');
  for (const s of ['d1_pct', 'd7_pct', 'd30_pct', 'onb_oath', 'pct_con_error', "type = 'gold'", 'winrate_pct']) assert.ok(kpi.includes(s), s);
  assert.ok(!/\b(insert|update|delete|drop|alter|create)\b/i.test(kpi.replace(/--.*$/gm, '')), 'consultas de solo lectura');
});
