// Pantalla "Cazando…" (fija, CFG.ui.huntLoadingMs) e informe de combate. Solo presentación del objeto report.
import { CFG } from '../src/game.js';
import { details } from '../src/reports.js';
import { h, $, icon, num, reduced, sprite } from './kit.js';
import { reportLink } from './safety.js'; // v17 (gancho de Confianza)

const REASON = { KO: 'por K.O.', DAMAGE: 'por quitar más vida', TIE_DEF: 'empate: gana el defensor' };
const BOUNTY_NO = {
  rival_debil: 'Sin recompensa: el atacante no tenía chances reales.',
  ya_cobrada_hoy: 'Sin recompensa: ya cobraste por este rival hoy.',
  atacante_sin_victorias: 'Sin recompensa: el atacante casi nunca gana.',
};

const fighter = (f, side) => h(`div.fighter.${side}`, { 'data-f': f.faction }, sprite(f.faction, '', f.lvl));

// Capa propia a pantalla completa: no se cierra arrastrando ni tocando afuera (la espera es fija).
function layer() {
  const el = h('div.hunt-layer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Caza' });
  document.body.append(el);
  $('#app').inert = true;
  document.documentElement.classList.add('locked');
  requestAnimationFrame(() => el.classList.add('in'));
  return el;
}
function close(el) {
  el.classList.remove('in');
  $('#app').inert = false;
  document.documentElement.classList.remove('locked');
  setTimeout(() => el.remove(), reduced() ? 0 : 220);
}

// Muestra "Cazando…" y después el informe. onDone se llama al tocar Continuar.
export function playHunt(report, viewerId, { onReveal, onDone } = {}) {
  const me = report.attacker.id === viewerId ? 'attacker' : 'defender';
  const foe = me === 'attacker' ? 'defender' : 'attacker';
  const el = layer();
  const ms = CFG.ui.huntLoadingMs;
  el.style.setProperty('--hunt-ms', `${ms}ms`);
  el.append(h('div.hunting', { 'aria-live': 'polite' },
    h('div.arena', fighter(report[me], 'left'), h('span.clash', { 'aria-hidden': 'true' }), fighter(report[foe], 'right')),
    h('p.display.hunting-title', `Cazando a ${report[foe].name}…`),
    h('div.hunt-progress', h('span'))));
  hits(el, report, me, ms);
  setTimeout(() => {
    onReveal?.();
    el.replaceChildren(reportView(report, me, () => { close(el); onDone?.(); }));
    el.querySelector('.rep-continue')?.focus({ preventScroll: true });
  }, ms);
}

// 31/10: golpes animados durante "Cazando…": hasta 4 golpes reales del combate (número de daño y sacudida del que lo recibe).
// No adelanta el resultado: se eligen los primeros golpes, que no dicen quién gana.
function hits(el, report, me, ms) {
  if (reduced() || !report.rounds) return;
  const seq = report.rounds.slice(0, 4);
  seq.forEach((x, i) => setTimeout(() => {
    const arena = el.querySelector('.arena');
    if (!arena) return;
    const hitMe = (x.actor === 'A') !== (me === 'attacker'); // el golpe lo recibe "mi" luchador (izquierda)
    const side = hitMe ? 'left' : 'right';
    const f = arena.querySelector(`.fighter.${side}`);
    const pop = h(`span.dmg.${side}${x.crit ? '.crit' : ''}${x.dodge ? '.miss' : ''}`, x.dodge ? '¡Esquiva!' : `−${x.dmg}${x.crit ? '!' : ''}`);
    arena.append(pop);
    setTimeout(() => pop.remove(), 700);
    if (f && !x.dodge) { f.classList.remove('hit'); void f.offsetWidth; f.classList.add('hit'); }
  }, ms * (0.18 + i * 0.17)));
}

// Informe ya resuelto (también sirve para abrir uno desde la bandeja).
export function showReport(report, viewerId, { onDone } = {}) {
  const me = report.attacker.id === viewerId ? 'attacker' : 'defender';
  const el = layer();
  el.append(reportView(report, me, () => { close(el); onDone?.(); }));
  el.querySelector('.rep-continue')?.focus({ preventScroll: true });
}

