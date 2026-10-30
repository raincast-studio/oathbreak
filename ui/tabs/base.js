// Base (mockup): tu personaje en escena con accesos a Equipo y Tienda, cuatro tarjetas (misión, arena, guarida, visitas),
// el último ataque recibido con "Revancha", primeros pasos y objetivos del día. Solo presenta lo que dice la fachada.
import { h, icon, num, clock, toast, sprite, avatar } from '../kit.js';
import { firstSteps } from '../onboarding.js';
import { startFight } from '../fight.js';
import { claimMission, rewardLine } from './misiones.js';
export const title = 'Base';

export function render(ctx) {
  return h('section.stack',
    stage(ctx),
    cards(ctx),
    lastAttack(ctx),
    firstSteps(ctx),
    dailyCard(ctx));
}

/* ---------- Escenario del personaje (marcador hasta tener sprites) ---------- */
function stage({ S, go }) {
  const p = S.player;
  return h('section.stage', { 'aria-label': 'Tu personaje' },
    h('div.stage-glow', { 'aria-hidden': 'true' }),
    sprite(p.faction, '.stage-sprite', p.level),
    h('div.stage-hp', h('div.hp-top', h('span.hp-l', 'VIDA'), h('span.tnum', `${num(p.maxHp)}/${num(p.maxHp)}`)), h('div.hp-track', h('span'))),
    h('div.fabs.left', h('button.fab', { type: 'button', onclick: () => go('personaje', { intent: 'equipo' }) }, icon('equipo', 22), 'EQUIPO')),
    h('div.fabs.right', h('button.fab', { type: 'button', onclick: () => go('guarida', { intent: 'tienda' }) }, icon('tienda', 22), 'TIENDA')));
}

/* ---------- Las cuatro tarjetas ---------- */
function cards(ctx) {
  const { S, game, go } = ctx;
  const p = S.player, m = p.mission;
  const lr = game.lair();
  const ws = lr.workshop, vs = lr.visits;

  let mission;
  if (m?.done) mission = h('div.qcard.ready', h('span.lbl', 'MISIÓN CUMPLIDA'), h('span.q-big.display', m.name), rewardLine(m.reward),
    h('button.btn.gold.small', { type: 'button', onclick: (e) => claimMission(ctx, e.currentTarget) }, 'COBRAR'));
  else if (m) {
    const total = m.end - m.start;
    mission = h('button.qcard', { type: 'button', onclick: () => go('misiones') }, h('span.lbl', 'MISIÓN EN CURSO'),
      h('span.q-big.display.tnum', { 'data-mission-left': m.msLeft }, clock(m.msLeft)),
      h('span.q-bar', { 'data-mission': '', 'data-left': m.msLeft, 'data-total': total }, h('span', { style: { transform: `scaleX(${1 - m.msLeft / total})` } })),
      h('span.q-sub', `${m.name} · ${num(m.reward.gold)} oro`));
  } else mission = h('button.qcard', { type: 'button', onclick: () => go('misiones') }, h('span.lbl', 'MISIÓN'), h('span.q-big.display', 'Libre'), h('span.q-sub', 'Elegí un contrato para cuando no estés'));

  const tg = m ? null : game.targets();
  const free = tg?.ok ? tg.list.filter((t) => !t.block) : [];
  const best = free.reduce((a, t) => Math.max(a, t.loot), 0);
  const arena = h('button.qcard.q-arena', { type: 'button', onclick: () => go('arena') }, h('span.lbl', 'ARENA'),
    m ? h('span.q-big.display', 'En misión') : h('span.q-big.display', `${free.length} rivales`),
    h('span.q-sub', m ? 'Terminala para cazar' : `Botín más alto: ${num(best)} oro`),
    S.revenge ? h('span.q-alert', `${S.revenge} por vengar`) : null);

  const guarida = ws.level
    ? h('div.qcard', h('span.lbl', 'GUARIDA'), h('span.q-big.display.tnum', `${num(ws.stored)} oro`),
      h('button.btn.gold.small', { type: 'button', disabled: ws.stored <= 0, onclick: (e) => ctx.act(e.currentTarget, (g) => g.claimWorkshop(), (r) => `+${num(r.gold)} oro del Taller`) }, 'COBRAR'))
    : h('button.qcard', { type: 'button', onclick: () => go('guarida', { intent: 'edificios' }) }, h('span.lbl', 'GUARIDA'), h('span.q-big.display', 'Sin Taller'), h('span.q-sub', 'Construilo para ganar oro pasivo'));

  const streak = Math.min(7, vs.streak % 7 || (vs.streak ? 7 : 0));
  const social = h('button.qcard', { type: 'button', onclick: () => go('social') }, h('span.lbl', 'VISITAS HOY'),
    h('span.q-big.display.tnum', `${vs.rewarded}/${vs.rewardedCap}`),
    h('span.streak', { 'aria-label': `Racha de ${vs.streak} días` }, Array.from({ length: 7 }, (_, i) => h(`i${i < streak ? '.on' : ''}`))),
    h('span.q-sub', `Racha ${vs.streak} ${vs.streak === 1 ? 'día' : 'días'}`));

  return h('div.qgrid', mission, arena, guarida, social);
}

