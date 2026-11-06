// Guardado en la nube provisional (pieza 1b). localStorage sigue siendo el guardado principal; esto lo copia a Supabase.
// - Sesión anónima al entrar (invitado). Vincular con email + código de 6 dígitos conserva el mismo playerId.
// - Escritura solo por la función save_game(data, rev): control optimista por versión. En E6 se reemplaza por comandos RPC.
// - Sin conexión el juego sigue andando: la nube se reintenta sola.
import { SAVE_KEY, BACKUP_KEY } from '../src/core.js';

const URL = 'https://ymxjkmmtogjfnoclwdlm.supabase.co';
const KEY = 'sb_publishable_DdEKnnhYSm_58cLubkPnKg_cdDJAVtO';
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm'; // v17: versión fija (antes @2 flotante)
const META = 'oathbreak.cloud';
const PUSH_DELAY = 10_000, PUSH_EVERY = 60_000, INIT_TIMEOUT = 6_000;

let base, client = null, user = null, timer = null, pushing = false;
let token = null; // v17: token de la sesión, para el envío de telemetría con fetch keepalive (ui/telemetry-sink.js)
// v17: borrado de cuenta. DEL marca que falta borrar en la nube (se completa al reconectar); wiping frena escrituras
// del guardado entre el borrado local y la recarga.
const DEL = 'oathbreak.cloud.delete';
let wiping = false;
const delPending = () => { try { return !!base?.getItem(DEL); } catch { return false; } };
const A = { status: 'loading', lastSync: 0, error: null };
const listeners = new Set();
const emit = () => { for (const f of listeners) try { f(); } catch { /* nada */ } };
export const onChange = (f) => { listeners.add(f); return () => listeners.delete(f); };

const readMeta = () => { try { return { uid: null, rev: 0, dirty: false, ...JSON.parse(base.getItem(META)) }; } catch { return { uid: null, rev: 0, dirty: false }; } };
const writeMeta = (m) => { try { base.setItem(META, JSON.stringify(m)); } catch { /* nada */ } };
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// Estado para la interfaz.
export function account() {
  return {
    status: A.status, // loading | online | offline
    guest: !user || !!user.is_anonymous,
    email: user?.email || null,
    pendingEmail: user?.new_email || null,
    createdAt: user ? Date.parse(user.created_at) : null,
    lastSync: A.lastSync, dirty: base ? readMeta().dirty : false,
    error: A.error ?? null, // 31/10: el último error al subir (se muestra; antes fallaba en silencio)
    deletePending: delPending(),
  };
}

// Envuelve el storage: cada escritura del guardado marca "pendiente" y programa la subida.
function wrap(s) {
  const touch = () => { const m = readMeta(); if (!m.dirty) writeMeta({ ...m, dirty: true }); schedule(PUSH_DELAY); };
  return {
    getItem: (k) => s.getItem(k),
    setItem: (k, v) => { if (wiping && k.startsWith('oathbreak.')) return; s.setItem(k, v); if (k === SAVE_KEY) touch(); },
    removeItem: (k) => { s.removeItem(k); if (k === SAVE_KEY) touch(); },
  };
}

function schedule(ms) { clearTimeout(timer); timer = setTimeout(push, ms); }

