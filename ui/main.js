// Ciclo de la interfaz: la fachada es la única fuente de verdad; la interfaz solo lee, dibuja y manda comandos.
// Distribución de los mockups Chibi: barra superior con avatar, XP, buzón y 4 fichas; pestañas Inicio · Misiones · ARENA · Guarida · Social;
// Personaje se abre desde el avatar. En escritorio, barra lateral con atajos por letra.
import { createGame } from '../src/game.js';
import { memoryStorage } from '../src/core.js';
import { h, $, icon, num, clock, uid, countUp, toast, openSheet, closeSheet, sheetOpen, reduced, avatar, stageOf } from './kit.js';
import { errText } from './errors.js';
import { showOnboarding, resetTutorial } from './onboarding.js';
import { showReport } from './report.js';
import * as base from './tabs/base.js';
import * as misiones from './tabs/misiones.js';
import * as arena from './tabs/arena.js';
import * as guarida from './tabs/guarida.js';
import * as social from './tabs/social.js';
import * as personaje from './tabs/personaje.js';
import * as cloud from './cloud.js';
import { maybeNag, guestDays, linkSheet } from './account.js';

// [id, módulo, ícono, tecla]
const VIEWS = [['base', base, 'base', 'i'], ['misiones', misiones, 'misiones', 'm'], ['arena', arena, 'arena', 'a'],
  ['guarida', guarida, 'guarida', 'g'], ['social', social, 'social', 's'], ['personaje', personaje, 'personaje', 'p']];
const NAV = ['base', 'misiones', 'arena', 'guarida', 'social']; // barra inferior (Personaje va por el avatar)
const view = (k) => VIEWS.find(([id]) => id === k);

let storage;
try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); storage = localStorage; } catch { storage = memoryStorage(); }
// 1b: la nube se reconcilia antes de crear la partida (máx. 6 s; sin conexión sigue con lo local).
storage = await cloud.init(storage);
const game = createGame({ storage });

const S = { player: null, unread: 0, at: 0, tab: 'base', badges: {}, intent: null };

/* ---------- Comandos ---------- */
// act(botón, g => g.comando(...), r => 'texto de éxito'): freno al doble toque + idempotencia + aviso + refresco.
// El freno dura 400 ms porque la vista se vuelve a dibujar y un segundo toque caería en el botón nuevo.
let lockUntil = 0;
export function act(btn, run, okText, { refresh: doRefresh = true } = {}) {
  const t = performance.now();
  if (t < lockUntil || btn?.disabled) return null;
  lockUntil = t + 400;
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  let r;
  try { r = game.withOp(uid(), () => run(game)); }
  finally { if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); } }
  if (!r.ok) toast(errText(r.error), 'err');
  else if (okText) { const m = okText(r); if (m) toast(m, 'ok'); }
  if (doRefresh || !r.ok) refresh();
  return r;
}

/* ---------- Estado ---------- */
function load() {
  const st = game.state();
  if (!st.ok) return false;
  S.player = st.player; S.unread = st.unread; S.revenge = st.revenge; S.requests = st.friendRequests; S.now = st.now; S.at = performance.now();
  return true;
}
function refresh({ full = true } = {}) {
  if (!load()) return;
  document.body.dataset.faction = S.player.faction;
  drawTop();
  drawGuestBanner();
  if (full) { drawBadges(); drawTab(); }
  maybeNag(S.player);
}

// Aviso de invitado a los 7 días (lleva a vincular la cuenta).
function drawGuestBanner() {
  const el = $('#guest-banner');
  if (!el) return;
  const a = cloud.account(), d = guestDays();
  el.hidden = !(a.guest && !a.pendingEmail && d >= 7);
  if (!el.hidden) el.replaceChildren(icon('shield', 18), h('span', `Jugás como invitado hace ${d} días. Vinculá tu email para no perder tu héroe.`),
    h('button.btn.gold.small', { type: 'button', disabled: a.status !== 'online', onclick: () => linkSheet({ onDone: refresh }) }, 'Guardar'));
}
cloud.onChange(() => { if (!S.player) return; drawGuestBanner(); if (S.tab === 'personaje' && !sheetOpen()) drawTab(); });
// Solo la barra superior. Con energyOnly no se tocan oro, nivel ni XP (se revelan con el informe).
function refreshTop({ energyOnly = false } = {}) { if (load()) drawTop(energyOnly); }

