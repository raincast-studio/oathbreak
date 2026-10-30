// Misiones: trabajos pasivos. Una a la vez; mientras corre, no se puede cazar en la Arena.
import { h, icon, num, clock, toast, openSheet, closeSheet } from '../kit.js';
export const title = 'Misiones';

export function render(ctx) {
  return h('section.stack',
    h('div.page-head', h('div', h('p.kick.gold', 'TRABAJOS PASIVOS'), h('h1.h1', 'MISIONES'))),
    h('p.note', 'Mientras estás en una misión no podés cazar en la Arena. Usalas para cuando no vas a estar jugando: avanzan con el juego cerrado.'),
    missionCard(ctx));
}

export function claimMission(ctx, btn) {
  const r = ctx.act(btn, (g) => g.claimMission(), (x) => `+${num(x.gold)} oro · +${num(x.xp)} XP`);
  if (r?.ok && r.drop) toast(`Encontraste: ${r.drop}`, 'prize');
  if (r?.ok && r.levels) toast(`¡Nivel ${r.level}!`, 'prize');
  return r;
}

/* ---------- Misión ---------- */
export const dur = (min) => (min < 60 ? `${min} min` : `${min / 60} h`);
export const rewardLine = (r) => h('span.rw-line.tnum', h('span.g', icon('coin', 14), `+${num(r.gold)}`), h('span.x', icon('star', 14), `+${num(r.xp)} XP`));

export function missionCard(ctx) {
  const { S, game, act } = ctx;
  const m = S.player.mission;

  if (m?.done) {
    return h('section.card.mission.done',
      h('p.eyebrow', 'Misión cumplida'),
      h('h2.display', m.name),
      rewardLine(m.reward),
      h('button.btn.gold.big', { type: 'button', onclick: (e) => claimMission(ctx, e.currentTarget) }, 'Cobrar'));
  }

  if (m) {
    const total = m.end - m.start;
    return h('section.card.mission',
      h('div.m-head', h('div', h('p.eyebrow', 'Misión en curso'), h('h2.display', m.name)), rewardLine(m.reward)),
      h('div.m-track', { 'data-mission': '', 'data-left': m.msLeft, 'data-total': total },
        h('span', { style: { transform: `scaleX(${1 - m.msLeft / total})` } })),
      h('div.m-foot',
        h('span.muted', 'Termina en ', h('strong.tnum.m-left', { 'data-mission-left': m.msLeft }, clock(m.msLeft))),
        h('button.btn.ghost.small', { type: 'button', onclick: () => confirmCancel(ctx) }, 'Cancelar')),
      h('p.muted.hint', 'Mientras tanto podés visitar guaridas y decorar. Para cazar, esperá a que termine o cancelala.'));
  }

  const c = game.contracts();
  return h('section.card.mission',
    h('div', h('p.eyebrow', 'Misión'), h('h2.display', 'Elegí un contrato')),
    h('p.muted', 'Una misión a la vez. No gasta energía. Elegí una que termine cuando vuelvas.'),
    h('ul.contracts', (c.ok ? c.list : []).map((k) => h('li.contract',
      h('div.c-info', h('strong', k.name), h('span.c-meta', h('span.dur.tnum', dur(k.min)), rewardLine(k.reward))),
      h('button.btn.gold.small', { type: 'button', onclick: (e) => act(e.currentTarget, (g) => g.startMission(k.id), () => `Misión en marcha: ${k.name}`) }, 'Empezar')))));
}

function confirmCancel({ act }) {
  openSheet({ title: '¿Cancelar la misión?', body: h('div.stack',
    h('p', 'Perdés el tiempo que ya lleva y no cobrás nada.'),
    h('div.row',
      h('button.btn.ghost', { type: 'button', onclick: () => closeSheet() }, 'Seguir'),
      h('button.btn.crimson', { type: 'button', onclick: (e) => { closeSheet(true); act(e.currentTarget, (g) => g.cancelMission(), () => 'Misión cancelada'); } }, 'Cancelar misión'))) });
}

