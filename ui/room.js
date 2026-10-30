// Dibujo de una sala 8×8 (propia o ajena). Marcadores en CSS hasta tener sprites: color por categoría,
// borde por rareza, iniciales del nombre. Solo presentación: la validez de cada posición la decide la fachada.
import { CFG, ITEM } from '../src/game.js';
import { h } from './kit.js';

export const W = CFG.lair.room.w, H = CFG.lair.room.h;
export const footprint = (id, rot) => { const s = ITEM[id].size; return rot % 2 ? [s[1], s[0]] : s; };

// Paletas de piso y pared (placeholder visual por id).
const FLOOR = { piso_piedra: ['#4A4560', '#3F3A54'], piso_madera: ['#7A5234', '#6B4629'], piso_baldosa: ['#5E6B7A', '#52606E'],
  piso_marmol: ['#CFC8DD', '#BDB5CE'], piso_alfombra: ['#8E2D4A', '#7E2440'], piso_mosaico: ['#2E6E8E', '#C9A13B'], piso_estrellas: ['#1B1450', '#2B2170'] };
const WALL = { pared_ladrillo: '#7A3B2E', pared_yeso: '#B9AFC8', pared_madera: '#5C3D24', pared_tapiz: '#6A2A5E', pared_vitral: '#2F5C8F', pared_mural: '#C9A13B' };
const RARITY = { comun: 'Común', raro: 'Raro', epico: 'Épico', legendario: 'Legendario' };
export const rarityName = (r) => RARITY[r] ?? r;
export const CAT = { piso: 'Piso', pared: 'Pared', mueble: 'Mueble', iluminacion: 'Iluminación', trofeo: 'Trofeo', companero: 'Compañero', estandarte: 'Estandarte' };

export const initials = (name) => name.split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || name[0].toUpperCase();

// room: { floor, wall, items:[{uid?, id, x, y, rot, on}] }
// opts: { onCell(x,y), onItem(item, ev), onItemDown(item, ev), selected: uid, ghost: {id, x, y, rot, bad}, readonly }
export function renderRoom(room, opts = {}) {
  const [f1, f2] = FLOOR[room.floor] ?? FLOOR.piso_piedra;
  const grid = h('div.room-grid', {
    style: { '--f1': f1, '--f2': f2 },
    'aria-label': `Sala de ${W} por ${H}${room.items.length ? `, ${room.items.length} objetos` : ', vacía'}`,
    role: opts.readonly ? 'img' : 'grid',
  });
  if (!opts.readonly) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      grid.append(h('button.cell', { type: 'button', tabIndex: -1, 'aria-label': `Casilla ${x + 1}, ${y + 1}`, 'data-x': x, 'data-y': y,
        style: { gridColumn: x + 1, gridRow: y + 1 }, onclick: () => opts.onCell?.(x, y) }));
    }
  }
  // Primero lo que está en el piso, después lo apilado (queda arriba).
  const items = [...room.items].sort((a, b) => Number(!!a.on) - Number(!!b.on));
  for (const it of items) grid.append(piece(it, opts));
  if (opts.ghost) grid.append(ghostPiece(opts.ghost));
  return h('div.room', h('div.room-wall', { style: { '--wall': WALL[room.wall] ?? WALL.pared_ladrillo } }), grid);
}

function piece(p, opts) {
  const def = ITEM[p.id];
  const [w, hh] = footprint(p.id, p.rot);
  const el = h(`div.piece.cat-${def.cat}.r-${def.rarity}${p.on ? '.on' : ''}${opts.selected && opts.selected === p.uid ? '.sel' : ''}`, {
    style: { gridColumn: `${p.x + 1} / span ${w}`, gridRow: `${p.y + 1} / span ${hh}` },
    title: def.name,
  }, h('span.p-label', initials(def.name)));
  if (!opts.readonly) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${def.name}${p.on ? ' (apilado)' : ''}`);
    el.addEventListener('click', (e) => { e.stopPropagation(); opts.onItem?.(p, e); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onItem?.(p, e); } });
    if (opts.onItemDown) el.addEventListener('pointerdown', (e) => opts.onItemDown(p, e, el));
  }
  return el;
}

function ghostPiece(g) {
  const [w, hh] = footprint(g.id, g.rot);
  const cw = Math.min(w, W - g.x), ch = Math.min(hh, H - g.y);
  return h(`div.drop-ghost${g.bad ? '.bad' : ''}`, { 'aria-hidden': 'true', style: { gridColumn: `${g.x + 1} / span ${cw}`, gridRow: `${g.y + 1} / span ${ch}` } });
}

// Casilla bajo un punto de pantalla (para arrastrar).
export function cellAt(grid, clientX, clientY) {
  const r = grid.getBoundingClientRect();
  const x = Math.floor(((clientX - r.left) / r.width) * W), y = Math.floor(((clientY - r.top) / r.height) * H);
  return x >= 0 && y >= 0 && x < W && y < H ? { x, y } : null;
}