function celebrate(report) {
  const me = report.attacker.id === S.player.id ? 'attacker' : 'defender';
  if (report.levelUp?.[me]) toast(`¡Nivel ${S.player.level}!`, 'prize');
  if (me === 'attacker' && report.prey) toast('¡Presa del día derrotada!', 'prize');
  if (me === 'attacker' && report.revenge && report.winner === 'attacker') toast('¡Venganza cumplida!', 'prize');
}

// Badges: solo se derivan de lo que dice la fachada.
function drawBadges() {
  const p = S.player;
  const daily = game.daily(), lr = game.lair(), fr = game.friends();
  const tg = p.mission ? null : game.targets();
  S.badges = {
    base: daily.ok && daily.list.some((o) => o.done && !o.claimed),
    misiones: !p.mission || !!p.mission.done,
    arena: !p.mission && ((S.revenge ?? 0) > 0 || (tg?.ok && tg.list.some((t) => t.prey && !t.block))),
    guarida: lr.ok && lr.workshop.level > 0 && lr.workshop.stored > 0,
    social: fr.ok && (fr.giftbox.length > 0 || fr.requests.length > 0),
  };
  for (const [k] of VIEWS) for (const b of document.querySelectorAll(`[data-tab="${k}"] .dot`)) b.hidden = !S.badges[k];
  const ib = $('#inbox-n');
  ib.hidden = !S.unread;
  ib.textContent = S.unread > 9 ? '9+' : String(S.unread);
  $('#inbox').setAttribute('aria-label', S.unread ? `Informes, ${S.unread} sin leer` : 'Informes');
}

/* ---------- Barra superior ---------- */
function drawTop(energyOnly = false) {
  const p = S.player;
  $('#en-val').textContent = `${p.energy}/${p.energyMax}`;
  tickEnergy();
  if (energyOnly) return;
  $('#lvl-num').textContent = p.level;
  const avKey = `${p.faction}:${stageOf(p.level)}`;
  if ($('#me-av').dataset.k !== avKey) { $('#me-av').dataset.k = avKey; $('#me-av').dataset.f = p.faction; $('#me-av').replaceChildren(avatar(p.faction, p.name, '', p.level).firstChild); }
  $('#who').textContent = p.name;
  $('#me-fac').textContent = p.faction === 'hero' ? 'Héroe' : 'Villano';
  $('#xp-txt').textContent = `${num(p.xp)}/${num(p.xpNeed)} XP`;
  $('#xp-bar').style.transform = `scaleX(${Math.min(1, p.xp / p.xpNeed)})`;
  $('#me').setAttribute('aria-label', `Ver personaje: ${p.name}, nivel ${p.level}`);
  countUp($('#gold-val'), p.gold);
  $('#rep-val').textContent = num(p.rep);
  $('#ren-val').textContent = num(p.renown);
}