async function fetchRemote() {
  const { data, error } = await client.from('saves').select('data, rev, updated_at').eq('player_id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}

function adopt(remote) {
  const local = base.getItem(SAVE_KEY);
  if (local) base.setItem(BACKUP_KEY, local);
  base.setItem(SAVE_KEY, JSON.stringify(remote.data));
  writeMeta({ uid: user.id, rev: remote.rev, dirty: false });
  A.lastSync = Date.now();
}

// Conecta y reconcilia ANTES de crear la partida (así la fachada arranca con la versión correcta).
async function connect() {
  if (!client) {
    const { createClient } = await import(LIB);
    client = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    client.auth.onAuthStateChange((_e, s) => { token = s?.access_token ?? null; if (s?.user) { user = s.user; emit(); } });
  }
  let { data: { session } } = await client.auth.getSession();
  if (session && delPending()) { // v17: borrado pendiente: primero se borra la cuenta vieja; si no se puede, no se baja ni se sube nada
    user = session.user;
    if (!(await finishDelete())) { A.status = 'online'; A.error = null; return; }
    session = null;
  } else if (!session && delPending()) base.removeItem(DEL);
  if (!session) {
    const r = await client.auth.signInAnonymously();
    if (r.error) throw r.error;
    session = r.data.session;
  }
  user = session.user; token = session.access_token ?? token;
  const remote = await fetchRemote();
  const m = readMeta();
  if (remote && (m.uid !== user.id || remote.rev > m.rev)) adopt(remote); // otra cuenta u otro dispositivo guardó después
  else if (m.uid !== user.id) writeMeta({ uid: user.id, rev: remote?.rev ?? 0, dirty: !!base.getItem(SAVE_KEY) });
  A.status = 'online'; A.error = null;
}

export async function init(storage) {
  base = storage;
  try { await withTimeout(connect(), INIT_TIMEOUT); }
  catch (e) { A.status = 'offline'; A.error = String(e?.message ?? e); }
  setInterval(() => (A.status === 'online' && !delPending() ? push() : retry()), PUSH_EVERY);
  document.addEventListener('visibilitychange', () => { if (document.hidden) push(); });
  if (readMeta().dirty) schedule(2_000);
  emit();
  return wrap(storage);
}

// Reintento en segundo plano: si la nube tiene algo más nuevo, se avisa y se recarga para no pisarlo.
async function retry() {
  try {
    const before = readMeta();
    await withTimeout(connect(), INIT_TIMEOUT);
    if (readMeta().rev !== before.rev && !before.dirty) return reloadWith('Se cargó tu partida guardada en la nube.');
    emit(); push();
  } catch { /* sigue sin conexión */ }
}

export async function push() {
  if (A.status !== 'online' || pushing || !user || delPending()) return;
  const m = readMeta();
  if (!m.dirty) return;
  const raw = base.getItem(SAVE_KEY);
  if (!raw) { writeMeta({ ...m, dirty: false }); return; }
  pushing = true;
  try {
    const { data: r, error } = await client.rpc('save_game', { p_data: JSON.parse(raw), p_rev: m.rev });
    if (error) throw error;
    if (r.ok) {
      const now = readMeta(); // pudo cambiar mientras subía
      writeMeta({ uid: user.id, rev: r.rev, dirty: now.dirty && base.getItem(SAVE_KEY) !== raw });
      A.lastSync = Date.now(); A.error = null;
    } else if (r.error === 'conflicto') {
      const remote = await fetchRemote();
      if (remote) { adopt(remote); return reloadWith('Se cargó tu partida de otro dispositivo.'); }
      writeMeta({ ...m, rev: 0 }); schedule(1_000);
    } else A.error = r.error;
  } catch (e) { A.error = String(e?.message ?? e); }
  finally { pushing = false; emit(); }
}

// v17 · Telemetría: destino REST para fetch keepalive (sobrevive al cierre de la pestaña; supabase-js no lo expone).
// null sin sesión o durante el borrado de cuenta (no se manda nada de una cuenta que se está borrando).
export const restTarget = () => (A.status === 'online' && user && token && !wiping && !delPending() ? { url: URL, key: KEY, token } : null);
export const wipingNow = () => wiping;

// v17 · Confianza: RPC genérica (submit_report, delete_my_account). Sin conexión, sin la función o con error → { ok: false }.
export async function rpc(name, args) {
  if (A.status !== 'online' || !client || !user) return { ok: false, error: 'sin_conexion' };
  try {
    const { data, error } = await withTimeout(client.rpc(name, args), 8_000);
    return error || data?.ok === false ? { ok: false, error: error?.code ?? data?.error ?? 'error_nube' } : { ok: true, data };
  } catch { return { ok: false, error: 'error_nube' }; }
}

/* ---------- v17: borrar mi cuenta ---------- */
// Llama a delete_my_account() (borra la fila de saves y el usuario de auth.users de quien llama). Ver supabase/migrations.
async function finishDelete() {
  if (!client || !user) return false;
  try {
    const { data, error } = await withTimeout(client.rpc('delete_my_account'), 8_000);
    if (error || !data?.ok) return false;
  } catch { return false; }
  try { await client.auth.signOut({ scope: 'local' }); } catch { /* el usuario ya no existe: alcanza con olvidar la sesión */ }
  base.removeItem(DEL);
  writeMeta({ uid: null, rev: 0, dirty: !!base.getItem(SAVE_KEY) });
  user = null;
  return true;
}
// Borra la cuenta: en la nube ahora (si hay conexión) o al reconectar; en este dispositivo, siempre. Después recarga.
export async function deleteAccount() {
  clearTimeout(timer);
  try { base.setItem(DEL, String(Date.now())); } catch { /* sin almacenamiento: igual se borra lo local */ }
  const cloudDone = A.status === 'online' && !!user && (await finishDelete());
  wiping = true;
  for (const k of [SAVE_KEY, BACKUP_KEY, META]) { try { base.removeItem(k); } catch { /* nada */ } }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('oathbreak.') && k !== DEL) localStorage.removeItem(k);
    }
  } catch { /* nada */ }
  reloadWith(cloudDone ? 'Borramos tu cuenta y todos tus datos.'
    : 'Borramos tu cuenta en este dispositivo. La copia en la nube se borra sola cuando vuelvas a tener conexión.');
  return { ok: true, cloud: cloudDone };
}