function reportView(r, me, done) {
  const foe = me === 'attacker' ? 'defender' : 'attacker';
  const won = r.winner === me;
  const hpBar = (who, label) => {
    const x = r[who], k = x.maxHp ? x.hpEnd / x.maxHp : 0;
    return h('div.hp',
      h('div.hp-top', h('span', label), h('span.tnum', `${num(x.hpEnd)} / ${num(x.maxHp)}`)),
      h('div.hp-track', h('span', { style: { transform: `scaleX(${k})` } })));
  };

  // Botín, desde el punto de vista de quien mira.
  const loot = [];
  if (r.winner === 'attacker') {
    loot.push(me === 'attacker' ? reward('coin', `+${num(r.loot.gold)}`, 'oro robado', 'gold') : reward('coin', `−${num(r.loot.gold)}`, 'oro robado', 'loss'));
    if (me === 'attacker' && r.loot.win) loot.push(reward('coin', `+${num(r.loot.win)}`, 'por la victoria', 'gold'));
  }
  else if (me === 'attacker') loot.push(reward('coin', '0', 'No perdiste oro', 'neutral'));
  else if (r.loot.bounty) loot.push(reward('coin', `+${num(r.loot.bounty)}`, 'recompensa por defensa', 'gold'));
  loot.push(reward('star', `+${num(r.xp[me])}`, 'XP', 'xp'));
  if (won) loot.push(reward('shield', `+${r.rep.winner}`, 'reputación', 'rep'));
  if (me === 'attacker' && r.prey) loot.push(reward('crown', `+${num(r.prey.gold)} · +${num(r.prey.xp)} XP`, 'bono de presa ★', 'prize'));

  const notes = [];
  if (me === 'defender' && r.winner === 'defender' && !r.loot.bounty) notes.push(BOUNTY_NO[r.loot.bountyReason] ?? 'Sin recompensa.');
  if (r.levelUp[me]) notes.push(h('strong', `¡Subiste ${r.levelUp[me] > 1 ? `${r.levelUp[me]} niveles` : 'de nivel'}!`));
  if (r.trophy?.to === me) notes.push(h('strong', `Trofeo desbloqueado: ${r.trophy.name}`));

  const log = h('ol.rep-log', { hidden: true }, details(r).map((line) => {
    if (line.startsWith('—')) return h('li.round', line.replace(/—/g, '').trim());
    const cls = line.includes('CRÍTICO') ? 'crit' : line.includes('esquiva') ? 'dodge' : '';
    return h(`li${cls ? `.${cls}` : ''}`, line);
  }));
  const toggle = h('button.btn.ghost', { type: 'button', 'aria-expanded': 'false', onclick: (e) => {
    log.hidden = !log.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!log.hidden));
    e.currentTarget.textContent = log.hidden ? 'Ver detalles' : 'Ocultar detalles';
  } }, 'Ver detalles');

  const onKey = (e) => { if (e.key === 'Escape') { removeEventListener('keydown', onKey); done(); } };
  addEventListener('keydown', onKey);

  return h(`article.report.${won ? 'won' : 'lost'}`,
    h('header.rep-head',
      h('p.eyebrow', me === 'attacker' ? `${r.revenge ? 'Venganza contra' : 'Atacaste a'} ${r[foe].name} · Nv ${r[foe].lvl}` : `Te atacó ${r[foe].name} · Nv ${r[foe].lvl}`),
      h('h1.display.rep-title', won ? 'VICTORIA' : 'DERROTA'),
      h('p.rep-reason', REASON[r.reason])),
    h('section.rep-duel',
      hpBar(me, 'Vos'), hpBar(foe, r[foe].name),
      h('p.muted.tnum', `Vida quitada: vos ${r.dealtPct[me]}% · rival ${r.dealtPct[foe]}%`)),
    h('section.rep-loot', loot),
    notes.length ? h('div.rep-notes', notes.map((n) => h('p', n))) : null,
    log,
    h('div.rep-actions', toggle,
      h('button.btn.gold.rep-continue', { type: 'button', onclick: () => { removeEventListener('keydown', onKey); done(); } }, 'Continuar')),
    reportLink(r[foe], r.id));
}

function reward(ico, value, label, kind) {
  return h(`div.reward.${kind}`, h('span.rw-ico', icon(ico, 18)), h('strong.tnum', value), h('span', label));
}
