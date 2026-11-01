// Pestaña Social: visitas (con vista de la guarida ajena), amigos y regalos, libro de visitas, escaparate y facciones.
import { CFG, ITEM } from '../../src/game.js';
import { h, icon, num, toast, openSheet, closeSheet, avatar } from '../kit.js';
import { renderRoom } from '../room.js';
import { segmented } from './guarida.js';
import { inviteCard } from '../extras.js';
export const title = 'Social';

const UI = { sub: 'visitar', league: null, faction: null };
const FAC = { hero: 'Héroes', villain: 'Villanos' };
const LEAGUE = Object.fromEntries(CFG.lair.leagues.map((l) => [l.id, l.name]));

export function render(ctx) {
  const subs = [['visitar', 'Visitar'], ['amigos', 'Amigos'], ['escaparate', 'Escaparate'], ['facciones', 'Facciones']];
  return h('section.stack',
    h('h1.display', 'Social'),
    inviteCard(ctx),
    segmented(subs, UI.sub, (k) => { UI.sub = k; ctx.refresh(); }),
    UI.sub === 'visitar' ? visitView(ctx) : UI.sub === 'amigos' ? friendsView(ctx) : UI.sub === 'escaparate' ? showcaseView(ctx) : factionView(ctx));
}


function ago(ms) {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const hh = Math.floor(m / 60);
  return hh < 24 ? `hace ${hh} h` : `hace ${Math.floor(hh / 24)} d`;
}

/* ---------- Visitar ---------- */
export function doVisit(ctx, id) {
  const r = ctx.act(null, (g) => g.visit(id, true), (x) => {
    if (x.repeat) return null;
    if (x.gold) return `+${num(x.gold)} oro · +${x.xp} XP por la visita`;
    if (x.renown) return '+1 renombre por la visita';
    return 'Visita registrada (ya no da recompensas hoy)';
  });
  if (!r?.ok) return;
  for (const s of r.streakRewards ?? []) toast(`Premio de racha: ${s}`, 'prize');
  if (r.levels) toast('¡Subiste de nivel!', 'prize');
  lairSheet(ctx, r.lair);
}

function lairSheet(ctx, snap) {
  let room = 0;
  const fr = ctx.game.friends();
  const isFriend = fr.ok && fr.list.some((f) => f.id === snap.id);
  const sent = fr.ok && fr.sent.some((f) => f.id === snap.id);
  const incoming = fr.ok && fr.requests.some((f) => f.id === snap.id);
  const giftedToday = fr.ok && fr.list.find((f) => f.id === snap.id)?.giftedToday;
  const holder = h('div.room-frame');
  const draw = () => holder.replaceChildren(renderRoom(snap.rooms[room], { readonly: true }));
  draw();
  const tabs = snap.rooms.length > 1 ? h('div.room-tabs', snap.rooms.map((_, i) => h('button.chip-btn', { type: 'button', 'aria-pressed': String(i === 0), onclick: (e) => {
    room = i; draw();
    for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
  } }, `Sala ${i + 1}`))) : null;
  const items = snap.rooms.flatMap((r) => r.items).map((x) => ITEM[x.id].name);

  openSheet({ title: `Guarida de ${snap.name}`, body: h('div.stack',
    h('p.muted', `${FAC[snap.faction]} · Nv ${snap.level} · Prestigio ${num(snap.prestige)} · ${snap.applause} aplausos esta semana`),
    snap.sets.length ? h('p.note', `Sets completos: ${snap.sets.map((s) => s.name).join(', ')}`) : null,
    tabs, holder,
    items.length ? h('p.muted.hint', `${items.length} objetos: ${[...new Set(items)].slice(0, 6).join(', ')}${items.length > 6 ? '…' : ''}`) : null,
    h('div.row',
      isFriend
        ? h('button.btn.violet', { type: 'button', disabled: giftedToday, onclick: (e) => { const r = ctx.act(e.currentTarget, (g) => g.sendGift(snap.id), (x) => `Le regalaste: ${x.item}`); if (r?.ok) closeSheet(true); } }, giftedToday ? 'Ya le regalaste hoy' : 'Regalar')
        : incoming ? h('button.btn.gold', { type: 'button', onclick: (e) => { const r = ctx.act(e.currentTarget, (g) => g.acceptFriend(snap.id), () => `${snap.name} ahora es tu amigo`); if (r?.ok) closeSheet(true); } }, 'Aceptar solicitud')
        : h('button.btn.ghost', { type: 'button', disabled: sent, onclick: (e) => { const r = ctx.act(e.currentTarget, (g) => g.addFriend(snap.id), (x) => (x.pending ? `Solicitud enviada a ${snap.name}` : `${snap.name} ahora es tu amigo`)); if (r?.ok) closeSheet(true); } }, sent ? 'Solicitud enviada' : 'Agregar amigo'),
      h('button.btn.gold', { type: 'button', onclick: () => closeSheet() }, 'Listo'))) });
}

