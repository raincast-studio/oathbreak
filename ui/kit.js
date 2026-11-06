// Kit de interfaz: DOM mínimo, formato, toasts, hojas emergentes y count-up. Sin dependencias.
import { sfx } from './audio.js';

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// h('button.btn.gold', { onclick }, 'Texto', otroNodo)
export function h(sel, props, ...kids) {
  const id = sel.match(/#([\w-]+)/)?.[1];
  const [tag, ...cls] = sel.replace(/#[\w-]+/, '').split('.');
  const el = document.createElement(tag || 'div');
  if (id) el.id = id;
  if (cls.length) el.className = cls.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
export const $ = (s, root = document) => root.querySelector(s);

// Íconos (SVG inline, heredan currentColor).
const P = {
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3.5 1.6 3.6 3.9.4-3 2.6.9 3.8L12 15l-3.4 1.9.9-3.8-3-2.6 3.9-.4z',
  base: 'M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  caza: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  social: 'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM1 20c0-3.9 3.1-7 7-7s7 3.1 7 7zm15.5-7c3.6 0 6.5 2.9 6.5 7h-6.2c0-2.8-1-5.2-2.7-6.8.8-.1 1.6-.2 2.4-.2z',
  personaje: 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5zm0 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm-4.5 9c.6-2 2.4-3 4.5-3s3.9 1 4.5 3z',
  star: 'M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5z',
  crown: 'M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z',
  close: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z',
  bell: 'M12 2a1.5 1.5 0 0 0-1.5 1.5v.7a6.5 6.5 0 0 0-5 6.3V15l-2 3v1h17v-1l-2-3v-4.5a6.5 6.5 0 0 0-5-6.3v-.7A1.5 1.5 0 0 0 12 2zm-2.6 18.5a2.6 2.6 0 0 0 5.2 0z',
  sound: 'M3 9v6h4l5 4V5L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
  bug: 'M12 4a4 4 0 0 1 4 4H8a4 4 0 0 1 4-4zM6 10h12v4a6 6 0 0 1-12 0zM2 12h3m14 0h3M3 7l3 2m15-2-3 2M3 19l3-2m15 2-3-2',
};
// Íconos de trazo (como en los mockups).
const STROKE = {
  misiones: 'M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a3 3 0 0 1-3-3V5M8 8h7M8 12h7M8 16h4',
  tienda: 'M4 8h16l-1.5 12h-13zM8 8a4 4 0 0 1 8 0',
  equipo: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
  revancha: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
};
// Íconos de varias capas (relleno con tonos por opacidad; 'evenodd' para huecos).
const SWORD = 'M12 1.5 13.6 4v11h-3.2V4zM7.4 15h9.2v2.1H7.4zM10.9 17.1h2.2v3.2h-2.2zM12 20a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 1 0 0-2.8z';
const MULTI = {
  // Cueva: roca con grietas, entrada oscura y borde interno del arco.
  guarida: [['M2 21c0-4 1-6.3 2.6-7.2C4.7 8.6 7.5 3.8 12.6 3.5c4.6-.3 7.2 3.6 7.6 7.6 1.4 1.5 1.8 4.6 1.8 9.9zM8.4 21c0-5.6 1.7-9.6 4.6-9.6s3.6 4.2 3.6 9.6zM10.9 5.3 9.6 8 7.3 9.4l.5.6 2.3-1.4 1.5-3.1zM17.1 8.2l1.2 2.4-.2 1.9.7.1.2-2.1-1.3-2.6z', { evenodd: true }],
    ['M8.4 21c0-5.6 1.7-9.6 4.6-9.6-1.7 1-2.8 4.1-2.8 9.6z']],
  // Arena: dos espadas cruzadas rellenas; la de atrás en un tono más apagado.
  arena: [[SWORD, { transform: 'rotate(-45 12 12)', opacity: 0.55 }], [SWORD, { transform: 'rotate(45 12 12)' }]],
};
export function icon(name, size = 22) {
  if (MULTI[name]) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('aria-hidden', 'true'); s.classList.add('ico');
    for (const [d, o = {}] of MULTI[name]) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d); p.setAttribute('fill', 'currentColor');
      if (o.evenodd) p.setAttribute('fill-rule', 'evenodd');
      if (o.opacity) p.setAttribute('opacity', o.opacity);
      if (o.transform) p.setAttribute('transform', o.transform);
      s.append(p);
    }
    return s;
  }
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true'); s.classList.add('ico');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  if (STROKE[name]) {
    p.setAttribute('d', STROKE[name]); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2.2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  } else { p.setAttribute('d', P[name]); p.setAttribute('fill', 'currentColor'); }
  s.append(p);
  return s;
}

// Formato (es-AR)
const NF = new Intl.NumberFormat('es-AR');
export const num = (n) => NF.format(Math.round(n));
export function clock(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000)), hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  const p2 = (x) => String(x).padStart(2, '0');
  return hh ? `${hh}:${p2(mm)}:${p2(ss)}` : `${mm}:${p2(ss)}`;
}
export const uid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