// Cuentas regresivas calculadas acá con el dato de la fachada; solo se vuelve a consultar al llegar a 0.
function tickEnergy() {
  const p = S.player;
  if (!p) return;
  const full = p.energy >= p.energyMax;
  const left = p.nextEnergyMs - (performance.now() - S.at);
  $('#en-sub').textContent = full ? 'LLENA' : `+1 EN ${clock(left)}`;
  $('#energy').setAttribute('aria-label', `Energía ${p.energy} de ${p.energyMax}${full ? ', llena' : `, más 1 en ${clock(left)}`}`);
  for (const el of document.querySelectorAll('[data-energy-cd]')) el.textContent = clock(left);
  let done = false;
  for (const mt of document.querySelectorAll('[data-mission]')) {
    const ml = Number(mt.dataset.left) - (performance.now() - S.at), total = Number(mt.dataset.total);
    mt.firstElementChild.style.transform = `scaleX(${Math.min(1, 1 - ml / total)})`;
    if (ml <= 0) done = true;
  }
  for (const el of document.querySelectorAll('[data-mission-left]')) el.textContent = clock(Number(el.dataset.missionLeft) - (performance.now() - S.at));
  if (done || (!full && left <= 0)) refresh();
}
setInterval(tickEnergy, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

const infoSheet = (title, ico, value, paras, facts = []) => openSheet({ title, body: h('div.stack',
  h('div.big-stat', icon(ico, 28), h('strong', value)),
  paras.map((t) => h('p', t)),
  facts.length ? h('dl.facts', facts.flatMap(([a, b]) => [h('dt', a), h('dd', b)])) : null) });

function energySheet() {
  const p = S.player;
  infoSheet('Energía', 'bolt', `${p.energy}/${p.energyMax}`, ['Cada ataque en la Arena cuesta 1 de energía. Se recupera sola, también con el juego cerrado.'],
    [['Próximo punto', p.energy >= p.energyMax ? 'Ya está llena' : clock(p.nextEnergyMs - (performance.now() - S.at))], ['Para mejorarla', 'Generador y Enfermería, en la Guarida']]);
}
const goldSheet = () => { const p = S.player; infoSheet('Oro', 'coin', num(p.gold), ['El oro en mano se puede robar si te ganan. El del banco está a salvo.'], [['En mano', num(p.gold)], ['En el banco', num(p.bank)]]); };
const repSheet = () => { const p = S.player; infoSheet('Reputación', 'star', num(p.rep), ['Sumás 1 por cada pelea ganada. La de tu facción decide la guerra semanal.'], [['Récord', `${p.record.w} V · ${p.record.l} D`]]); };
const renSheet = () => { const p = S.player; infoSheet('Renombre', 'crown', num(p.renown), ['Se gana visitando, recibiendo visitas y regalando. Compra decoración exclusiva en la Guarida.']); };

// Buzón: informes de combate (los que te atacaron, sin leer, aparecen primero marcados).
function inboxSheet() {
  const ib = game.inbox();
  const list = ib.ok ? ib.list.slice(0, 30) : [];
  const ago = (ms) => { const m = Math.floor(ms / 60_000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`; };
  const unread = list.filter((x) => !x.read).length;
  const allRead = unread ? h('button.btn.ghost.small.mark-all', { type: 'button', onclick: (e) => {
    const r = game.markAllRead();
    closeSheet(true); refresh();
    if (r.ok && r.count) toast(`${r.count} ${r.count === 1 ? 'informe marcado' : 'informes marcados'} como leído${r.count === 1 ? '' : 's'}`, 'ok');
  } }, 'Marcar todos como leídos') : null;
  openSheet({ title: 'Informes', body: list.length ? h('div.stack', allRead, h('ul.reports', list.map(({ report: r, role, read }) => {
    const won = r.winner === role, foe = role === 'attacker' ? r.defender : r.attacker;
    const gold = r.winner === 'attacker' ? (role === 'attacker' ? r.loot.gold + (r.loot.win ?? 0) : -r.loot.gold) : (role === 'defender' ? r.loot.bounty : 0);
    return h('li', h(`button.report-row${read ? '' : '.unread'}`, { type: 'button', onclick: () => {
      closeSheet(true);
      showReport(r, S.player.id, { onDone: () => { game.markRead(r.id); refresh(); } });
    } },
      h(`span.r-ico.${won ? 'won' : 'lost'}`, icon(role === 'attacker' ? 'arena' : 'shield', 18)),
      h('span.r-info', h('strong', `${role === 'attacker' ? 'Atacaste a' : 'Te atacó'} ${foe.name}`), h('span.muted', `${won ? 'Victoria' : 'Derrota'} · ${ago(S.now - r.ts)}`)),
      h(`span.r-gold.tnum${gold > 0 ? '.plus' : gold < 0 ? '.minus' : ''}`, gold ? `${gold > 0 ? '+' : '−'}${num(Math.abs(gold))}` : '0'),
      read ? null : h('span.dot.inline', { 'aria-label': 'Sin leer' })));
  }))) : h('p.empty', 'Todavía no hay combates.') });
}

/* ---------- Navegación ---------- */
// intent: sub-sección a abrir en la vista destino (p. ej. 'equipo' en Personaje, 'tienda' en Guarida).
function go(tab, { focus = false, intent = null } = {}) {
  if (!view(tab)) tab = 'base';
  const changed = S.tab !== tab;
  S.tab = tab; S.intent = intent;
  for (const el of document.querySelectorAll('[data-tab]')) el.setAttribute('aria-current', el.dataset.tab === tab ? 'page' : 'false');
  $('#me').setAttribute('aria-current', tab === 'personaje' ? 'page' : 'false');
  if (location.hash.slice(1) !== tab) { try { history.replaceState(null, '', `#${tab}`); } catch { /* nada */ } }
  if (changed || intent) refresh(); else drawTab();
  if (changed) scrollTo({ top: 0 });
  if (focus) $('#main').focus({ preventScroll: true });
}

function drawTab() {
  const [, mod] = view(S.tab);
  $('#view').replaceChildren(mod.render({ S, game, act, refresh, refreshTop, celebrate, go }));
  S.intent = null;
  document.title = `${mod.title} · OATHBREAK`;
}

addEventListener('hashchange', () => go(location.hash.slice(1)));
addEventListener('keydown', (e) => {
  if (sheetOpen() || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, select') || document.querySelector('.hunt-layer, .onb')) return;
  const v = VIEWS.find(([, , , key]) => key === e.key.toLowerCase());
  if (v) { e.preventDefault(); go(v[0]); }
});

/* ---------- Armado ---------- */
function navLinks(cls, ids) {
  return ids.map((k) => {
    const [, mod, ico, key] = view(k);
    const center = cls === 'tab' && k === 'arena';
    return h(`a.${cls}${center ? '.center' : ''}`, { href: `#${k}`, 'data-tab': k, onclick: (e) => { e.preventDefault(); go(k, { focus: cls === 'side-link' }); } },
      h('span.nav-ico', icon(ico, center ? 30 : 24), h('span.dot', { hidden: true, 'aria-label': 'Hay novedades' })),
      h('span.nav-label', mod.title),
      cls === 'side-link' ? h('kbd', key.toUpperCase()) : null);
  });
}

// TEMPORAL: 5 toques al nombre abren herramientas de prueba (reloj, oro, reinicio).
let taps = [];
function nameTap() {
  const t = performance.now();
  taps = [...taps.filter((x) => t - x < 2000), t];
  if (taps.length >= 5) { taps = []; debugSheet(); }
}
function debugSheet() {
  const adv = (ms, label) => h('button.btn.ghost', { type: 'button', onclick: () => { game.debug.advance(ms); refresh(); toast(`Reloj +${label}`); } }, `+${label}`);
  const me = () => game.debug.world().entities[S.player.id];
  openSheet({ title: 'Herramientas de prueba', body: h('div.stack',
    h('p.muted', 'Solo para revisar la interfaz. No existen en el juego final.'),
    h('div.row', adv(60_000, '1 min'), adv(20 * 60_000, '20 min'), adv(3_600_000, '1 h'), adv(8 * 3_600_000, '8 h')),
    h('div.row',
      h('button.btn.ghost', { type: 'button', onclick: () => { game.debug.toNext('day'); refresh(); toast('Día siguiente'); } }, 'Día siguiente'),
      h('button.btn.ghost', { type: 'button', onclick: () => restart(S.player.faction === 'hero' ? 'villain' : 'hero') }, `Probar como ${S.player.faction === 'hero' ? 'villano' : 'héroe'}`)),
    h('div.row',
      h('button.btn.ghost', { type: 'button', onclick: () => { me().gold += 5000; game.save(); refresh(); toast('+5.000 oro'); } }, '+5.000 oro'),
      h('button.btn.ghost', { type: 'button', onclick: () => { me().energy = S.player.energyMax; game.save(); refresh(); toast('Energía llena'); } }, 'Llenar energía')),
    h('button.btn.crimson.wide', { type: 'button', onclick: () => {
      closeSheet(true); game.debug.reset(); resetTutorial(); $('#app').remove(); $('#toasts').remove(); boot();
    } }, 'Reiniciar desde el onboarding')) });
}
function restart(faction) {
  const name = S.player.name;
  game.debug.reset();
  game.newCharacter(name, faction);
  closeSheet(true);
  refresh();
  toast(faction === 'hero' ? 'Partida nueva como héroe' : 'Partida nueva como villano');
}

function mount() {
  const top = h('header.topbar',
    h('div.top-inner',
      h('div.me-row',
        h('button.me-btn#me', { type: 'button', onclick: () => go('personaje') },
          h('span.me-av#me-av'),
          h('span.me-lvl.display#lvl-num', '1')),
        h('div.me-info',
          h('span#who.display.me-name', { onclick: nameTap }, ''),
          h('span.me-sub', h('i.fac-dot', { 'aria-hidden': 'true' }), h('span#me-fac', ''), ' · ', h('span#xp-txt.tnum', '')),
          h('span.me-xp', h('span#xp-bar'))),
        h('button.inbox-btn#inbox', { type: 'button', onclick: inboxSheet, 'aria-label': 'Informes' },
          icon('bell', 24), h('span.inbox-n#inbox-n', { hidden: true }, '0'))),
      h('div.chips',
        h('button.chip.gold#gold', { type: 'button', onclick: goldSheet }, h('span.chip-ico', icon('coin', 16)), h('span.chip-txt', h('strong#gold-val.tnum', '0'), h('small', 'ORO'))),
        h('button.chip.energy#energy', { type: 'button', onclick: energySheet }, h('span.chip-ico', icon('bolt', 16)), h('span.chip-txt', h('strong#en-val.tnum', '0/0'), h('small#en-sub', ''))),
        h('button.chip.rep#rep', { type: 'button', onclick: repSheet }, h('span.chip-ico', icon('star', 16)), h('span.chip-txt', h('strong#rep-val.tnum', '0'), h('small', 'REPUT.'))),
        h('button.chip.ren#ren', { type: 'button', onclick: renSheet }, h('span.chip-ico', icon('crown', 16)), h('span.chip-txt', h('strong#ren-val.tnum', '0'), h('small', 'RENOMBRE'))))));

  const side = h('nav.sidebar', { 'aria-label': 'Secciones' },
    h('span.brand-side.display', 'OATHBREAK'),
    h('div.side-links', navLinks('side-link', VIEWS.map(([k]) => k))),
    h('p.side-hint', 'Atajos: la letra de cada sección'));

  const app = h('div#app',
    side,
    h('div.column',
      top,
      h('main#main', { tabIndex: -1 }, h('div#guest-banner.guest-banner', { hidden: true, role: 'status' }), h('div#view.view')),
      h('nav.tabbar', { 'aria-label': 'Secciones' }, navLinks('tab', NAV))));

  document.body.append(app, h('div#toasts.toasts', { 'aria-live': 'polite' }));
}

function saveIssueScreen(issue) {
  document.body.append(h('div.blocker',
    h('div.card.stack',
      h('h1.display', 'Tu partida no se puede abrir'),
      h('p', issue === 'future' ? 'Este guardado es de una versión más nueva del juego. No lo vamos a pisar.' : 'El guardado está dañado. No lo vamos a pisar sin tu permiso.'),
      h('button.btn.crimson.wide', { type: 'button', onclick: () => { game.debug.discardBadSave(); location.reload(); } }, 'Guardar una copia y empezar de nuevo'))));
}

function start(tab) {
  mount();
  S.tab = tab;
  refresh();
  go(S.tab);
  const note = cloud.takeNotice();
  if (note) toast(note, 'prize');
}
// Sin personaje: onboarding (facción → nombre) y la primera sesión arranca en Inicio con "Primeros pasos".
function boot() {
  if (game.saveIssue()) return saveIssueScreen(game.saveIssue());
  if (!game.hasCharacter()) return showOnboarding(game, () => start('base'));
  const k = location.hash.slice(1);
  start(view(k) ? k : 'base');
}
if (reduced()) document.documentElement.classList.add('rm');
boot();
