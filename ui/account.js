// Cuenta: hoja "Guardá tu héroe" (vincular email con código), "Ya tengo un héroe" (entrar en otro dispositivo) y tarjeta de Personaje.
import * as cloud from './cloud.js';
import { h, icon, toast, openSheet, closeSheet } from './kit.js';
import { errText } from './errors.js';

const NAG = 'oathbreak.cloud.nag';
const DAY = 86_400_000;
// Código pedido y todavía sin ingresar: { kind: 'link' | 'signin', email, ts }. Vale 1 h.
const PEND = 'oathbreak.cloud.pending';
export const pending = () => { try { const p = JSON.parse(localStorage.getItem(PEND)); return p && Date.now() - p.ts < 3_600_000 ? p : null; } catch { return null; } };
const setPending = (p) => { try { if (p) localStorage.setItem(PEND, JSON.stringify({ ...p, ts: Date.now() })); else localStorage.removeItem(PEND); } catch { /* nada */ } };
const nagTs = () => { try { return Number(localStorage.getItem(NAG)) || 0; } catch { return 0; } };
const snooze = () => { try { localStorage.setItem(NAG, String(Date.now())); } catch { /* nada */ } };

// Días jugando como invitado (para el aviso de los 7 días).
export const guestDays = () => { const a = cloud.account(); return a.guest && a.createdAt ? Math.floor((Date.now() - a.createdAt) / DAY) : 0; };

// "Guardá tu héroe" aparece tras la primera caza ganada o al llegar al nivel 3; si se cierra, vuelve a las 24 h.
export function maybeNag(player) {
  const a = cloud.account();
  if (a.status !== 'online' || !a.guest || a.pendingEmail || pending()) return;
  if (player.record.w < 1 && player.level < 3) return;
  if (Date.now() - nagTs() < DAY) return;
  if (document.querySelector('.sheet-layer, .hunt-layer, .onb, .report-layer')) return;
  snooze();
  linkSheet({ nag: true });
}

// Formulario de dos pasos: email → código (6 a 10 dígitos, según la configuración de Supabase).
function codeFlow({ kind, title, intro, send, verify, done, extra, resume }) {
  let email = resume?.email ?? '';
  const msg = h('p.muted', { role: 'status' });
  const err = (r) => { msg.textContent = errText(r.error); msg.classList.add('err-text'); };
  const busy = (btn, on) => { btn.disabled = on; btn.toggleAttribute('aria-busy', on); };

  const step1 = () => {
    const input = h('input.name-input', { type: 'email', inputMode: 'email', autocomplete: 'email', placeholder: 'tu@email.com', 'aria-label': 'Email', value: email });
    const btn = h('button.btn.gold.wide', { type: 'submit' }, 'Mandarme el código');
    const form = h('form.stack', { onsubmit: async (e) => {
      e.preventDefault(); busy(btn, true);
      email = input.value.trim();
      const r = await send(email);
      busy(btn, false);
      if (!r.ok) return err(r);
      setPending({ kind, email });
      step2();
    } }, intro, input, btn, msg, extra ?? null);
    openSheet({ title, body: form });
    input.focus();
  };

  const step2 = () => {
    msg.textContent = ''; msg.classList.remove('err-text');
    const input = h('input.name-input.code-input', { type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 10, pattern: '[0-9]{6,10}', placeholder: '••••••••', 'aria-label': 'Código del email' });
    const btn = h('button.btn.gold.wide', { type: 'submit' }, 'Confirmar');
    const form = h('form.stack', { onsubmit: async (e) => {
      e.preventDefault();
      input.value = input.value.replace(/\D/g, '');
      if (!/^\d{6,10}$/.test(input.value)) return err({ error: 'codigo_invalido' });
      busy(btn, true);
      const r = await verify(email, input.value);
      busy(btn, false);
      if (!r.ok) return err(r);
      setPending(null);
      closeSheet(true); done?.();
    } },
      h('p', 'Te mandamos un código a ', h('strong', email), '. Puede tardar un minuto; revisá también el spam.'),
      input, btn, msg,
      h('div.row',
        h('button.link-btn', { type: 'button', onclick: step1 }, 'Cambiar email'),
        h('button.link-btn', { type: 'button', onclick: async (e) => { busy(e.currentTarget, true); const r = await send(email); busy(e.currentTarget, false); if (r.ok) toast('Código reenviado'); else err(r); } }, 'Reenviar código')));
    openSheet({ title, body: form });
    input.focus();
  };

  if (resume) step2(); else step1();
}