// Count-up: anima el número desde el valor mostrado hasta el nuevo (sin animación si reduced-motion).
// v15: cifras compactas para las fichas de la barra superior (12.400 → 12,4k; 250.000 → 250k), así no se cortan.
// Cifras compactas para la barra superior: 9.999 · 12,4k · 999k · 1,2M. v15.1: antes 999.999 salía "1.000k" y
// 1.234.567, "1.235k" (con el punto de miles se lee como 1,2k).
export const compact = (n) => {
  n = Math.round(n);
  const a = Math.abs(n);
  if (a < 10_000) return num(n);
  const fmt = (v, unit) => `${Math.abs(v) < 99.95 ? v.toFixed(1).replace('.', ',').replace(/,0$/, '') : num(v)}${unit}`;
  return a < 999_500 ? fmt(n / 1000, 'k') : fmt(n / 1e6, 'M');
};
// v17: delay (ms) para arrancar cuando llegan las monedas; devuelve la duración (0 si no anima) para el sonido.
export function countUp(el, to, fmt = num, delay = 0) {
  const from = Number(el.dataset.v ?? to);
  el.dataset.v = to;
  cancelAnimationFrame(el._raf); clearTimeout(el._bt);
  if (from === to || reduced()) { el.textContent = fmt(to); return 0; }
  el._bt = setTimeout(() => { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }, delay);
  const t0 = performance.now() + delay, dur = Math.min(900, 300 + Math.abs(to - from) * 2);
  const step = (t) => {
    const k = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - (1 - k) ** 3;
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
  return dur;
}

/* ---------- v17: partículas CSS livianas (se borran solas; nada con reduced-motion) ---------- */
export function burst(x, y, { n = 10, cls = '', spread = 70, root = document.body } = {}) {
  if (reduced()) return;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.7, r = spread * (0.55 + Math.random() * 0.6);
    const p = h(`span.pt${cls}`, { 'aria-hidden': 'true', style: { left: `${x}px`, top: `${y}px`, '--dx': `${(Math.cos(a) * r) | 0}px`, '--dy': `${(Math.sin(a) * r) | 0}px`, '--dl': `${(Math.random() * 90) | 0}ms` } });
    p.addEventListener('animationend', () => p.remove());
    root.append(p);
  }
}
// Monedas que vuelan desde un rectángulo (el botón tocado) hasta el oro de la barra. Devuelve cuándo llega la primera.
export function flyCoins(from, to, n = 6) {
  const b = to?.getBoundingClientRect?.();
  if (!from || !b || reduced() || !b.width) return 0;
  const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2, x1 = b.left + 14, y1 = b.top + b.height / 2;
  burst(x0, y0, { n: 8, cls: '.gold', spread: 44 });
  for (let i = 0; i < n; i++) {
    const c = h('span.fly-coin', { 'aria-hidden': 'true', style: { left: `${x0 + (Math.random() - 0.5) * 30}px`, top: `${y0 + (Math.random() - 0.5) * 16}px`,
      '--dx': `${x1 - x0}px`, '--dy': `${y1 - y0}px`, '--arc': `${-40 - Math.random() * 50}px`, animationDelay: `${i * 55}ms` } });
    c.addEventListener('animationend', () => c.remove());
    document.body.append(c);
  }
  return 520;
}

/* ---------- Toasts: máximo 3, 2,5 s, aria-live ---------- */
let toastBox;
export function toast(text, kind = 'ok') {
  if (!toastBox?.isConnected) toastBox = $('#toasts');
  if (!toastBox) return;
  const t = h(`div.toast.${kind}`, { role: kind === 'err' ? 'alert' : 'status' }, text);
  if (kind === 'prize') sfx('notify', { soft: true });
  toastBox.append(t);
  while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), reduced() ? 0 : 200);
  }, 2500);
}

/* ---------- Hojas emergentes (sheets) ----------
   Mobile: hoja inferior que se cierra arrastrando hacia abajo. Escritorio: modal centrado.
   Una a la vez; Esc, fondo o "atrás" del navegador la cierran; el foco queda atrapado adentro. */
let current = null;
export const sheetOpen = () => !!current;