function visitView(ctx) {
  const { game } = ctx;
  const vs = game.lair().visits;
  const sg = game.visitSuggestions();
  const list = sg.ok ? sg.list : [];
  const pending = list.filter((x) => !x.visitedToday);
  const done = list.filter((x) => x.visitedToday);

  const row = (x) => h(`li.person${x.visitedToday ? '.visited' : ''}`,
    avatar(x.faction, x.name, '', x.level),
    h('div.t-info',
      h('strong', x.name),
      h('span.t-meta', h('span.muted', `Nv ${x.level} · Prestigio ${num(x.prestige)}`)),
      h('span.tags', x.friend ? h('span.tag', 'Amigo') : x.requested ? h('span.tag', 'Solicitud enviada') : null, x.returning ? h('span.tag', 'Te visitó') : null)),
    h('button.btn.small' + (x.visitedToday ? '.ghost' : '.gold'), { type: 'button', onclick: () => doVisit(ctx, x.id) }, x.visitedToday ? 'Ver' : 'Visitar'));

  const streakTxt = vs.streakToday ? 'Racha del día cumplida' : `Racha: ${CFG.lair.visit.streakMinVisits} visitas y 1 regalo por día`;
  return h('div.stack',
    h('section.card.visit-sum',
      h('div.vs-grid',
        stat(`${vs.rewarded}/${vs.rewardedCap}`, 'visitas con oro hoy'),
        stat(vs.nextGold ? `+${num(vs.nextGold)}` : '—', 'oro por la próxima'),
        stat(`${vs.streak} d`, vs.shields ? `racha · ${vs.shields} escudo` : 'racha')),
      h('p.muted.hint', `${streakTxt}. Al anfitrión le dejás una propina y un aplauso.`)),
    h('section.card',
      h('div.sec-head', h('h2.display', 'Guaridas para visitar'), h('span.muted.tnum', `${pending.length}`)),
      pending.length ? h('ul.people', pending.map(row)) : h('p.empty', 'Ya visitaste a todos por hoy.'),
      done.length ? h('details.done-list', h('summary', `Visitadas hoy (${done.length})`), h('ul.people', done.map(row))) : null),
    guestbookCard(ctx));
}
const stat = (v, l) => h('div.vs-stat', h('strong.tnum', v), h('span.muted', l));

function guestbookCard(ctx) {
  const lr = ctx.game.lair();
  const gb = lr.ok ? lr.guestbook : [];
  return h('section.card',
    h('div.sec-head', h('h2.display', 'Libro de visitas'), h('span.muted', `Propinas hoy ${lr.visits.hostTipsToday}/${lr.visits.hostTipCap}`)),
    gb.length ? h('ul.people', gb.slice(0, 10).map((g) => h('li.person',
      avatar(g.faction, g.name, '', g.level),
      h('div.t-info', h('strong', g.name), h('span.muted', `${ago(ctx.S.now - g.ts)}${g.applause ? ' · aplaudió' : ''}${g.tip ? ` · +${g.tip} oro` : ''}`)),
      h('button.btn.ghost.small', { type: 'button', onclick: () => doVisit(ctx, g.id) }, 'Devolver'))))
      : h('p.empty', 'Nadie te visitó todavía. Decorá tu guarida para subir en el escaparate.'));
}

