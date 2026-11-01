// Pestaña Guarida: sala con grilla (colocar, arrastrar, rotar, apilar), edificios + Taller y tiendas.
import { CFG, ITEM } from '../../src/game.js';
import { h, icon, num, toast, openSheet, closeSheet } from '../kit.js';
import { renderRoom, footprint, cellAt, swatch, rarityName, CAT, W, H } from '../room.js';
export const title = 'Guarida';

// Estado de la interfaz (no del juego): sub-pestaña, sala visible y modo de edición.
const UI = { sub: 'sala', room: 0, mode: null, selected: null, shop: 'oro' };
// mode: { uid, id, rot, from?: {x, y, rot} }  → colocando un objeto del inventario o moviendo uno colocado

export function render(ctx) {
  const lr = ctx.game.lair();
  if (!lr.ok) return h('p', 'No se pudo cargar la guarida.');
  if (ctx.S.intent === 'tienda' || ctx.S.intent === 'edificios') { UI.sub = ctx.S.intent; UI.mode = null; UI.selected = null; }
  if (UI.room >= lr.rooms.length) UI.room = 0;
  const subs = [['sala', 'Sala'], ['edificios', 'Edificios'], ['tienda', 'Tienda']];
  return h('section.stack',
    h('div.lair-head',
      h('div', h('h1.display', 'Tu guarida'), h('p.muted', `Prestigio ${num(lr.prestige.total)}${lr.prestige.sets.length ? ` · Sets: ${lr.prestige.sets.map((s) => s.name).join(', ')}` : ''}`)),
      h('span.renown-chip.tnum', { title: 'Renombre' }, icon('crown', 16), num(lr.visits.renown))),
    segmented(subs, UI.sub, (k) => { UI.sub = k; UI.mode = null; UI.selected = null; ctx.refresh(); }),
    UI.sub === 'sala' ? roomView(ctx, lr) : UI.sub === 'edificios' ? buildingsView(ctx, lr) : shopView(ctx));
}

export function segmented(items, cur, onPick) {
  return h('div.seg', { role: 'tablist' }, items.map(([k, label]) => h('button.seg-btn', { type: 'button', role: 'tab', 'aria-selected': String(k === cur), onclick: () => onPick(k) }, label)));
}

