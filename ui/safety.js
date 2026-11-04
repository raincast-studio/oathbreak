// v17 · Confianza (interfaz): Reportar y Silenciar jugadores. Se engancha en la guarida ajena (Social), en los rivales
// de la Arena y en el informe de combate. Los reportes van a una cola local acotada (src/moderation.js) que se envía
// a la nube con la RPC submit_report cuando existe; si falla o no existe, quedan en cola sin errores visibles.
import * as Mod from '../src/moderation.js';
import * as cloud from './cloud.js';
import { h, toast, openSheet, closeSheet } from './kit.js';
import { errText } from './errors.js';

let G = null; // la fachada (la capturan los ganchos de Social y Arena; el informe de combate la reutiliza)
export const bindGame = (game) => { if (game) G = game; };

const LS = (() => { try { localStorage.getItem('_'); return localStorage; } catch { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; } })();
export const reportQueue = () => Mod.readReports(LS);

/* ---------- Envío a la nube (con freno: como mucho un intento cada 10 min, salvo reporte nuevo) ---------- */
let flushing = false, lastTry = 0;
export async function flushQueue(force = false) {
  if (flushing || cloud.account().status !== 'online' || !Mod.readReports(LS).length) return;
  if (!force && Date.now() - lastTry < 600_000) return;
  flushing = true; lastTry = Date.now();
  try { await Mod.flushReports(LS, (list) => cloud.rpc('submit_report', { p_reports: list })); }
  finally { flushing = false; }
}
cloud.onChange(() => { flushQueue(); });

/* ---------- Hoja "Reportar" ---------- */
const REASONS = [
  ['nombre', 'Nombre ofensivo', 'Insultos, contenido sexual, odio o se hace pasar por el equipo.'],
  ['trampa', 'Posible trampa', 'Algo que no debería poder pasar en el juego.'],
  ['otro', 'Otro motivo', 'Contanos en la nota.'],
];

// target: { id, name } · where: guarida | arena | combate | social · ref: id del informe (opcional).
export function reportSheet(target, where, ref = null, { onClose } = {}) {
  let reason = null;
  const send = h('button.btn.crimson.wide', { type: 'submit', disabled: true }, 'Enviar reporte');
  const count = h('span.muted.hint.tnum', `0/${Mod.NOTE_MAX}`);
  const note = h('textarea.name-input.rr-note', { rows: 2, maxLength: Mod.NOTE_MAX, placeholder: 'Nota opcional (qué pasó, dónde lo viste)', 'aria-label': 'Nota opcional',
    oninput: () => { count.textContent = `${Array.from(note.value).length}/${Mod.NOTE_MAX}`; } });
  const msg = h('p.muted', { role: 'status' });
  const options = h('div.rr-list', { role: 'radiogroup', 'aria-label': 'Motivo' }, REASONS.map(([k, label, desc]) => h('label.rr-opt',
    h('input', { type: 'radio', name: 'rr-opt', value: k, onchange: () => { reason = k; send.disabled = false; } }),
    h('span.rr-txt', h('strong', label), h('span.muted', desc)))));

  const submit = (e) => {
    e.preventDefault();
    if (!reason) { msg.textContent = errText('motivo_invalido'); msg.classList.add('err-text'); return; }
    const r = G ? G.reportPlayer(target.id, reason, note.value, where, ref)
      : Mod.makeReport({ target, reason, note: note.value, where, ref, now: Date.now() });
    if (!r.ok) { msg.textContent = errText(r.error); msg.classList.add('err-text'); return; }
    Mod.queueReport(LS, r.report);
    flushQueue(true);
    done();
  };
  const done = () => {
    const muted = isMuted(target.id);
    openSheet({ title: 'Reporte enviado', onClose, body: h('div.stack.rr-done',
      h('span.rr-check', { 'aria-hidden': 'true' }, '✓'),
      h('p', h('strong', '¡Gracias por avisar!'), ' Lo revisa una persona del equipo. Si confirmamos el problema, aplicamos las sanciones de los Términos.'),
      h('p.muted.hint', `${target.name} no se entera de quién lo reportó.`),
      G && !muted ? h('button.btn.ghost.wide', { type: 'button', onclick: (ev) => { if (mute(target, true)) { ev.currentTarget.disabled = true; ev.currentTarget.textContent = 'Silenciado'; } } }, `Silenciar también a ${target.name}`) : null,
      h('button.btn.gold.wide', { type: 'button', onclick: () => closeSheet() }, 'Listo')) });
  };

  openSheet({ title: `Reportar a ${target.name}`, onClose, body: h('form.stack', { onsubmit: submit },
    h('p.muted', '¿Por qué lo reportás? Elegí un motivo.'),
    options,
    h('div.rr-note-box', note, count),
    send, msg,
    h('button.link-btn', { type: 'button', onclick: () => closeSheet() }, 'Cancelar')) });
}