export function linkSheet({ nag = false, onDone, resume } = {}) {
  codeFlow({
    kind: 'link', resume,
    title: 'Guardá tu héroe',
    intro: h('div.stack',
      h('p', nag ? '¡Buen comienzo! Hoy tu héroe vive solo en este navegador. Vinculalo a tu email para no perderlo y jugar desde cualquier dispositivo.'
        : 'Vinculá tu héroe a tu email para no perderlo y jugar desde cualquier dispositivo.'),
      h('p.muted.hint', 'Sin contraseña: cada vez que entres desde otro lado te mandamos un código.')),
    send: cloud.linkEmail,
    verify: cloud.verifyLink,
    done: () => { toast('¡Héroe guardado en la nube!', 'prize'); onDone?.(); },
    extra: nag ? h('button.link-btn', { type: 'button', onclick: () => closeSheet() }, 'Más tarde') : null,
  });
}

export function signInSheet({ fromGame = true, resume } = {}) {
  codeFlow({
    kind: 'signin', resume,
    title: 'Ya tengo un héroe',
    intro: h('div.stack',
      h('p', 'Entrá con el email que vinculaste y seguí con tu héroe en este dispositivo.'),
      fromGame ? h('p.fee-alert', icon('shield', 18), h('span', 'La partida de invitado de este navegador se reemplaza por la de tu cuenta.')) : null),
    send: cloud.signInEmail,
    verify: cloud.verifySignIn,
  });
}

// Tarjeta de la sección Cuenta (Personaje).
export function accountCard(ctx) {
  const a = cloud.account();
  const ago = (t) => { if (!t) return 'todavía no'; const m = Math.floor((Date.now() - t) / 60_000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h`; };
  const sync = a.status === 'offline' ? 'Sin conexión: se guarda en este dispositivo y se sube cuando vuelva.'
    : a.status === 'loading' ? 'Conectando…'
    : a.dirty ? 'Guardando en la nube…' : `Guardado en la nube ${ago(a.lastSync)}.`;
  const days = guestDays();
  const pend = pending() ?? (a.pendingEmail ? { kind: 'link', email: a.pendingEmail } : null);
  return h('section.card',
    h('div.sec-head', h('h2.display', 'Cuenta'), h(`span.badge-acc.${a.guest ? 'guest' : 'linked'}`, a.guest ? 'Invitado' : 'Vinculada')),
    a.guest
      ? h('p', 'Tu héroe todavía no está vinculado a un email. Si borrás los datos del navegador, lo perdés.')
      : h('p', 'Email: ', h('strong', a.email)),
    a.guest && days >= 7 ? h('p.fee-alert', icon('shield', 18), h('span', h('strong', `Hace ${days} días que jugás como invitado.`), ' Los invitados sin vincular se borran a los 30 días sin entrar.')) : null,
    h('p.muted.tnum', sync),
    a.guest && pend
      ? h('div.stack',
        h('p.note', 'Ya te mandamos un código a ', h('strong', pend.email), '.'),
        h('button.btn.gold.wide', { type: 'button', disabled: a.status !== 'online', onclick: () => (pend.kind === 'signin' ? signInSheet({ resume: pend }) : linkSheet({ resume: pend, onDone: () => ctx.refresh() })) }, 'Ingresar el código'),
        h('button.link-btn', { type: 'button', onclick: () => { setPending(null); ctx.refresh(); } }, 'Usar otro email'))
    : a.guest
      ? h('div.stack',
        h('button.btn.gold.wide', { type: 'button', disabled: a.status !== 'online', onclick: () => linkSheet({ onDone: () => ctx.refresh() }) }, 'Guardar mi héroe'),
        h('button.link-btn', { type: 'button', disabled: a.status !== 'online', onclick: () => signInSheet() }, 'Ya tengo un héroe'))
      : h('button.btn.ghost.wide', { type: 'button', onclick: async (e) => {
        e.currentTarget.disabled = true;
        const r = await cloud.signOut();
        if (!r.ok) { e.currentTarget.disabled = false; toast(errText(r.error), 'err'); }
      } }, 'Cerrar sesión en este dispositivo'));
}