/* ---------- Amigos y regalos ---------- */
function friendsView(ctx) {
  const fr = ctx.game.friends();
  if (!fr.ok) return null;
  const box = fr.giftbox;
  const reqCard = fr.requests.length ? h('section.card.requests',
    h('div.sec-head', h('h2.display', 'Solicitudes'), h('span.pill.violet', `${fr.requests.length}`)),
    fr.requests.length > 1 ? h('button.btn.gold.small', { type: 'button', onclick: () => { // 31/10: aceptar todas de una vez
      let n = 0;
      for (const r of fr.requests) { if (!ctx.game.acceptFriend(r.id).ok) break; n++; }
      ctx.refresh(); toast(n ? `${n} ${n === 1 ? 'amigo nuevo' : 'amigos nuevos'}` : 'Tu lista de amigos está llena', n ? 'ok' : 'err');
    } }, 'Aceptar todas') : null,
    h('ul.people', fr.requests.map((r) => h('li.person',
      avatar(r.faction, r.name, '', r.level),
      h('div.t-info', h('strong', r.name), h('span.muted', `${FAC[r.faction]} · Nv ${r.level} · ${ago(ctx.S.now - r.ts)}`)),
      h('div.row.tight',
        h('button.btn.ghost.small', { type: 'button', 'aria-label': `Rechazar a ${r.name}`, onclick: (e) => ctx.act(e.currentTarget, (g) => g.rejectFriend(r.id), () => 'Solicitud rechazada') }, 'No'),
        h('button.btn.gold.small', { type: 'button', 'aria-label': `Aceptar a ${r.name}`, onclick: (e) => ctx.act(e.currentTarget, (g) => g.acceptFriend(r.id), () => `${r.name} ahora es tu amigo`) }, 'Aceptar')))))) : null;
  const sentCard = fr.sent.length ? h('details.done-list', h('summary', `Solicitudes enviadas (${fr.sent.length})`),
    h('ul.people', fr.sent.map((r) => h('li.person',
      avatar(r.faction, r.name, '', r.level),
      h('div.t-info', h('strong', r.name), h('span.muted', `Esperando respuesta · ${ago(ctx.S.now - r.ts)}`)),
      h('button.btn.ghost.small', { type: 'button', onclick: (e) => ctx.act(e.currentTarget, (g) => g.cancelRequest(r.id), () => 'Solicitud cancelada') }, 'Cancelar'))))) : null;
  return h('div.stack',
    reqCard,
    box.length ? h('section.card.gifts',
      h('div.sec-head', h('h2.display', 'Regalos recibidos'), h('span.pill.violet', `${box.length}`)),
      h('p.muted', box.slice(0, 4).map((g) => `${g.name} de ${g.fromName}`).join(' · ') + (box.length > 4 ? '…' : '')),
      h('button.btn.violet.wide', { type: 'button', onclick: (e) => ctx.act(e.currentTarget, (g) => g.openGifts(), (r) => `${r.opened} ${r.opened > 1 ? 'regalos' : 'regalo'} al inventario`) }, 'Abrir todos')) : null,
    h('section.card',
      h('div.sec-head', h('h2.display', 'Amigos'), h('span.muted.tnum', `${fr.list.length}/${fr.max}`)),
      h('p.muted.hint', `Regalos de hoy: ${fr.sentToday}/${fr.cap}. Regalar es gratis: es un objeto chico que crea el sistema, y vos ganás renombre.`),
      fr.list.length ? h('ul.people', fr.list.map((f) => h('li.person',
        avatar(f.faction, f.name, '', f.level),
        h('div.t-info', h('strong', f.name), h('span.muted', `${FAC[f.faction]} · Nv ${f.level}`)),
        h('div.row.tight',
          h('button.btn.ghost.small', { type: 'button', 'aria-label': `Visitar a ${f.name}`, onclick: () => doVisit(ctx, f.id) }, 'Visitar'),
          h('button.btn.small' + (f.giftedToday ? '.ghost' : '.violet'), { type: 'button', disabled: f.giftedToday || fr.sentToday >= fr.cap,
            onclick: (e) => ctx.act(e.currentTarget, (g) => g.sendGift(f.id), (r) => `Le regalaste: ${r.item}`) }, f.giftedToday ? '✓' : 'Regalar')))))
        : h('p.empty', 'Todavía no tenés amigos. Visitá guaridas y mandale una solicitud a quien te guste.'),
      sentCard));
}

