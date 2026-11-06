// Pestaña Personaje: atributos (+ Distribuir), equipo, banco y temporada. Reglas y precios vienen de la fachada.
import { CFG, ITEM } from '../../src/game.js';
import { h, icon, num, clock, toast, openSheet, closeSheet, avatar } from '../kit.js';
import { segmented } from './guarida.js';
import { accountCard } from '../account.js';
import { notifyState, askNotify, installState, installButton } from '../extras.js';
import * as A from '../audio.js';
import { usageRow } from '../telemetry-panel.js'; // v17 telemetría

// v17: Ajustes del dispositivo (sonido, música, vibración). Se guardan en este dispositivo, no en la partida.
function settingsSheet() {
  const row = (k, name, desc, ok) => h('div.set-row',
    h('div.set-txt', h('strong', { id: `set-${k}` }, name), h('span.muted', desc)),
    h('button.switch', { type: 'button', role: 'switch', 'aria-labelledby': `set-${k}`, 'aria-checked': String(ok && A.prefs()[k]), disabled: !ok, onclick: (e) => {
      const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
      A.setPref(k, on);
      e.currentTarget.setAttribute('aria-checked', String(on));
      if (on && k === 'sound') A.sfx('coin');
      if (on && k === 'vibe') A.vibe(40);
    } }, h('span.knob')));
  const au = A.supported(), vb = A.canVibrate();
  openSheet({ title: 'Ajustes', body: h('section.card.settings',
    row('sound', 'Sonido', au ? 'Golpes, monedas, botones y fanfarrias.' : 'Este navegador no reproduce sonido.', au),
    row('music', 'Música', au ? 'Música ambiente suave de tu facción. Gasta un poco más de batería.' : 'Este navegador no reproduce sonido.', au),
    row('vibe', 'Vibración', vb ? 'Golpes recibidos, críticos, victorias y subidas de nivel.' : 'Tu dispositivo no vibra desde el navegador (por ejemplo, en iPhone).', vb),
    usageRow(),
    h('p.muted.hint', 'Estos ajustes son de este dispositivo: no viajan con tu partida.')) });
}

// 31/10: avisos (misión terminada, energía llena, te atacaron) e instalación como app.
function notifyCard(ctx) {
  const st = notifyState();
  return h('section.card',
    h('h2.display', 'Avisos'),
    h('p.muted', st === 'granted' ? 'Activados: te avisamos cuando termine tu misión, se llene tu energía o te ataquen (con el juego abierto o instalado en segundo plano).'
      : st === 'denied' ? 'Bloqueados en este navegador. Activalos desde la configuración del sitio.'
      : st === 'unsupported' ? 'Este navegador no permite avisos.' : 'Te avisamos cuando termine tu misión, se llene tu energía o te ataquen, mientras el juego siga abierto o instalado en segundo plano.'),
    st === 'default' ? h('button.btn.gold', { type: 'button', onclick: async () => { await askNotify(); ctx.refresh(); } }, 'Activar avisos') : null,
    installState() === 'installed' ? h('p.muted.hint', 'Instalado como app en este dispositivo.')
      : h('div.row', installButton('.btn.ghost'), h('span.muted.hint', 'Se abre como una app y los avisos funcionan mejor.')));
}
export const title = 'Personaje';

const UI = { sub: 'atributos' };
const FAC = { hero: 'Héroe', villain: 'Villano' };
const STAT = {
  fue: { name: 'Fuerza', desc: 'Golpes grandes que atraviesan la armadura.' },
  def: { name: 'Defensa', desc: 'Armadura por golpe: anula los golpes chicos.' },
  agi: { name: 'Agilidad', desc: 'Esquive, doble golpe y críticos.' },
  res: { name: 'Resistencia', desc: 'Más vida en cada pelea.' },
};
const SLOT = { arma: 'Arma', armadura: 'Armadura', botas: 'Botas', casco: 'Casco', amuleto: 'Amuleto' };