const NOTICE = 'oathbreak.cloud.notice';
function reloadWith(msg) { try { sessionStorage.setItem(NOTICE, msg); } catch { /* nada */ } location.reload(); }
export function takeNotice() { try { const m = sessionStorage.getItem(NOTICE); sessionStorage.removeItem(NOTICE); return m; } catch { return null; } }

/* ---------- Cuenta ---------- */
const fail = (error) => {
  const code = error?.code ?? '', msg = String(error?.message ?? error ?? '').toLowerCase(), st = error?.status;
  if (code === 'email_exists' || msg.includes('already been registered')) return { ok: false, error: 'email_en_uso' };
  if (st === 429 || code.includes('rate_limit') || msg.includes('rate limit')) return { ok: false, error: 'demasiados_intentos' };
  if (code === 'otp_expired' || msg.includes('expired') || msg.includes('invalid')) return { ok: false, error: 'codigo_invalido' };
  if (code === 'otp_disabled' || code === 'user_not_found' || msg.includes('signups not allowed')) return { ok: false, error: 'sin_cuenta' };
  if (code === 'email_address_invalid' || msg.includes('email address')) return { ok: false, error: 'email_invalido' };
  return { ok: false, error: A.status === 'online' ? 'error_nube' : 'sin_conexion' };
};
const ready = () => (A.status === 'online' && client ? null : { ok: false, error: 'sin_conexion' });
const okEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Vincular la partida de invitado a un email (mismo playerId; no hay migración).
export async function linkEmail(email) {
  if (ready()) return ready();
  if (!okEmail(email)) return { ok: false, error: 'email_invalido' };
  await push();
  const { error } = await client.auth.updateUser({ email });
  return error ? fail(error) : { ok: true };
}
export async function verifyLink(email, code) {
  if (ready()) return ready();
  const { data, error } = await client.auth.verifyOtp({ email, token: code.trim(), type: 'email_change' });
  if (error) return fail(error);
  user = data.user ?? user; emit();
  return { ok: true };
}

// Entrar con un héroe ya vinculado (otro dispositivo): reemplaza la partida de invitado de este navegador.
export async function signInEmail(email) {
  if (ready()) return ready();
  if (!okEmail(email)) return { ok: false, error: 'email_invalido' };
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  return error ? fail(error) : { ok: true };
}
export async function verifySignIn(email, code) {
  if (ready()) return ready();
  const { error } = await client.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
  if (error) return fail(error);
  reloadWith('¡Listo! Cargamos tu héroe.');
  return { ok: true };
}

// Cerrar sesión: sube lo pendiente y borra la partida de este navegador (sigue a salvo en la nube).
export async function signOut() {
  if (ready()) return ready();
  await push();
  if (readMeta().dirty) return { ok: false, error: 'sin_guardar' };
  await client.auth.signOut();
  base.removeItem(SAVE_KEY);
  writeMeta({ uid: null, rev: 0, dirty: false });
  reloadWith('Cerraste sesión. Tu héroe quedó guardado en la nube.');
  return { ok: true };
}
