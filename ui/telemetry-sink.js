// Telemetría · envío por lotes (v17). Diccionario de eventos y formato: docs/telemetria.md.
// - Recibe los eventos de la fachada (setTelemetrySink) y los de la interfaz (emit). Nunca bloquea el juego.
// - Cola en memoria + localStorage acotada (fuera del guardado). Envío cada 30 s y al ocultar la pestaña, con
//   fetch keepalive; backoff exponencial; descarte si se llena. Nada si el jugador apagó "Compartir datos de uso".
// - Errores: `error` y `unhandledrejection`, deduplicados por firma y con tope por sesión; mismo transporte.
// - Destino intercambiable (TM.dest): 'supabase' | 'none'. Cómo sumar PostHog: docs/telemetria.md.
import { setTelemetrySink } from '../src/telemetry.js';
import { CFG } from '../src/config.js';
import * as cloud from './cloud.js';

export const APP_VERSION = 'v17'; // igual al sufijo de VERSION en sw.js (lo controla test/telemetria.test.js)
export const TM = {
  // v17: 'none' hasta aplicar supabase/migrations/20261107_telemetry.sql; después, 'supabase'.
  dest: 'none', flushMs: 30_000, maxEvents: 300, maxBytes: 48 * 1024, batchMax: 50, batchBytes: 32 * 1024,
  backoffMin: 30_000, backoffMax: 30 * 60_000, errSigs: 10, recent: 20, propBytes: 1024,
};
export const KEYS = { q: 'oathbreak.tm.q', id: 'oathbreak.tm.id', off: 'oathbreak.tm.off', s: 'oathbreak.tm.s' };
const GAP = CFG.telemetry.sessionGapMin * 60_000;
// Eventos de embudo: si la cola se llena, se descartan los últimos (sin ellos no hay cohorte ni embudo).
const KEEP = /^(signup|first|app_open|onb_\w+)$/;

/* ---------- Privacidad ---------- */
const PII_KEY = /^(name|nombre|email|e?mail|nick|nickname|pid)$/i;
// El TLD no puede seguir con ":" o "/": así "load@main.js:3:4" (pila de Firefox) no cuenta como email.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,24}(?![\w:/-])/gi;
export const scrubText = (s, max = 200) => String(s ?? '').replace(EMAIL, '[email]').slice(0, max);
// Propiedades planas y chicas: sin claves personales, sin objetos anidados, textos acotados, sin emails.
export function scrub(p) {
  const out = {};
  for (const [k, v] of Object.entries(p ?? {})) {
    if (PII_KEY.test(k) || k === 'ts' || k === 'type') continue;
    if (typeof v === 'number') out[k] = Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
    else if (typeof v === 'boolean' || v === null) out[k] = v;
    else if (typeof v === 'string') out[k] = scrubText(v, k === 'stack' ? 1200 : 200);
  }
  return out;
}
const bytes = (x) => new TextEncoder().encode(JSON.stringify(x)).length;
const hex = (n, rnd) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');