export function render(ctx) {
  const p = ctx.S.player;
  if (ctx.S.intent) UI.sub = ctx.S.intent;
  const subs = [['atributos', 'Atributos'], ['equipo', 'Equipo'], ['banco', 'Banco'], ['temporada', 'Temporada'], ['cuenta', 'Cuenta']];
  return h('section.stack',
    h('div.hero-card',
      avatar(p.faction, p.name, '.big', p.level),
      h('div.t-info',
        h('h1.display', p.name),
        h('span.muted', `${FAC[p.faction]} · Nivel ${p.level} · ${num(p.maxHp)} de vida`),
        h('span.muted.tnum', `${p.record.w} victorias · ${p.record.l} derrotas · ${num(p.rep)} reputación`)),
      h('button.icon-btn.set-btn', { type: 'button', 'aria-label': 'Ajustes: sonido, música y vibración', onclick: settingsSheet }, icon('sound', 22))),
    segmented(subs, UI.sub, (k) => { UI.sub = k; ctx.refresh(); }),
    UI.sub === 'atributos' ? statsView(ctx) : UI.sub === 'equipo' ? gearView(ctx) : UI.sub === 'banco' ? bankView(ctx) : UI.sub === 'cuenta' ? h('div.stack', accountCard(ctx), notifyCard(ctx)) : seasonView(ctx));
}

/* ---------- Atributos ---------- */
function statsView(ctx) {
  const p = ctx.S.player;
  const rows = CFG.stats.map((k) => {
    const cost = p.statCosts[k], bonus = p.effStats[k] - p.stats[k];
    return h('li.stat',
      h('div.st-info',
        h('div.st-top', h('strong', STAT[k].name), h('span.st-val.tnum', p.effStats[k], bonus ? h('small', ` (${p.stats[k]} + ${bonus} equipo)`) : null)),
        h('span.muted', STAT[k].desc)),
      h('button.btn.small' + (p.gold >= cost ? '.gold' : '.ghost'), { type: 'button', disabled: p.gold < cost, 'aria-label': `Subir ${STAT[k].name} por ${cost} oro`,
        onclick: (e) => ctx.act(e.currentTarget, (g) => g.buyStat(k), () => `+1 ${STAT[k].name}`) }, h('span', '+1 ', icon('coin', 14), num(cost))));
  });
  return h('section.card',
    h('div.sec-head', h('h2.display', 'Atributos'), h('span.muted.tnum', h('span', icon('coin', 14), ` ${num(p.gold)}`))),
    h('p.muted.hint', 'Repartilos a tu gusto. Cada punto encarece a todos por igual. Ninguna combinación le gana a todas: probá, mirá tus informes y ajustá.'),
    h('ul.stat-list', rows));
}

/* ---------- Equipo ---------- */
// Cada pieza tiene variantes: al comprar el tier siguiente elegís a qué atributo suma; cambiarla después cuesta 50% (reforjar).
const statName = (s) => (s === '*' ? 'todos' : STAT[s].name);
function gearView(ctx) {
  const p = ctx.S.player;
  const sh = ctx.game.shop();
  const items = sh.ok ? sh.items : [];
  const cards = Object.keys(SLOT).map((slot) => {
    const cur = p.gear[slot] ?? 0, curStat = p.gearStat[slot];
    const curItem = items.find((i) => i.slot === slot && i.tier === cur);
    const next = items.find((i) => i.slot === slot && i.tier === cur + 1);
    const locked = next && p.level < next.req;
    const multi = next ? next.options.length > 1 : curItem?.options.length > 1;
    return h('li.gear',
      h(`span.slot-ico.t${cur}`, `T${cur}`),
      h('div.st-info',
        h('strong', SLOT[slot]),
        h('span.muted', cur ? `+${curItem.options.find((o) => o.stat === curStat).bonus} ${statName(curStat)}` : 'Sin equipar'),
        next ? h('span.bld-next', `T${next.tier}: +${next.options[0].bonus} ${next.options.map((o) => statName(o.stat)).join(' o ')}${locked ? ` · nivel ${next.req}` : ''}`) : h('span.bld-next', 'Tier máximo')),
      h('div.gear-btns',
        next ? h('button.btn.small' + (locked || p.gold < next.price ? '.ghost' : '.gold'), { type: 'button', disabled: locked || p.gold < next.price,
          onclick: () => gearSheet(ctx, slot, next, false) }, locked ? `Nv ${next.req}` : h('span', icon('coin', 14), num(next.price))) : null,
        cur && multi && curItem ? h('button.btn.ghost.small', { type: 'button', onclick: () => gearSheet(ctx, slot, curItem, true) }, 'Reforjar') : null));
  });
  return h('section.card',
    h('h2.display', 'Equipo'),
    h('p.muted.hint', 'Cada pieza suma un bonus fijo al atributo que elijas. El equipo complementa tus atributos; no los reemplaza.'),
    h('ul.bld-list', cards));
}