/* ---------- Último ataque recibido ---------- */
function lastAttack(ctx) {
  const { S, game } = ctx;
  const ib = game.inbox();
  const it = ib.ok && ib.list.find((x) => x.role === 'defender');
  if (!it || S.now - it.report.ts > 24 * 3_600_000) return null;
  const r = it.report, won = r.winner === 'defender';
  const rv = game.revenge();
  const target = rv.ok && rv.list.find((x) => x.id === r.attacker.id);
  const m = Math.floor((S.now - r.ts) / 60_000);
  return h('div.attacked',
    avatar(r.attacker.faction, r.attacker.name, '', r.attacker.lvl),
    h('div.g-info',
      h('span', h('strong', r.attacker.name), won ? ' te atacó y perdió.' : ' te atacó y ganó.'),
      h('span.muted', h('span.' + (won ? 'plus' : 'minus'), won ? `+${num(r.loot.bounty)} oro` : `−${num(r.loot.gold)} oro`), ` · ${m < 60 ? `hace ${Math.max(1, m)} min` : `hace ${Math.floor(m / 60)} h`}`)),
    target ? h('button.btn.crimson.small', { type: 'button', disabled: !!target.block || S.player.energy < 1, title: target.block ? '' : 'Ignora rango y cooldown',
      onclick: (e) => startFight(ctx, e.currentTarget, (g) => g.attack(target.id)) }, 'REVANCHA') : null);
}


/* ---------- Objetivos del día ---------- */
function dailyCard({ game, act }) {
  const d = game.daily();
  if (!d.ok) return null;
  const allClaimed = d.list.every((o) => o.claimed);
  const done = d.list.filter((o) => o.claimed).length;
  const claim = (id, okText) => (e) => {
    const r = act(e.currentTarget, (g) => g.claimDaily(id), okText);
    if (r?.ok && r.levels) toast('¡Subiste de nivel!', 'prize');
  };

  return h('section.card.daily',
    h('div.sec-head', h('h2.display', 'Objetivos del día'), h('span.muted.tnum', `${done}/${d.list.length}`)),
    h('ul.goals', d.list.map((o) => h(`li.goal${o.claimed ? '.claimed' : o.done ? '.ready' : ''}`,
      h('div.g-info',
        h('strong', o.name),
        h('div.g-bar', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': o.target, 'aria-valuenow': o.progress, 'aria-label': o.name },
          h('span', { style: { transform: `scaleX(${o.progress / o.target})` } })),
        h('span.g-meta.tnum', `${o.progress}/${o.target} · `, rewardLine(o.reward))),
      o.claimed ? h('span.g-check', { 'aria-label': 'Cobrado' }, '✓')
        : h('button.btn.small' + (o.done ? '.gold' : '.ghost'), { type: 'button', disabled: !o.done, onclick: claim(o.id, (r) => `+${num(r.gold)} oro · +${num(r.xp)} XP`) }, 'Cobrar')))),
    h(`div.bonus${d.bonus.claimed ? '.claimed' : allClaimed ? '.ready' : ''}`,
      h('span.b-ico', icon('crown', 20)),
      h('div.g-info',
        h('strong', 'Bono por completar los 3'),
        h('span.g-meta.tnum', `+${num(d.bonus.gold)} oro · +${d.bonus.renown} renombre`)),
      d.bonus.claimed ? h('span.g-check', { 'aria-label': 'Cobrado' }, '✓')
        : h('button.btn.small' + (allClaimed ? '.violet' : '.ghost'), { type: 'button', disabled: !allClaimed,
          onclick: claim('bonus', (r) => `+${num(r.gold)} oro · +${r.renown} renombre`) }, 'Cobrar')),
    h('p.muted.hint', 'Se renuevan todos los días a las 00:00.'));
}