export function openSheet({ title, body, onClose }) {
  // v17: hoja desde hoja → se reutiliza la entrada del historial (antes el history.back() asíncrono cerraba la hoja nueva).
  const reuse = !!current?.pushed, prevFocus = reuse ? current.prevFocus : document.activeElement;
  closeSheet(true, reuse);
  sfx('open');
  const closeBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Cerrar', onclick: () => closeSheet() }, icon('close', 20));
  const panel = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title', tabIndex: -1 },
    h('div.sheet-grab', { 'aria-hidden': 'true' }),
    h('header.sheet-head', h('h2#sheet-title.display', title), closeBtn),
    h('div.sheet-body', body));
  const scrim = h('div.scrim', { onclick: () => closeSheet() });
  const layer = h('div.sheet-layer', scrim, panel);
  document.body.append(layer);
  if ($('#app')) $('#app').inert = true;
  document.documentElement.classList.add('locked');
  requestAnimationFrame(() => layer.classList.add('in'));
  (panel.querySelector('button:not(.icon-btn), [href], input') ?? panel).focus({ preventScroll: true });

  // Arrastre para cerrar (solo hoja inferior). Desde la manija o el encabezado, o desde el cuerpo si está arriba de todo.
  let y0 = null, dy = 0, t0 = 0;
  const down = (e) => {
    if (matchMedia('(min-width: 1024px)').matches) return;
    const fromHead = e.target.closest('.sheet-grab, .sheet-head');
    const body = panel.querySelector('.sheet-body');
    if (!fromHead && body.scrollTop > 0) return;
    if (e.target.closest('button, input, a')) return;
    y0 = e.clientY; dy = 0; t0 = performance.now();
    panel.setPointerCapture(e.pointerId);
    panel.style.transition = 'none';
  };
  const move = (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    panel.style.transform = `translateY(${dy}px)`;
  };
  const up = () => {
    if (y0 == null) return;
    const v = dy / Math.max(1, performance.now() - t0);
    y0 = null; panel.style.transition = ''; panel.style.transform = '';
    if (dy > 110 || v > 0.6) closeSheet();
  };
  panel.addEventListener('pointerdown', down);
  panel.addEventListener('pointermove', move);
  panel.addEventListener('pointerup', up);
  panel.addEventListener('pointercancel', up);

  current = { layer, panel, prevFocus, onClose, pushed: reuse };
  if (!reuse) try { history.pushState({ sheet: 1 }, ''); current.pushed = true; } catch { /* el marco puede no permitirlo */ }
  return panel;
}

export function closeSheet(silent = false, fromPop = false) {
  if (!current) return;
  const { layer, prevFocus, onClose, pushed } = current;
  current = null;
  // v17-qa: si la hoja se abrió sobre el informe ("Reportar a…"), el juego sigue tapado e inerte hasta cerrar el informe.
  if (!document.querySelector('.hunt-layer.in')) {
    if ($('#app')) $('#app').inert = false;
    document.documentElement.classList.remove('locked');
  }
  layer.classList.remove('in');
  layer.classList.add('out');
  setTimeout(() => layer.remove(), reduced() ? 0 : 260);
  if (pushed && !fromPop) { try { history.back(); } catch { /* nada */ } }
  if (!silent) { sfx('close'); onClose?.(); }
  prevFocus?.focus?.({ preventScroll: true });
}

addEventListener('popstate', () => { if (current) closeSheet(false, true); });
addEventListener('keydown', (e) => {
  if (!current) return;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key === 'Tab') { // foco atrapado
    const f = [...current.panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

/* ---------- Personajes: evolución visual por nivel (30/10) ---------- */
// El nivel define la etapa. Cortes: 1·5·10·15·25·32·40·60·80·100. Solo interfaz: la fachada no se toca.
export const STAGE_LEVELS = [1, 5, 10, 15, 25, 32, 40, 60, 80, 100];
export const stageOf = (level = 1) => { let s = 1; STAGE_LEVELS.forEach((l, i) => { if (level >= l) s = i + 1; }); return s; };
// Bandos con las 10 etapas entregadas (Héroe 30/10, Villano 31/10).
const STAGED = { hero: true, villain: true };
const SPRITE = { hero: 'ui/img/hero.webp', villain: 'ui/img/villain.webp' };
const fac = (f) => (f === 'villain' ? 'villain' : 'hero');
const pad = (n) => String(n).padStart(2, '0');
export const spriteSrc = (faction, level) => { const f = fac(faction); return STAGED[f] ? `ui/img/${f}/s${pad(stageOf(level))}.webp` : SPRITE[f]; };
const faceSrc = (faction, level) => { const f = fac(faction); return STAGED[f] ? `ui/img/${f}/s${pad(stageOf(level))}_av.webp` : SPRITE[f]; };
// Cuerpo entero.
export const sprite = (faction, cls = '', level = 1) => h(`img.sprite${cls}`, { src: spriteSrc(faction, level), alt: '', draggable: false, decoding: 'async', 'data-stage': stageOf(level) });
// Retrato redondo (cabeza). Con etapas usa el recorte de la cara; si no, el sprite recortado por CSS.
export const avatar = (faction, name, cls = '', level = 1) => h(`span.avatar${cls}`, { 'data-f': faction, 'aria-hidden': 'true', title: name },
  h(`img.face${STAGED[fac(faction)] ? '.cut' : ''}`, { src: faceSrc(faction, level), alt: '', draggable: false, decoding: 'async' }));