function gearSheet(ctx, slot, item, reforge) {
  const p = ctx.S.player;
  const curStat = p.gearStat[slot];
  const opts = reforge ? item.options.filter((o) => o.stat !== curStat) : item.options;
  const price = reforge ? item.reforgePrice : item.price;
  openSheet({ title: `${SLOT[slot]} T${item.tier}`, body: h('div.stack',
    h('p', reforge ? `Cambiá a qué atributo suma tu ${SLOT[slot].toLowerCase()}. Cuesta ${num(price)} de oro (la mitad de la pieza).` : 'Elegí a qué atributo suma esta pieza.'),
    h('div.preset-grid', opts.map((o) => h('button.preset', { type: 'button', disabled: p.gold < price, onclick: (e) => {
      const r = ctx.act(e.currentTarget, (g) => g.buyGear(slot, item.tier, o.stat), () => `${SLOT[slot]} T${item.tier}: +${o.bonus} ${statName(o.stat)}`);
      if (r?.ok) closeSheet(true);
    } }, h('strong', `+${o.bonus} ${statName(o.stat)}`), h('span.muted', o.stat === '*' ? 'Suma a los cuatro' : STAT[o.stat].desc)))),
    h('p.muted.tnum', `Precio: ${num(price)} oro · Tenés ${num(p.gold)}`)) });
}

/* ---------- Banco ---------- */
function bankView(ctx) {
  const p = ctx.S.player;
  const fee = CFG.bank.depositFee;
  const input = h('input#bank-amount.amount', { type: 'number', inputMode: 'numeric', min: 1, step: 1, placeholder: 'Monto', 'aria-label': 'Monto de oro' });
  const val = () => Math.floor(Number(input.value));
  const chips = (max) => h('div.row.tight', [0.25, 0.5, 1].map((k) => h('button.chip-btn', { type: 'button', onclick: () => { input.value = String(Math.floor(max * k)); } }, k === 1 ? 'Todo' : `${k * 100}%`)));
  // Depositar pide confirmación mostrando la comisión.
  const confirmDeposit = () => {
    const n = val();
    if (!(n > 0)) return toast('Escribí cuánto oro querés depositar.', 'err'); // v17-qa: antes "Monto inválido."
    if (n > ctx.S.player.gold) return toast(`No te alcanza: tenés ${num(ctx.S.player.gold)} de oro en mano.`, 'err'); // 31/10: antes recién avisaba al confirmar
    const cut = Math.ceil(n * fee);
    openSheet({ title: 'Confirmar depósito', body: h('div.stack',
      h('p.fee-alert', icon('coin', 18), `Depositar cuesta el ${fee * 100}% de lo que depositás.`),
      h('dl.facts', h('dt', 'Depositás'), h('dd.tnum', `${num(n)} oro`), h('dt', `Comisión (${fee * 100}%)`), h('dd.tnum.minus', `−${num(cut)} oro`), h('dt', 'Llega al banco'), h('dd.tnum', h('strong', `${num(n - cut)} oro`))),
      h('div.row',
        h('button.btn.ghost', { type: 'button', onclick: () => closeSheet() }, 'Cancelar'),
        h('button.btn.gold', { type: 'button', onclick: (e) => { closeSheet(true); ctx.act(e.currentTarget, (g) => g.deposit(n), (r) => `Depositaste ${num(r.deposited)} (comisión ${num(r.fee)})`); } }, `Depositar ${num(n)}`))) });
  };
  return h('section.card',
    h('h2.display', 'Banco'),
    h('div.vs-grid.two', h('div.vs-stat', h('strong.tnum', num(p.gold)), h('span.muted', 'en mano (se puede robar)')), h('div.vs-stat', h('strong.tnum', num(p.bank)), h('span.muted', 'en el banco (a salvo)'))),
    h('p.fee-alert', icon('coin', 18), h('span', h('strong', `Depositar cuesta el ${fee * 100}% de tu oro.`), ' Retirar es gratis. La Bóveda de tu guarida protege una parte del oro en mano sin comisión.')),
    input,
    h('div.row', h('span.muted', 'Rápido:'), chips(p.gold)),
    h('div.row',
      h('button.btn.gold', { type: 'button', onclick: confirmDeposit }, 'Depositar…'),
      h('button.btn.ghost', { type: 'button', onclick: (e) => {
        // v17-qa: retirar más de lo que hay decía "Monto inválido."; ahora dice cuánto hay (como Depositar).
        if (!(val() > 0)) return toast('Escribí cuánto oro querés retirar.', 'err');
        if (val() > ctx.S.player.bank) return toast(ctx.S.player.bank ? `No tenés tanto en el banco: tenés ${num(ctx.S.player.bank)}.` : 'No tenés oro en el banco.', 'err');
        ctx.act(e.currentTarget, (g) => g.withdraw(val()), (r) => `Retiraste ${num(r.withdrawn)}`);
      } }, 'Retirar')));
}