/* ---------- Sala ---------- */
function roomView(ctx, lr) {
  const room = lr.rooms[UI.room];
  const placed = room.items;
  const sel = placed.find((p) => p.uid === UI.selected);
  const mode = UI.mode;

  // Comandos de edición (cada uno es una operación idempotente con freno al doble toque).
  const placeNew = (x, y) => ctx.act(null, (g) => g.placeItem(mode.uid, UI.room, x, y, mode.rot), (r) => (r.stacked ? 'Apilado' : 'Colocado'));
  const moveTo = (p, x, y, rot) => ctx.act(null, (g) => {
    const kids = placed.filter((c) => c.on === p.uid);
    g.removeItem(p.uid);
    const r = g.placeItem(p.uid, UI.room, x, y, rot);
    if (!r.ok) { // vuelve a donde estaba, con lo que tenía encima
      g.placeItem(p.uid, UI.room, p.x, p.y, p.rot);
      for (const c of kids) g.placeItem(c.uid, UI.room, c.x, c.y, c.rot);
      return r;
    }
    let lost = 0;
    for (const c of kids) if (!g.placeItem(c.uid, UI.room, x + (c.x - p.x), y + (c.y - p.y), c.rot).ok) lost++;
    return { ok: true, lost };
  }, (r) => (r.lost ? 'Movido. Lo que tenía encima volvió al inventario.' : null));

  const finish = (r) => { if (r?.ok) { UI.mode = null; } ctx.refresh(); };

  const grid = renderRoom(room, {
    selected: UI.selected,
    onCell: (x, y) => {
      if (mode) finish(mode.from ? moveTo(placed.find((p) => p.uid === mode.uid), x, y, mode.rot) : placeNew(x, y));
      else if (UI.selected) { UI.selected = null; ctx.refresh(); }
    },
    onItem: (p, e) => {
      if (dragged) return;
      if (mode) { // permite apilar algo chico sobre una superficie
        const c = cellAt(gridEl(), e.clientX, e.clientY) ?? { x: p.x, y: p.y };
        finish(mode.from ? moveTo(placed.find((q) => q.uid === mode.uid), c.x, c.y, mode.rot) : placeNew(c.x, c.y));
        return;
      }
      UI.selected = UI.selected === p.uid ? null : p.uid;
      ctx.refresh();
    },
    onItemDown: mode ? null : (p, e, el) => startDrag(p, e, el, (x, y) => { UI.selected = null; finish(moveTo(p, x, y, p.rot)); }),
  });
  const gridEl = () => grid.querySelector('.room-grid');
  if (mode) attachGhost(gridEl(), mode);

  const roomTabs = h('div.room-tabs',
    lr.rooms.map((_, i) => h('button.chip-btn', { type: 'button', 'aria-pressed': String(i === UI.room), onclick: () => { UI.room = i; UI.mode = null; UI.selected = null; ctx.refresh(); } }, `Sala ${i + 1}`)),
    lr.nextRoom ? h('button.chip-btn.add', { type: 'button', onclick: () => buyRoomSheet(ctx, lr) }, '+ Sala') : null);

  // Barra contextual: colocando / seleccionado / ayuda.
  let bar;
  if (mode) {
    const def = ITEM[mode.id];
    bar = h('div.edit-bar.placing',
      h('p', h('strong', mode.from ? `Moviendo: ${def.name}` : `Colocando: ${def.name}`), h('span.muted', 'Tocá una casilla. Lo chico se puede apilar sobre mesas.')),
      h('div.row',
        h('button.btn.ghost.small', { type: 'button', onclick: () => { UI.mode = { ...mode, rot: (mode.rot + 1) % 4 }; ctx.refresh(); } }, 'Rotar'),
        mode.from ? null : h('button.btn.ghost.small', { type: 'button', onclick: (e) => finish(ctx.act(e.currentTarget, (g) => g.autoPlace(mode.uid), (r) => `Colocado en la sala ${r.room + 1}`)) }, 'Lugar libre'),
        h('button.btn.ghost.small', { type: 'button', onclick: () => { UI.mode = null; ctx.refresh(); } }, 'Cancelar')));
  } else if (sel) {
    const def = ITEM[sel.id];
    bar = h('div.edit-bar',
      h('p', h('strong', def.name), h('span.muted', `${CAT[def.cat]} · ${rarityName(def.rarity)} · ${CFG.lair.rarity[def.rarity].prestige} de prestigio`)),
      h('div.row',
        h('button.btn.ghost.small', { type: 'button', onclick: () => finish(moveTo(sel, sel.x, sel.y, (sel.rot + 1) % 4)) }, 'Rotar'),
        h('button.btn.ghost.small', { type: 'button', onclick: () => { UI.mode = { uid: sel.uid, id: sel.id, rot: sel.rot, from: { x: sel.x, y: sel.y } }; UI.selected = null; ctx.refresh(); } }, 'Mover'),
        h('button.btn.ghost.small', { type: 'button', onclick: (e) => { const r = ctx.act(e.currentTarget, (g) => g.removeItem(sel.uid), (x) => (x.removed > 1 ? 'Guardado junto con lo que tenía encima' : 'Guardado en el inventario')); if (r?.ok) UI.selected = null; ctx.refresh(); } }, 'Guardar')));
  } else {
    bar = h('p.muted.hint', placed.length ? 'Tocá un objeto para rotarlo o guardarlo. Arrastralo para moverlo.' : 'Tu sala está vacía. Elegí algo del inventario para colocarlo.');
  }

  return h('div.stack',
    roomTabs,
    h('div.room-frame', grid),
    bar,
    inventoryView(ctx, lr));
}

