// Pestaña Caza: cazar al azar, presa del día y lista de objetivos. El combate lo resuelve la fachada;
// la interfaz solo muestra "Cazando…" (tiempo fijo) y el informe.
import { h, icon, num, clock } from '../kit.js';
import { errText } from '../errors.js';
import { playHunt } from '../report.js';
export const title = 'Caza';

const BAND = { debil: 'Débil', parejo: 'Parejo', fuerte: 'Fuerte', muy_fuerte: 'Muy fuerte' };

export function render(ctx) {
  const { S, game } = ctx;
  const p = S.player;
  const tg = game.targets();
  const list = tg.ok ? tg.list : [];
  const prey = list.find((t) => t.prey && !t.block);
  const rest = list.filter((t) => t !== prey);
  const noEnergy = p.energy < 1;
  const foeF = p.faction === 'hero' ? 'villain' : 'hero'; // los objetivos siempre son de la facción rival

  const attack = (btn, run) => {
    const r = ctx.act(btn, run, null, { refresh: false });
    if (!r?.ok) return;
    ctx.refreshTop({ energyOnly: true }); // la energía baja ya; el oro y la XP se revelan con el informe
    playHunt(r.report, p.id, {
      onReveal: () => ctx.refreshTop(),
      onDone: () => { game.markRead(r.report.id); ctx.refresh(); ctx.celebrate(r.report); },
    });
  };

  // Sin "cazar al azar": elegir el objetivo siempre rinde más (banda, botín, presa), así que la lista es la acción.
  const cta = h('section.hunt-cta',
    h('div.hunt-copy',
      h('h1.display', 'Cazar'),
      h('p.muted', noEnergy
        ? h('span', 'Sin energía. Recuperás 1 en ', h('strong.tnum', { 'data-energy-cd': '' }, clock(p.nextEnergyMs)), '.')
        : `Cada ataque cuesta 1 de energía (te quedan ${p.energy} de ${p.energyMax}). Elegí a quién según su banda y su botín.`)));

  const preyCard = prey && h('section.prey',
    h('div.prey-badge', icon('star', 18), 'Presa del día'),
    h('div.prey-main',
      avatar(prey, foeF, true),
      h('div.t-info', h('strong', prey.name), h('span.muted', `Nivel ${prey.level}`), bandChip(prey.band))),
    h('p.prey-perk', 'Doble XP y un bono de oro la primera vez que la derrotás hoy.'),
    h('div.prey-foot',
      h('span.loot.tnum', icon('coin', 16), `~${num(prey.loot)} de botín`),
      h('button.btn.gold', { type: 'button', disabled: noEnergy, onclick: (e) => attack(e.currentTarget, (g) => g.attack(prey.id)) }, 'Atacar presa')));

  const rows = rest.map((t) => h(`li.target${t.block ? '.blocked' : ''}`,
    avatar(t, foeF),
    h('div.t-info',
      h('strong', t.name),
      h('span.t-meta', h('span.muted', `Nv ${t.level}`), bandChip(t.band)),
      t.block ? h('span.t-block', errText(t.block)) : h('span.loot.tnum', icon('coin', 14), `~${num(t.loot)}`)),
    h('button.btn.crimson.small', { type: 'button', disabled: !!t.block || noEnergy, 'aria-label': `Atacar a ${t.name}`,
      onclick: (e) => attack(e.currentTarget, (g) => g.attack(t.id)) }, 'Atacar')));

  return h('section.stack',
    cta,
    preyCard || null,
    h('section.targets',
      h('div.sec-head', h('h2.display', 'Objetivos en tu rango'), h('span.muted.tnum', `${rest.length}`)),
      h('p.muted.hint', 'La banda estima tu chance de ganar. A rival más fuerte, más XP si ganás.'),
      rows.length ? h('ul.target-list', rows) : h('p.empty', 'No hay rivales en tu rango ahora. Volvé en un rato.')));
}

function avatar(t, faction, big = false) {
  return h(`span.avatar${big ? '.big' : ''}`, { 'data-f': faction, 'aria-hidden': 'true' }, t.name.slice(0, 1).toUpperCase());
}
const bandChip = (b) => h(`span.band.${b}`, BAND[b] ?? b);