/* ---------- Silenciar ---------- */
const isMuted = (id) => { const m = G?.muted(); return !!m?.ok && m.list.some((x) => x.id === id); };
function mute(target, on) {
  const r = G?.mute(target.id, on);
  if (!r?.ok) { toast(errText(r?.error ?? 'jugador_invalido'), 'err'); return false; }
  toast(on ? `Silenciaste a ${target.name}: no vas a ver sus solicitudes, regalos ni firmas.` : `Ya no está silenciado ${target.name}.`);
  return true;
}

/* ---------- Ganchos ---------- */
// Guarida ajena: fila de enlaces "Reportar · Silenciar".
export function playerLinks(ctx, target, where) {
  bindGame(ctx.game);
  const muted = isMuted(target.id);
  return h('div.safety-links',
    h('button.link-btn', { type: 'button', onclick: () => reportSheet(target, where) }, 'Reportar'),
    h('button.link-btn', { type: 'button', onclick: () => { if (mute(target, !muted)) { closeSheet(true); ctx.refresh?.(); } } }, muted ? 'Quitar silencio' : 'Silenciar'));
}
// Rival de la Arena: botón "⋯" que abre las opciones del jugador.
export function playerMenuBtn(ctx, target, where) {
  bindGame(ctx.game);
  return h('button.more-btn', { type: 'button', 'aria-label': `Más opciones de ${target.name}`, onclick: () => {
    const muted = isMuted(target.id);
    openSheet({ title: target.name, body: h('div.stack',
      h('button.btn.ghost.wide', { type: 'button', onclick: () => reportSheet(target, where) }, 'Reportar'),
      h('button.btn.ghost.wide', { type: 'button', onclick: () => { if (mute(target, !muted)) { closeSheet(true); ctx.refresh?.(); } } }, muted ? 'Quitar silencio' : 'Silenciar'),
      h('p.muted.hint', 'Silenciar oculta sus solicitudes de amistad, sus regalos y sus firmas en tu libro de visitas.')) });
  } }, h('span', { 'aria-hidden': 'true' }, '⋯'));
}
// Informe de combate: enlace "Reportar a X".
export const reportLink = (foe, ref) => (foe?.id
  ? h('button.link-btn.rr-report', { type: 'button', onclick: () => reportSheet({ id: foe.id, name: foe.name }, 'combate', typeof ref === 'string' ? ref : null) }, `Reportar a ${foe.name}`)
  : null);

// Cuenta: lista de silenciados con "Quitar".
export function mutedCard(ctx) {
  bindGame(ctx.game);
  const m = ctx.game.muted();
  if (!m.ok || !m.list.length) return null;
  return h('details.done-list.muted-list',
    h('summary', `Jugadores silenciados (${m.list.length})`),
    h('ul.people', m.list.map((x) => h('li.person',
      h('div.t-info', h('strong', x.name)),
      h('button.btn.ghost.small', { type: 'button', onclick: () => { if (mute(x, false)) ctx.refresh(); } }, 'Quitar')))));
}
