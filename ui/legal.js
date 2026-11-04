// v17 · Confianza: Términos y condiciones y Política de privacidad, legibles en el juego (hoja emergente).
// La fuente es docs/legal/*.md (lo que revisa el abogado); acá se dibuja con un Markdown mínimo y seguro (sin innerHTML).
import { h, openSheet } from './kit.js';

// Versión que acepta el jugador al jurar lealtad (queda en la partida: player.consent). Cambiarla al publicar textos nuevos.
export const TERMS_VERSION = '2026-11-borrador';
const DOCS = {
  terminos: ['Términos y condiciones', 'docs/legal/terminos.md'],
  privacidad: ['Política de privacidad', 'docs/legal/privacidad.md'],
};
const cache = new Map();

export async function openLegal(doc) {
  const [title, url] = DOCS[doc] ?? DOCS.terminos;
  const body = h('div.legal-doc', h('p.muted', 'Cargando…'));
  openSheet({ title, body });
  try {
    if (!cache.has(url)) {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      cache.set(url, await r.text());
    }
    body.replaceChildren(...render(cache.get(url)));
  } catch {
    body.replaceChildren(h('p', 'No pudimos cargar el texto. Revisá tu conexión y probá de nuevo.'));
  }
}

export const legalLink = (doc, label) => h('button.link-btn', { type: 'button', onclick: () => openLegal(doc) }, label);

// **negrita** y [texto](https://… | mailto:…). Cualquier otro corchete queda como texto ([RAZÓN SOCIAL]).
function inline(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:https:\/\/|mailto:)[^)\s]+)\)/g;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > i) out.push(text.slice(i, m.index));
    out.push(m[1] != null ? h('strong', m[1]) : h('a', { href: m[3], target: '_blank', rel: 'noopener noreferrer' }, m[2]));
    i = m.index + m[0].length;
  }
  if (i < text.length) out.push(text.slice(i));
  return out;
}

// # título (se omite: ya está en la hoja) · ## y ### · párrafos · listas con "- " · "> " aviso destacado.
function render(md) {
  const out = [];
  let para = [], list = null;
  const flush = () => {
    if (para.length) out.push(h('p', inline(para.join(' '))));
    para = [];
    list = null;
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^# /.test(line)) { flush(); continue; }
    const hd = line.match(/^(#{2,3}) (.*)$/);
    if (hd) { flush(); out.push(h(hd[1].length === 2 ? 'h2.display' : 'h3', inline(hd[2]))); continue; }
    if (line.startsWith('> ')) { flush(); out.push(h('p.legal-draft', inline(line.slice(2)))); continue; }
    const li = line.match(/^[-*] (.*)$/);
    if (li) {
      if (para.length) { out.push(h('p', inline(para.join(' ')))); para = []; }
      if (!list) { list = h('ul'); out.push(list); }
      list.append(h('li', inline(li[1])));
      continue;
    }
    if (list && /^\s{2,}/.test(raw)) { list.lastElementChild?.append(' ', ...inline(line)); continue; }
    list = null;
    para.push(line);
  }
  flush();
  return out;
}