/* ---------- Escaparate ---------- */
function showcaseView(ctx) {
  const { game, S } = ctx;
  const p = S.player;
  const fac = UI.faction ?? p.faction;
  const sc = game.showcase(fac, UI.league ?? undefined);
  const myLeague = sc.myLeague;
  if (UI.league == null) { UI.league = myLeague; return showcaseView(ctx); }
  const list = sc.ok ? sc.list : [];
  const meIdx = list.findIndex((x) => x.id === p.id);
  const top = list.slice(0, 15);
  const winnersTop = CFG.lair.visit.prize.top;

  const row = (x, i) => h(`li.rank${x.id === p.id ? '.me' : ''}${i < winnersTop ? '.podium' : ''}`,
    h('span.pos.tnum', `${i + 1}`),
    avatar(x.faction, x.name, '', x.level),
    h('div.t-info', h('strong', x.id === p.id ? `${x.name} (vos)` : x.name), h('span.muted.tnum', `Prestigio ${num(x.prestige)} · ${x.applause} aplausos`)),
    h('span.score.tnum', num(x.score)),
    x.id === p.id ? h('span.spacer') : h('button.icon-btn', { type: 'button', 'aria-label': `Visitar a ${x.name}`, onclick: () => doVisit(ctx, x.id) }, icon('guarida', 18)));

  return h('div.stack',
    h('section.card',
      h('div.filters',
        segmented(CFG.lair.leagues.map((l) => [l.id, l.name]), UI.league, (k) => { UI.league = k; ctx.refresh(); }),
        segmented([['hero', 'Héroes'], ['villain', 'Villanos']], fac, (k) => { UI.faction = k; ctx.refresh(); })),
      h('p.muted.hint', `Puntaje = prestigio + ${CFG.lair.visit.applauseWeight} × aplausos únicos de la semana. Los lunes el top ${winnersTop} de cada liga y facción gana ${CFG.lair.visit.prize.renown} de renombre y un marco de honor. Tu liga: ${LEAGUE[myLeague]}.`),
      h('ol.ranking', top.map(row)),
      meIdx >= 15 ? h('ol.ranking', { start: meIdx + 1 }, row(list[meIdx], meIdx)) : null));
}

/* ---------- Guerra de facciones ---------- */
function factionView(ctx) {
  const st = ctx.game.state();
  const s = st.faction, total = s.hero + s.villain;
  const k = total ? s.hero / total : 0.5;
  const mine = st.player.faction;
  const prize = st.lastPrize;
  return h('div.stack',
    h('section.card.war',
      h('h2.display', 'Guerra de facciones'),
      h('p.muted', 'Gana la facción con más victorias de la semana. Los miembros con al menos ' + CFG.faction.minWins + ' victorias cobran ' + CFG.faction.renown + ' de renombre y un estandarte.'),
      h('div.war-bar', { role: 'img', 'aria-label': `Héroes ${s.hero}, Villanos ${s.villain}` },
        h('span.hero', { style: { flexGrow: Math.max(0.04, k) } }, h('strong.tnum', num(s.hero))),
        h('span.villain', { style: { flexGrow: Math.max(0.04, 1 - k) } }, h('strong.tnum', num(s.villain)))),
      h('div.war-legend', h('span', 'Héroes'), h('span', 'Villanos')),
      h('p', s.hero === s.villain ? 'Empate por ahora. Cada caza ganada suma para tu facción.' : (s[mine] > s[mine === 'hero' ? 'villain' : 'hero'] ? 'Tu facción va ganando. Cada caza ganada suma.' : 'Tu facción va perdiendo. Cada caza ganada suma.'))),
    prize ? h('section.card',
      h('h2.display', 'Semana pasada'),
      h('p', prize.faction.winner ? `Ganaron los ${FAC[prize.faction.winner]} (${num(prize.faction.score.hero)} a ${num(prize.faction.score.villain)}).` : 'Empate.'),
      prize.faction.rewarded.includes(st.player.id) ? h('p.note', '¡Cobraste el premio de facción!') : null,
      h('p.muted.hint', 'Escaparate: ' + prize.winners.filter((w) => w.faction === mine).slice(0, 3).map((w) => `${w.name} (${LEAGUE[w.league]})`).join(', '))) : null);
}