/* ---------- Errores: firma y recorte ---------- */
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
// Rutas cortas: sin origen ni query string ("https://x.io/oathbreak/ui/main.js?v=2:10:3" → "ui/main.js:10:3").
export const shortPath = (s) => String(s ?? '').replace(/(?:https?|blob|chrome-extension|moz-extension):\/\/[^/\s)]*/g, '')
  .replace(/\?[^\s):]*/g, '').replace(/#[^\s):]*/g, '').replace(/\/[^\s():]*?\/((?:ui|src)\/)/g, '$1').replace(/^\//, '');
export const trimStack = (st) => String(st ?? '').split('\n').map((l) => scrubText(shortPath(l.trim()), 160)).filter(Boolean).slice(0, 6).join('\n');
// Ruido que no es del juego: extensiones del navegador y el aviso benigno de ResizeObserver.
const NOISE = /(?:chrome|moz|safari(?:-web)?)-extension:\/\/|ResizeObserver loop/;
export const isNoise = ({ message, filename, stack } = {}) => NOISE.test(`${message ?? ''} ${filename ?? ''} ${String(stack ?? '').split('\n').slice(0, 2).join(' ')}`);
export function errorInfo({ kind = 'error', message, filename, lineno, colno, stack } = {}) {
  const msg = scrubText(message || 'sin mensaje');
  const st = trimStack(stack);
  // Origen: archivo:línea:col del evento; si no viene (promesas), el primer cuadro del juego (ui/ o src/) o el primero.
  const frames = st.split('\n').map((l) => l.match(/([\w./-]+:\d+:\d+)/)?.[1]).filter(Boolean);
  const src = filename ? `${shortPath(filename)}:${lineno ?? 0}:${colno ?? 0}` : (frames.find((f) => /^\/?(?:ui|src)\//.test(f)) ?? frames[0] ?? '').replace(/^\//, '');
  const sig = fnv(`${kind}|${msg.replace(/\d+/g, '#')}|${src.replace(/:\d+$/, '')}`);
  return { sig, kind, msg, src: scrubText(src, 200), stack: st };
}

/* ---------- Cola, sesión y envío ---------- */
// storage: getItem/setItem/removeItem. transport(batch, { keepalive }) → { status } (2xx ok; 0 sin red; -1 sin sesión).
// persistDelay: 0 = escribe la cola en cada evento (tests); en el navegador, 1 s agrupado (y siempre al ocultar).
export function createSink({ storage, transport = null, now = () => Date.now(), random = Math.random, screen = () => 'base', canPersist = () => true, persistDelay = 0 } = {}) {
  const get = (k) => { try { return storage?.getItem(k) ?? null; } catch { return null; } };
  const set = (k, v) => { if (!canPersist()) return; try { storage?.setItem(k, v); } catch { /* lleno o bloqueado: sigue en memoria */ } };
  const del = (k) => { try { storage?.removeItem(k); } catch { /* nada */ } };
  const read = (k, d) => { try { return JSON.parse(get(k)) ?? d; } catch { return d; } };

  let fresh = false;
  let tid = get(KEYS.id);
  if (!/^[0-9a-f]{16}$/.test(tid ?? '')) { tid = hex(16, random); fresh = true; set(KEYS.id, tid); }
  let q = read(KEYS.q, []);
  if (!Array.isArray(q)) q = [];
  const recent = [];
  const st = { sending: false, fails: 0, retryAt: 0, lastOk: 0, lastStatus: null, dropped: 0, reported: 0, sent: 0 };
  // Sesión: se conserva entre recargas si no pasaron 30 min (mismo corte que session_start de la fachada).
  let ses = read(KEYS.s, null);
  const newSession = (t) => { ses = { sid: `s${hex(12, random)}`, start: t, last: t, q: 0, fg: 0, hides: 0 }; errs.clear(); };
  const errs = new Map();
  if (!ses?.sid || !(now() - ses.last <= GAP)) newSession(now());
  let fgSince = now(), hidden = false;

  const enabled = () => get(KEYS.off) !== '1';
  let pTimer = null;
  const persist = () => { clearTimeout(pTimer); pTimer = null; set(KEYS.q, JSON.stringify(q)); set(KEYS.s, JSON.stringify(ses)); };
  const later = () => { if (!persistDelay) persist(); else pTimer ??= setTimeout(persist, persistDelay); };
  // Bytes de la cola llevados a mano (no se re-serializa toda la cola en cada evento).
  const evBytes = (x) => bytes(x) + 1;
  let qBytes = 2 + q.reduce((a, x) => a + evBytes(x), 0);
  const setQ = (list) => { q = list; qBytes = 2 + q.reduce((a, x) => a + evBytes(x), 0); };

  function push(ev) {
    q.push(ev); qBytes += evBytes(ev);
    // Tope por cantidad y por bytes: se descarta lo más viejo que no sea de embudo; si todo es de embudo, lo nuevo.
    while (q.length > TM.maxEvents || (q.length > 1 && qBytes > TM.maxBytes)) {
      const i = q.findIndex((x) => !KEEP.test(x.t));
      const [gone] = q.splice(i < 0 ? q.length - 1 : i, 1);
      qBytes -= evBytes(gone);
      st.dropped++;
    }
  }

  function emit(type, props, ts = now()) {
    if (!enabled() || !/^[a-z][a-z0-9_]{1,39}$/.test(type)) return null;
    if (now() - ses.last > GAP) newSession(now());
    let p = scrub(props);
    if (bytes(p) > TM.propBytes) p = { cut: true };
    const ev = { t: type, ts: Math.round(ts), sid: ses.sid, q: ++ses.q, scr: String(screen() ?? '').slice(0, 24), p };
    ses.last = now();
    push(ev);
    recent.push(ev);
    if (recent.length > TM.recent) recent.shift();
    later();
    return ev;
  }
  // Eventos de la fachada: { ts, pid, type, ...props } (pid es local, 'p0': no se manda).
  const ingest = (e) => { if (e && typeof e.type === 'string') { const { ts, pid, type, ...props } = e; emit(type, props, Number.isFinite(ts) ? ts : now()); } };

  // Primera vez de cada firma en la sesión: evento `error` (con pila). Repeticiones: solo se cuentan.
  function captureError(info) {
    if (!enabled() || isNoise(info)) return null;
    const x = errorInfo(info);
    const hit = errs.get(x.sig);
    if (hit) { hit.n++; return null; }
    if (errs.size >= TM.errSigs) { st.dropped++; return null; }
    errs.set(x.sig, { ...x, n: 1, sentN: 1, ts: now() });
    return emit('error', { ...x, n: 1 });
  }
  // Repeticiones: se reenvía la firma con el total de la sesión (el servidor se queda con el máximo).
  function errorRepeats() {
    for (const e of errs.values()) if (e.n > e.sentN) { e.sentN = e.n; emit('error', { sig: e.sig, kind: e.kind, msg: e.msg, src: e.src, n: e.n }, e.ts); }
  }

  function takeBatch() {
    const ev = [];
    let b = 64;
    for (const x of q) {
      const s = bytes(x) + 1;
      if (ev.length >= TM.batchMax || (ev.length && b + s > TM.batchBytes)) break;
      ev.push(x); b += s;
    }
    return { v: APP_VERSION, tid, ev };
  }

  async function flush({ keepalive = false, force = false } = {}) {
    if (!enabled() || !transport || st.sending || !q.length) return { ok: false, reason: !enabled() ? 'off' : !transport ? 'none' : st.sending ? 'busy' : 'empty' };
    if (!force && now() < st.retryAt) return { ok: false, reason: 'backoff' };
    if (st.dropped > st.reported) { const n = st.dropped - st.reported; st.reported = st.dropped; emit('tm_dropped', { n }); }
    const batch = takeBatch();
    const ids = new Set(batch.ev.map((x) => `${x.sid}.${x.q}`));
    st.sending = true;
    let status = 0;
    try { status = (await transport(batch, { keepalive }))?.status ?? 0; } catch { status = 0; } finally { st.sending = false; }
    st.lastStatus = status;
    const remove = () => { setQ(q.filter((x) => !ids.has(`${x.sid}.${x.q}`))); persist(); };
    if (status >= 200 && status < 300) {
      remove(); st.fails = 0; st.retryAt = 0; st.lastOk = now(); st.sent += ids.size;
      return { ok: true, sent: ids.size, more: q.length > 0 };
    }
    if (status === 400 || status === 413 || status === 422) { st.dropped += ids.size; remove(); return { ok: false, reason: 'rechazado' }; }
    if (status === -1) return { ok: false, reason: 'sin_sesion' }; // sin sesión todavía: se prueba en el próximo ciclo
    st.fails++;
    const base = Math.min(TM.backoffMax, TM.backoffMin * 2 ** (st.fails - 1));
    st.retryAt = now() + Math.round(base * (0.75 + random() * 0.5));
    return { ok: false, reason: 'reintento', status };
  }

  // Pestaña oculta / visible: fin de sesión (se repite en cada ocultamiento; vale el último por sid) y envío.
  function onHide(extra) {
    if (hidden) return null;
    hidden = true;
    ses.fg += now() - fgSince; ses.hides++;
    errorRepeats();
    emit('session_end', { dur: Math.round((now() - ses.start) / 1000), fg: Math.round(ses.fg / 1000), hides: ses.hides, ...extra });
    persist();
    return flush({ keepalive: true });
  }
  function onShow() {
    if (!hidden) return;
    hidden = false; fgSince = now();
    if (now() - ses.last > GAP) newSession(now());
  }

  function setEnabled(on) {
    if (on) { del(KEYS.off); return; }
    set(KEYS.off, '1'); setQ([]); recent.length = 0; errs.clear(); persist();
  }
  const clear = () => { setQ([]); persist(); };
  const diag = () => ({ enabled: enabled(), dest: TM.dest, tid, sid: ses.sid, queue: q.map((x) => ({ ...x })), recent: recent.map((x) => ({ ...x })),
    bytes: qBytes, ...st });

  return { emit, ingest, captureError, errorRepeats, flush, onHide, onShow, setEnabled, enabled, clear, diag, fresh, get tid() { return tid; } };
}

/* ---------- Transportes ---------- */
// Supabase: RPC track_events(p_batch) por REST, con el token de la sesión (anónima o vinculada). Ver migración.
async function supabase(batch, { keepalive } = {}) {
  const t = cloud.restTarget();
  if (!t) return { status: -1 };
  const r = await fetch(`${t.url}/rest/v1/rpc/track_events`, {
    method: 'POST', keepalive, credentials: 'omit',
    headers: { apikey: t.key, Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_batch: batch }),
  });
  if (!r.ok) return { status: r.status };
  const j = await r.json().catch(() => null);
  return { status: j?.ok === false ? (j.error === 'limite' ? 429 : j.error === 'sin_sesion' ? -1 : 400) : 200 };
}
export const TRANSPORTS = { supabase, none: null };

/* ---------- Navegador ---------- */
let S = null;
const off = { emit: () => null, diag: () => null };
export const emit = (type, props) => S?.emit(type, props) ?? null;
export const usageEnabled = () => S?.enabled() ?? true;
export const setUsageEnabled = (on) => S?.setEnabled(on);
export const diag = () => (S ?? off).diag();
export const flushNow = () => S?.flush({ force: true });
export const clearQueue = () => S?.clear();

const screen = () => {
  const d = document, t = location.hash.slice(1);
  const base = d.querySelector('.onb') ? 'onb' : /^[a-z]{1,12}$/.test(t) ? t : 'base';
  return d.querySelector('.hunt-layer') ? `${base}:caza` : d.querySelector('.sheet-layer') ? `${base}:sheet` : base;
};

// Rendimiento: tiempo a interactivo (primer dibujo de la app o del onboarding + un cuadro; si existe la marca
// performance 'ob:interactive', esa), FCP, LCP, navegación y tareas largas. Un `perf` por carga: al minuto o al ocultar.
function watchPerf() {
  const lt = { lt_n: 0, lt_ms: 0, lt_max: 0 };
  let lcp = null, tti = null, sent = false;
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { lt.lt_n++; lt.lt_ms += e.duration; lt.lt_max = Math.max(lt.lt_max, e.duration); } }).observe({ type: 'longtask', buffered: true });
  } catch { /* Safari/Firefox: sin tareas largas */ }
  try { new PerformanceObserver((l) => { const e = l.getEntries().at(-1); if (e) lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* nada */ }
  const ready = () => requestAnimationFrame(() => setTimeout(() => { tti ??= performance.now(); }, 0));
  if (document.querySelector('#app, .onb')) ready();
  else {
    const mo = new MutationObserver(() => { if (document.querySelector('#app, .onb')) { mo.disconnect(); ready(); } });
    mo.observe(document.body ?? document.documentElement, { childList: true });
  }
  const report = () => {
    if (sent) return;
    sent = true;
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    const mark = performance.getEntriesByName?.('ob:interactive')?.[0]?.startTime;
    const fcp = performance.getEntriesByName?.('first-contentful-paint')?.[0]?.startTime;
    emit('perf', { tti: mark ?? tti ?? -1, fcp: fcp ?? -1, lcp: lcp ?? -1, dcl: nav?.domContentLoadedEventEnd ?? -1, load: nav?.loadEventEnd || -1,
      ...lt, sw: !!navigator.serviceWorker?.controller, nav: nav?.type ?? 'navigate' });
  };
  setTimeout(report, 60_000);
  return { report, longTasks: () => lt.lt_n };
}

function install() {
  let ls = null;
  try { localStorage.setItem('oathbreak.tm._', '1'); localStorage.removeItem('oathbreak.tm._'); ls = localStorage; } catch { /* sin almacenamiento: solo memoria */ }
  S = createSink({ storage: ls, transport: TRANSPORTS[TM.dest] ?? null, screen, canPersist: () => !cloud.wipingNow(), persistDelay: 1000 });
  setTelemetrySink((ev) => S.ingest(ev));
  // Un fallo dentro del propio registro nunca dispara otro error (evita bucles).
  const safe = (f) => (...a) => { try { f(...a); } catch { /* nada */ } };
  addEventListener('error', safe((e) => { if (e.message || e.error) S.captureError({ kind: 'error', message: e.message || e.error?.message, filename: e.filename, lineno: e.lineno, colno: e.colno, stack: e.error?.stack }); }));
  addEventListener('unhandledrejection', safe((e) => { const r = e.reason; S.captureError({ kind: 'rejection', message: r?.message ?? String(r), stack: r?.stack }); }));
  let code = null;
  try { code = new URLSearchParams(location.search).get('ref'); } catch { /* nada */ }
  const vw = [360, 414, 768, 1024, 1440].find((w) => innerWidth <= w) ?? 1920;
  S.emit('app_open', { pwa: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true, ref: !!code, vw, new: S.fresh });
  if (code && /^[A-Z0-9]{4,12}$/.test(code)) S.emit('invite_open', { code });
  const perf = watchPerf();
  const hide = safe(() => { perf.report(); S.onHide({ lt: perf.longTasks() }); });
  document.addEventListener('visibilitychange', () => (document.hidden ? hide() : S.onShow()));
  addEventListener('pagehide', hide);
  // Cada 30 s con la pestaña visible; si quedó más de un lote, sigue (hasta 3 por ciclo).
  const drain = async () => { for (let i = 0; i < 3; i++) { const r = await S.flush(); if (!r?.more) break; } };
  setInterval(() => { if (!document.hidden) drain(); }, TM.flushMs);
  cloud.onChange(() => { if (cloud.account().status === 'online') drain(); });
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') install();