/* ---------- Temporada ---------- */
const GLORY = { win: 'Ganar una caza', visit: 'Visitar una guarida', gift: 'Mandar un regalo', daily: 'Cobrar un objetivo del día', bonus: 'Bono de los 3 objetivos', mission: 'Cobrar una misión', prey: 'Derrotar a tu presa', faction: 'Ganar la guerra de facciones' };
export function rewardText(r) { // v17: también la usa la tarjeta del pase de Inicio
  if (r.type === 'gold') return { ico: 'coin', txt: num(r.amount), cls: 'gold' };
  if (r.type === 'xp') return { ico: 'star', txt: `${num(r.amount)} XP`, cls: 'xp' };
  if (r.type === 'renown') return { ico: 'crown', txt: `${num(r.amount)}`, cls: 'renown' };
  if (r.type === 'chest') return { ico: 'star', txt: `Cofre: ${num(r.gold)} oro`, cls: 'gold' };
  return { ico: 'guarida', txt: ITEM[r.id].name, cls: 'item' };
}

function seasonView(ctx) {
  const s = ctx.game.season();
  if (!s.ok) return null;
  const into = s.glory - s.reached * s.gloryPerTier;
  const claimable = s.list.filter((t) => t.unlocked && !t.claimed).length;
  const tiles = s.list.map((t) => {
    const rw = rewardText(t.reward);
    const state = t.claimed ? 'claimed' : t.unlocked ? 'ready' : 'locked';
    return h(`button.tier.${state}.${rw.cls}`, { type: 'button', disabled: state !== 'ready', 'aria-label': `Escalón ${t.tier}: ${rw.txt}${state === 'claimed' ? ', cobrado' : state === 'locked' ? ', bloqueado' : ', listo para cobrar'}`,
      onclick: (e) => ctx.act(e.currentTarget, (g) => g.claimSeasonTier(t.tier), () => `Escalón ${t.tier}: ${rw.txt}`) },
      h('span.tier-n.tnum', t.tier), icon(rw.ico, 18), h('span.tier-r', rw.txt));
  });
  return h('div.stack',
    h('section.card.season',
      h('div.sec-head', h('h2.display', 'Pase de temporada'), h('span.muted', 'Termina en ', h('strong.tnum', clock(s.endsAt - ctx.S.now).replace(/^(\d+):(\d+):\d+$/, (_, hh, mm) => (hh >= 24 ? `${Math.floor(hh / 24)} d ${hh % 24} h` : `${hh} h ${mm} min`))))),
      h('div.season-prog',
        h('strong.display.tnum', `${s.reached}/${s.tiers}`),
        h('div.g-info', h('div.m-track', h('span', { style: { transform: `scaleX(${s.reached >= s.tiers ? 1 : into / s.gloryPerTier})` } })),
          h('span.muted.tnum', s.reached >= s.tiers ? `Pase completo · cofres extra ${s.extraReached}/${s.extraTiers} (uno cada ${num(s.gloryPerExtra)} de Gloria)` : `${num(into)} / ${num(s.gloryPerTier)} de Gloria para el escalón ${s.reached + 1}`))),
      claimable ? h('p.note', `Tenés ${claimable} ${claimable > 1 ? 'escalones' : 'escalón'} para cobrar.`) : null,
      s.boost > 1 ? h('p.note', `Gloria ×${s.boost} hasta alcanzar el escalón ${s.expected}: te ponés al día con la temporada.`) : null,
      h('div.tier-grid', tiles)),
    h('section.card',
      h('h2.display', 'Cómo ganar Gloria'),
      h('ul.facts-list', Object.entries(CFG.season.glory).map(([k, v]) => h('li', h('span', GLORY[k] ?? k), h('strong.tnum', `+${v}`))))));
}
