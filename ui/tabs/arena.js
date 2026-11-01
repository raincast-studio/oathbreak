// Arena (PvP): Rivales (con la presa del día), Venganza y Ranking. El combate lo resuelve la fachada.
// Mientras hay una misión en curso no se puede atacar (regla de la fachada: en_mision).
import { h, icon, num, clock, openSheet, closeSheet, avatar } from '../kit.js';
import { errText } from '../errors.js';
import { startFight } from '../fight.js';
import { segmented } from './guarida.js';
export const title = 'Arena';

const UI = { sub: 'rivales' };
const ago = (ms) => { const m = Math.floor(ms / 60_000); return m < 60 ? `hace ${Math.max(1, m)} min` : `hace ${Math.floor(m / 60)} h`; };

export function render(ctx) {
  const { S, game } = ctx;
  const p = S.player;
  if (ctx.S.intent) UI.sub = ctx.S.intent;
  const busy = !!p.mission;
  const noEnergy = p.energy < 1;
  const foeF = p.faction === 'hero' ? 'villain' : 'hero';
  const rv = game.revenge();
  const revenge = rv.ok ? rv.list : [];

  // Fila de rival (estilo mockup): avatar, nombre, nivel · nota, botín (sin chance: decisión del dueño 31/10), botón con su costo.
  const row = (t, note, cta = 'ATACAR', extra = null) => {
    const blocked = !!t.block || noEnergy;
    return h(`li.riv${t.block ? '.blocked' : ''}`,
      avatar(foeF, t.name, '.lg', t.level),
      h('div.riv-info',
        h('strong.display', t.name),
        h('span.muted', `Nv ${t.level}${note ? ` · ${note}` : ''}`),
        t.block && t.block !== 'en_mision' ? h('span.t-block', errText(t.block))
          : h('span.riv-meta', h('span.loot.tnum', `Botín ${num(t.loot)} oro`))),
      extra,
      h('button.atk', { type: 'button', disabled: blocked, 'aria-label': `${cta === 'VENGAR' ? 'Vengarte de' : 'Atacar a'} ${t.name}, 1 de energía`,
        onclick: (e) => startFight(ctx, e.currentTarget, (g) => g.attack(t.id)) }, cta, h('small', '1 energía')));
  };

  let body;
  if (UI.sub === 'venganza') {
    body = revenge.length
      ? h('ul.riv-list', revenge.map((t) => row(t, t.stolen ? `te robó ${num(t.stolen)} oro · ${ago(S.now - t.ts)}` : `te atacó ${ago(S.now - t.ts)}`, 'VENGAR')))
      : h('p.empty', 'Nadie te atacó en las últimas 24 h. Cuando alguien lo haga, vas a poder devolverle el golpe una vez, aunque esté fuera de tu rango.');
  } else if (UI.sub === 'ranking') {
    const rk = game.ranking();
    body = h('ul.riv-list', (rk.ok ? rk.list : []).map((t) => row(t, `#${t.pos} ${foeF === 'hero' ? 'Héroes' : 'Villanos'} · ${num(t.rep)} reput.`)));
  } else {
    const tg = game.targets();
    const list = tg.ok ? tg.list : [];
    const prey = list.find((t) => t.prey && !t.block);
    const rest = list.filter((t) => t !== prey).sort((a, b) => !!a.block - !!b.block); // 31/10: disponibles primero
    body = h('div.stack',
      prey ? h('section.prey',
        h('div.prey-badge', icon('star', 18), 'Presa del día'),
        h('ul.riv-list', row(prey, 'doble XP y bono de oro'))) : null,
      rest.length ? h('ul.riv-list', rest.map((t) => row(t, foeF === 'hero' ? 'Héroe' : 'Villano'))) : h('p.empty', 'No hay rivales en tu rango ahora. Volvé en un rato.'));
  }

  return h('section.stack',
    h('div.page-head',
      h('div', h('p.kick', 'PVP POR TURNOS · MÁX 5 RONDAS'), h('h1.h1', 'ARENA')),
      h('span.pill', '1 energía por ataque')),
    S.event ? h('p.event-banner', icon('star', 18), h('span', h('strong', S.event), ': +25% de XP por ganar y Gloria doble.')) : null,
    busy ? missionBanner(ctx) : noEnergy ? h('p.note', 'Sin energía. Recuperás 1 en ', h('strong.tnum', { 'data-energy-cd': '' }, clock(p.nextEnergyMs)), '.') : null,
    segmented([['rivales', 'Rivales'], ['venganza', revenge.length ? `Venganza · ${revenge.length}` : 'Venganza'], ['ranking', 'Ranking']], UI.sub, (k) => { UI.sub = k; ctx.refresh(); }),
    body);
}

// Con misión en curso: aviso y salida (terminarla o cancelarla).
function missionBanner(ctx) {
  const m = ctx.S.player.mission;
  return h('div.busy',
    h('span.busy-ico', icon('misiones', 22)),
    h('div.g-info',
      h('strong', m.done ? 'Tu misión terminó' : `En misión: ${m.name}`),
      h('span.muted', m.done ? 'Cobrala para volver a cazar.' : h('span', 'No podés cazar hasta que termine (', h('span.tnum', { 'data-mission-left': m.msLeft }, clock(m.msLeft)), ') o la canceles.'))),
    m.done
      ? h('button.btn.gold.small', { type: 'button', onclick: () => ctx.go('misiones') }, 'Cobrar')
      : h('button.btn.ghost.small', { type: 'button', onclick: () => openSheet({ title: '¿Cancelar la misión?', body: h('div.stack',
        h('p', 'Perdés el tiempo que ya lleva y no cobrás nada. Después podés cazar.'),
        h('div.row',
          h('button.btn.ghost', { type: 'button', onclick: () => closeSheet() }, 'Seguir en misión'),
          h('button.btn.crimson', { type: 'button', onclick: (e) => { closeSheet(true); ctx.act(e.currentTarget, (g) => g.cancelMission(), () => 'Misión cancelada: ya podés cazar'); } }, 'Cancelar misión'))) }) }, 'Cancelar'));
}