// Arrastrar un objeto colocado: se activa al moverse 8 px; al soltar se mueve a la casilla de destino.
let dragged = false;
function startDrag(p, e, el, onDrop) {
  if (e.button !== 0) return;
  const grid = el.parentElement;
  const start = cellAt(grid, e.clientX, e.clientY);
  if (!start) return;
  const grab = { dx: start.x - p.x, dy: start.y - p.y };
  const x0 = e.clientX, y0 = e.clientY;
  let active = false;
  dragged = false;
  el.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0;
    if (!active && Math.hypot(dx, dy) < 8) return;
    active = true; dragged = true;
    el.classList.add('dragging');
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const up = (ev) => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    if (!active) return;
    el.style.transform = '';
    el.classList.remove('dragging');
    const c = cellAt(grid, ev.clientX, ev.clientY);
    setTimeout(() => { dragged = false; }, 0);
    if (c && (c.x - grab.dx !== p.x || c.y - grab.dy !== p.y)) onDrop(Math.max(0, c.x - grab.dx), Math.max(0, c.y - grab.dy));
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

// Vista previa del lugar donde caería el objeto (con mouse; en táctil se ve al tocar).
function attachGhost(grid, mode) {
  const [w, hh] = footprint(mode.id, mode.rot);
  const g = h('div.drop-ghost', { 'aria-hidden': 'true', hidden: true });
  grid.append(g);
  grid.classList.add('placing');
  grid.addEventListener('pointermove', (e) => {
    const c = cellAt(grid, e.clientX, e.clientY);
    if (!c) { g.hidden = true; return; }
    g.hidden = false;
    g.classList.toggle('bad', c.x + w > W || c.y + hh > H);
    g.style.gridColumn = `${c.x + 1} / span ${Math.min(w, W - c.x)}`;
    g.style.gridRow = `${c.y + 1} / span ${Math.min(hh, H - c.y)}`;
  });
  grid.addEventListener('pointerleave', () => { g.hidden = true; });
}

function buyRoomSheet(ctx, lr) {
  const n = lr.nextRoom;
  openSheet({ title: `Sala ${lr.rooms.length + 1}`, body: h('div.stack',
    h('p', `Otra sala de ${W}×${H} para decorar. Suma espacio para sets completos y más prestigio.`),
    h('dl.facts', h('dt', 'Nivel requerido'), h('dd', n.lvl), h('dt', 'Precio'), h('dd', `${num(n.price)} oro`)),
    h('button.btn.gold.wide', { type: 'button', onclick: (e) => { const r = ctx.act(e.currentTarget, (g) => g.buyRoom(), () => '¡Sala nueva!'); if (r?.ok) { UI.room = lr.rooms.length; closeSheet(true); ctx.refresh(); } } }, `Comprar por ${num(n.price)} oro`)) });
}

/* ---------- Inventario ---------- */
function inventoryView(ctx, lr) {
  const inv = lr.inventory;
  const card = (i) => {
    const def = i.item;
    const surface = def.cat === 'piso' || def.cat === 'pared';
    const [w, hh] = def.size;
    return h('li.inv-item',
      h('button.inv-main', { type: 'button', 'aria-label': `${surface ? 'Aplicar' : 'Colocar'} ${def.name}`,
        onclick: () => {
          if (surface) { ctx.act(null, (g) => g.placeItem(i.uid, UI.room, 0, 0, 0), () => `${CAT[def.cat]} aplicado a la sala ${UI.room + 1}`); return; }
          UI.mode = { uid: i.uid, id: i.id, rot: 0 }; UI.selected = null; ctx.refresh();
          scrollTo({ top: 0, behavior: 'smooth' });
        } },
        swatch(i.id, def),
        h('span.inv-txt', h('strong', def.name), h('span.muted', surface ? `${CAT[def.cat]} · toda la sala` : `${w}×${hh}${def.small ? ' · apilable' : ''}${def.surface ? ' · superficie' : ''}`))),
      h('button.icon-btn.more', { type: 'button', 'aria-label': `Más opciones de ${def.name}`, onclick: () => itemSheet(ctx, i) }, '⋯'));
  };
  return h('section.card',
    h('div.sec-head', h('h2.display', 'Inventario'), h('span.muted.tnum', `${inv.length}`)),
    inv.length ? h('ul.inv-list', inv.map(card)) : h('p.empty', 'Vacío. Comprá decoración en la Tienda o ganala en misiones y visitas.'));
}

function itemSheet(ctx, i) {
  const def = i.item;
  openSheet({ title: def.name, body: h('div.stack',
    h('p.muted', `${CAT[def.cat]} · ${rarityName(def.rarity)} · ${CFG.lair.rarity[def.rarity].prestige} de prestigio${i.gifted ? ' · regalo' : ''}`),
    h('button.btn.gold.wide', { type: 'button', onclick: (e) => { const r = ctx.act(e.currentTarget, (g) => g.autoPlace(i.uid), (x) => `Colocado en la sala ${x.room + 1}`); if (r?.ok) closeSheet(true); } }, 'Colocar en el primer lugar libre'),
    i.recycle > 0
      ? h('button.btn.crimson.wide', { type: 'button', onclick: (e) => { const r = ctx.act(e.currentTarget, (g) => g.recycleItem(i.uid), (x) => `+${num(x.gold)} oro`); if (r?.ok) closeSheet(true); } }, `${i.gifted ? 'Vender' : 'Reciclar'} por ${num(i.recycle)} oro`)
      : h('p.note', i.gifted ? `Es un regalo: se puede vender en ${Math.max(1, Math.ceil((i.sellableAt - ctx.S.now) / 86_400_000))} ${Math.ceil((i.sellableAt - ctx.S.now) / 86_400_000) > 1 ? 'días' : 'día'}, por ${CFG.social.giftSellGold} de oro.` : 'Los objetos exclusivos no se reciclan.')) });
}

/* ---------- Edificios ---------- */
const BLD = {
  boveda: { ico: 'shield', fx: (v) => `Protege el ${Math.round(v * 100)}% del oro en mano` },
  enfermeria: { ico: 'bolt', fx: (v) => `1 de energía cada ${v} min` },
  generador: { ico: 'bolt', fx: (v) => `Energía máxima ${v}` },
  taller: { ico: 'coin', fx: (v) => `Produce el ${Math.round(v * 100)}% de una misión de 1 h por hora` },
  torre: { ico: 'star', fx: (v) => `+${Math.round(v * 100)}% de Def y Agi al defender` },
};
const BASE_FX = { boveda: 'Sin protección', enfermeria: `1 de energía cada ${CFG.energy.regenMin} min`, generador: `Energía máxima ${CFG.energy.max}`, taller: 'No produce', torre: 'Sin bonus' };

function buildingsView(ctx, lr) {
  const p = ctx.S.player;
  const ws = lr.workshop;
  const taller = ws.level
    ? h('section.card.workshop',
      h('div.sec-head', h('h2.display', 'Taller'), h('span.muted.tnum', `${num(ws.ratePerH)} oro/h${ws.boostPct ? ` · +${ws.boostPct}% por visitas` : ''}`)),
      h('div.m-track', h('span', { style: { transform: `scaleX(${ws.cap ? ws.stored / ws.cap : 0})` } })),
      h('div.m-foot', h('span.muted.tnum', `${num(ws.stored)} / ${num(ws.cap)} oro (se llena en ${CFG.lair.workshopCapH} h)`),
        h('button.btn.gold.small', { type: 'button', disabled: ws.stored <= 0, onclick: (e) => ctx.act(e.currentTarget, (g) => g.claimWorkshop(), (r) => `+${num(r.gold)} oro del Taller`) }, 'Cobrar')))
    : null;

  const card = (b) => {
    const meta = BLD[b.key];
    const locked = b.next && p.level < b.next.req;
    return h('li.bld',
      h('span.bld-ico', icon(meta.ico, 20)),
      h('div.bld-info',
        h('div.bld-top', h('strong', b.name), h('span.lvl-dots', { 'aria-label': `Nivel ${b.level} de 5` }, [1, 2, 3, 4, 5].map((n) => h(`i${n <= b.level ? '.on' : ''}`)))),
        h('span.muted', b.level ? meta.fx(b.value) : BASE_FX[b.key]),
        b.next ? h('span.bld-next', `Nivel ${b.next.level}: ${meta.fx(b.next.value)}`) : h('span.bld-next', 'Nivel máximo')),
      b.next
        ? h('button.btn.small' + (locked ? '.ghost' : '.gold'), { type: 'button', disabled: locked, onclick: (e) => ctx.act(e.currentTarget, (g) => g.upgradeBuilding(b.key), (r) => `${b.name} nivel ${r.level}`) },
          locked ? `Nv ${b.next.req}` : h('span', icon('coin', 14), num(b.next.price)))
        : null);
  };
  return h('div.stack', taller, h('section.card', h('h2.display', 'Edificios'), h('p.muted.hint', 'Ventajas permanentes. La decoración solo da prestigio, nunca atributos.'), h('ul.bld-list', lr.buildings.map(card))));
}

/* ---------- Tiendas ---------- */
function shopView(ctx) {
  const { game, S } = ctx;
  const row = (it, price, btnLabel, onBuy, disabled) => h('li.shop-item',
    swatch(it.id),
    h('span.inv-txt',
      h('strong', it.name, it.rotating ? h('span.tag', 'Hoy') : null),
      h('span.muted', `${CAT[it.cat]} · ${rarityName(it.rarity)} · +${it.prestige} prestigio`)),
    h('button.btn.small' + (disabled ? '.ghost' : '.gold'), { type: 'button', disabled, onclick: onBuy }, btnLabel));

  let body;
  if (UI.shop === 'oro') {
    const s = game.lairShop();
    body = h('ul.shop-list', (s.ok ? s.list : []).map((it) => row(it, it.price, h('span', icon('coin', 14), num(it.price)),
      (e) => ctx.act(e.currentTarget, (g) => g.buyItem(it.id), () => `${it.name} al inventario`), S.player.gold < it.price)));
  } else {
    const s = game.renownShop();
    body = h('div.stack',
      h('p.muted', `Tenés ${num(s.renown ?? 0)} de renombre. Se gana visitando, recibiendo visitas y regalando.`),
      h('ul.shop-list', (s.ok ? s.list : []).map((it) => row(it, it.renown, h('span', icon('crown', 14), num(it.renown)),
        (e) => ctx.act(e.currentTarget, (g) => g.buyRenownItem(it.id), () => `${it.name} al inventario`), s.renown < it.renown))));
  }
  return h('section.card',
    segmented([['oro', 'Tienda del día'], ['renombre', 'Renombre']], UI.shop, (k) => { UI.shop = k; ctx.refresh(); }),
    UI.shop === 'oro' ? h('p.muted.hint', 'Los básicos están siempre; los marcados "Hoy" cambian a las 00:00.') : null,
    body);
}
