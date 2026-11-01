// 31/10 (plan de la revisión experta): próxima acción, escudo de novato visible, "Mientras no estabas", ceremonia de
// evolución, PWA con avisos e invitaciones. Solo presenta lo que dice la fachada; no duplica reglas.
import { h, icon, num, clock, toast, openSheet, closeSheet, sprite, stageOf, reduced, $ } from './kit.js';
import { CFG } from '../src/game.js';
import { claimMission } from './tabs/misiones.js';

const LS = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* nada */ } },
};

/* ---------- Escudo de novato (reemplaza la barra de VIDA decorativa) ---------- */
export function shieldChip(p) {
  const s = p.shield ?? { mode: 'none' };
  if (s.mode === 'full') return h('div.shield-chip.full', icon('shield', 16), h('span', `Escudo de novato: nadie te puede atacar hasta el Nv ${s.untilLevel}`));
  if (s.mode === 'partial') return h('div.shield-chip.partial', icon('shield', 16),
    h('span', `Escudo parcial: hoy te pueden atacar ${s.perDay} ${s.perDay === 1 ? 'vez' : 'veces'} como máximo (sube 1 por nivel hasta el Nv ${s.untilLevel})`));
  return null;
}

/* ---------- Próxima acción: una sola cosa concreta para hacer ahora ---------- */
export function nextAction(ctx) {
  const { S, game, go } = ctx;
  const p = S.player, m = p.mission;
  const card = (ico, title, sub, cta, onclick, cls = '') => h(`section.next${cls}`,
    h('span.next-ico', icon(ico, 22)),
    h('div.g-info', h('span.lbl', 'PRÓXIMO PASO'), h('strong', title), sub ? h('span.muted', sub) : null),
    cta ? h('button.btn.gold.small', { type: 'button', onclick }, cta) : null);

  if (m?.done) return card('misiones', 'Tu misión terminó', `${num(m.reward.gold)} oro y ${num(m.reward.xp)} XP esperándote`, 'Cobrar', (e) => claimMission(ctx, e.currentTarget), '.hot');
  const d = game.daily();
  const ready = d.ok && d.list.find((o) => o.done && !o.claimed);
  if (ready) return card('star', `Objetivo cumplido: ${ready.name}`, 'Cobrá la recompensa', 'Cobrar',
    (e) => ctx.act(e.currentTarget, (g) => g.claimDaily(ready.id), (r) => `+${num(r.gold)} oro · +${num(r.xp)} XP`), '.hot');
  // v14: el oro en mano se puede robar y quien no gasta pierde (revisión v13, N11): sugerir equipo o atributos.
  // Recién después de la primera pelea, o cuando no se puede cazar: la primera acción del juego es pelear.
  const canHunt = !m && p.energy >= 1;
  const spend = (p.record.w + p.record.l > 0 || !canHunt) ? spendHint(p, game) : null;
  if (spend) return card(spend.ico, spend.title, spend.sub, spend.cta, () => go('personaje', { intent: spend.intent }));
  if (!m && p.energy >= 1) {
    const tg = game.targets();
    const free = tg.ok ? tg.list.filter((t) => !t.block) : [];
    const prey = free.find((t) => t.prey);
    if (free.length) return card('arena', prey ? `Cazá a tu presa: ${prey.name}` : `Tenés ${p.energy} de energía`,
      prey ? 'Doble XP y bono de oro' : `${free.length} rivales disponibles en la Arena`, 'Ir a la Arena', () => go('arena'));
  }
  const lr = game.lair();
  if (lr.ok && lr.workshop.level && lr.workshop.stored >= Math.max(10, lr.workshop.cap * 0.5))
    return card('coin', `El Taller juntó ${num(lr.workshop.stored)} oro`, null, 'Cobrar', (e) => ctx.act(e.currentTarget, (g) => g.claimWorkshop(), (r) => `+${num(r.gold)} oro del Taller`));
  if (!m) return card('misiones', p.energy < 1 ? 'Sin energía: mandá a tu personaje a una misión' : 'Elegí una misión', 'Gana oro y XP mientras no estás', 'Elegir', () => go('misiones'));
  const vs = lr.ok ? lr.visits : null;
  if (vs && vs.rewarded < vs.rewardedCap) return card('guarida', 'Visitá guaridas mientras esperás', `${vs.rewarded}/${vs.rewardedCap} visitas con premio hoy`, 'Visitar', () => go('social'));
  const wait = p.energy < 1 ? `Recuperás energía en ${clock(p.nextEnergyMs)}` : `Tu misión termina en ${clock(m.msLeft)}`;
  return card('bell', 'Todo al día', wait, notifyState() === 'default' ? 'Avisame' : null, () => askNotify());
}

// Qué comprar con el oro en mano: primero una pieza de equipo que alcance, si no atributos (si alcanza para 2 puntos).
export function spendHint(p, game) {
  const sh = game.shop();
  const gear = sh.ok ? sh.items.filter((x) => !x.owned && x.req <= p.level && x.price <= p.gold).sort((a, b) => a.price - b.price)[0] : null;
  if (gear) return { ico: 'equipo', intent: 'equipo', cta: 'Equipar', title: 'Podés comprar equipo nuevo', sub: `Tenés ${num(p.gold)} de oro en mano, y el oro en mano se puede robar.` };
  const cheapest = Math.min(...Object.values(p.statCosts));
  if (p.gold >= cheapest * 2) return { ico: 'personaje', intent: 'atributos', cta: 'Mejorar', title: 'Mejorá tus atributos',
    sub: `Tenés ${num(p.gold)} de oro: alcanza para ${Math.floor(p.gold / cheapest) > 9 ? 'muchos puntos' : `${Math.floor(p.gold / cheapest)} puntos o más`}. Si no lo gastás, te lo pueden robar.` };
  return null;
}

/* ---------- "Mientras no estabas" ---------- */
const SEEN = 'oathbreak.lastSeen';
export function markSeen(now) { LS.set(SEEN, String(now)); }
export function awaySummary(ctx) {
  const { S, game, go } = ctx;
  const last = Number(LS.get(SEEN)) || 0;
  markSeen(S.now);
  if (!last || S.now - last < 30 * 60_000) return;
  const ib = game.inbox();
  const def = (ib.ok ? ib.list : []).filter((x) => x.role === 'defender' && x.report.ts > last);
  const won = def.filter((x) => x.report.winner === 'defender');
  const lost = def.length - won.length;
  const goldLost = def.reduce((a, x) => a + (x.report.winner === 'attacker' ? x.report.loot.gold : 0), 0);
  const bounty = won.reduce((a, x) => a + (x.report.loot.bounty ?? 0), 0);
  const p = S.player, fr = game.friends(), lr = game.lair();
  const lines = [];
  if (def.length) lines.push([def.length && lost ? 'arena' : 'shield', `Te atacaron ${def.length} ${def.length === 1 ? 'vez' : 'veces'}: ganaste ${won.length} y perdiste ${lost}`,
    [bounty ? `+${num(bounty)} oro de recompensa` : null, goldLost ? `−${num(goldLost)} oro robado` : null].filter(Boolean).join(' · ')]);
  if (p.mission?.done) lines.push(['misiones', 'Tu misión terminó', `${num(p.mission.reward.gold)} oro para cobrar`]);
  if (p.energy >= p.energyMax) lines.push(['bolt', 'Tu energía está llena', `${p.energy} ataques disponibles`]);
  if (lr.ok && lr.workshop.level && lr.workshop.stored > 0) lines.push(['coin', `El Taller juntó ${num(lr.workshop.stored)} oro`, null]);
  if (fr.ok && fr.giftbox.length) lines.push(['star', `${fr.giftbox.length} ${fr.giftbox.length === 1 ? 'regalo' : 'regalos'} sin abrir`, null]);
  if (fr.ok && fr.requests.length) lines.push(['social', `${fr.requests.length} ${fr.requests.length === 1 ? 'solicitud' : 'solicitudes'} de amistad`, null]);
  if (!lines.length) return;
  const away = S.now - last, hrs = Math.floor(away / 3_600_000);
  const goTo = (tab, intent) => () => { closeSheet(); go(tab, { intent }); };
  openSheet({ title: 'Mientras no estabas', body: h('div.stack',
    h('p.muted', hrs >= 24 ? `Pasaron ${Math.floor(hrs / 24)} ${hrs >= 48 ? 'días' : 'día'}.` : hrs ? `Pasaron ${hrs} h.` : 'Pasó un rato.'),
    h('ul.away', lines.map(([ico, t, sub]) => h('li', h('span.next-ico', icon(ico, 20)), h('div.g-info', h('strong', t), sub ? h('span.muted', sub) : null)))),
    h('div.row',
      lost && S.revenge ? h('button.btn.crimson', { type: 'button', onclick: goTo('arena', 'venganza') }, `Vengarte (${S.revenge})`) : null,
      p.mission?.done ? h('button.btn.gold', { type: 'button', onclick: goTo('misiones') }, 'Cobrar misión') : null,
      h('button.btn.ghost', { type: 'button', onclick: () => closeSheet() }, 'Seguir'))) });
}

/* ---------- Ceremonia de evolución (cambio de etapa del personaje) ---------- */
const STAGE_SEEN = 'oathbreak.stageSeen';
export function checkEvolution(S) {
  const p = S.player;
  const st = stageOf(p.level), seen = Number(LS.get(STAGE_SEEN)) || 0;
  if (!seen) { LS.set(STAGE_SEEN, String(st)); return; }
  if (st <= seen || document.querySelector('.hunt-layer, .evo-layer, .onb')) return;
  LS.set(STAGE_SEEN, String(st));
  const el = h('div.evo-layer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '¡Evolucionaste!' },
    h('div.evo',
      h('p.kick.gold', `NIVEL ${p.level} · ETAPA ${st} DE 10`),
      h('h1.display.evo-title', '¡Evolucionaste!'),
      h('div.evo-stage', h('span.evo-rays', { 'aria-hidden': 'true' }),
        h('span.evo-old', sprite(p.faction, '', Math.max(1, levelOfStage(seen)))), h('span.evo-new', sprite(p.faction, '', p.level))),
      p.shield?.mode === 'partial' ? h('p.note', `Tu escudo de novato empieza a retirarse: en este nivel te pueden atacar como máximo ${p.shield.perDay} ${p.shield.perDay === 1 ? 'vez' : 'veces'} por día, y una más por cada nivel, hasta quedar sin escudo en el Nv ${p.shield.untilLevel}. Guardá oro en el banco o la Bóveda.`) : null,
      nextStageHint(p.level),
      h('div.row', h('button.btn.gold.wide', { type: 'button', onclick: () => closeEvo(el) }, 'Continuar'))));
  document.body.append(el);
  $('#app').inert = true;
  requestAnimationFrame(() => el.classList.add('in'));
  el.querySelector('button')?.focus({ preventScroll: true });
}
function closeEvo(el) { $('#app').inert = false; el.remove(); }
const STAGE_LEVELS = [1, 5, 10, 15, 25, 32, 40, 60, 80, 100];
const levelOfStage = (st) => STAGE_LEVELS[Math.max(0, st - 1)];
function nextStageHint(level) {
  const nx = STAGE_LEVELS.find((l) => l > level);
  return nx ? h('p.muted', `Próxima evolución en el nivel ${nx}.`) : h('p.muted', 'Llegaste a la última etapa.');
}

/* ---------- PWA: instalación y avisos ---------- */
export function registerPwa() {
  if (!('serviceWorker' in navigator) || !isSecureContext) return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* el visor de artifacts no lo permite: el juego sigue igual */ });
}
export const notifyState = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
export async function askNotify() {
  if (notifyState() !== 'default') return;
  const r = await Notification.requestPermission().catch(() => 'denied');
  toast(r === 'granted' ? 'Listo: mientras el juego siga abierto o instalado en segundo plano, te avisamos cuando termine tu misión, se llene tu energía o te ataquen.' : 'Sin permiso para avisos. Lo podés activar desde el navegador.', r === 'granted' ? 'ok' : 'err');
}
async function notify(title, body, tag) {
  if (notifyState() !== 'granted' || !document.hidden) return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, { body, tag, icon: 'ui/img/icon-192.png', badge: 'ui/img/icon-192.png' });
    else new Notification(title, { body, tag });
  } catch { /* nada */ }
}
// Mientras la pestaña o la app instalada sigan vivas en segundo plano. Sin servidor (E6) no hay push con la app cerrada.
let timers = [], lastDef = 0;
export function scheduleNotify(S, game) {
  timers.forEach(clearTimeout); timers = [];
  if (notifyState() !== 'granted') return;
  const p = S.player;
  if (p.mission && !p.mission.done) timers.push(setTimeout(() => notify('Tu misión terminó', `${p.mission.name}: tu recompensa te espera.`, 'mision'), p.mission.msLeft + 1500));
  if (p.energy < p.energyMax) {
    const ms = p.nextEnergyMs + (p.energyMax - p.energy - 1) * (CFG.energy.regenMin * 60_000);
    timers.push(setTimeout(() => notify('Energía llena', 'Tenés toda la energía: salí a cazar.', 'energia'), ms + 1500));
  }
  // "Te atacaron": cada 5 min se consulta la fachada (los bots avanzan al consultar).
  timers.push(setInterval(() => {
    if (!document.hidden) return;
    const ib = game.inbox();
    const d = (ib.ok ? ib.list : []).find((x) => x.role === 'defender' && !x.read);
    if (d && d.report.ts > lastDef) { lastDef = d.report.ts; notify(d.report.winner === 'defender' ? 'Te atacaron y ganaste' : 'Te atacaron', `${d.report.attacker.name} te atacó. Mirá el informe.`, 'ataque'); }
  }, 5 * 60_000));
}

/* ---------- Invitar amigos ---------- */
const REF = 'oathbreak.ref';
const myCode = () => {
  let c = LS.get(REF);
  if (!c) { c = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join(''); LS.set(REF, c); }
  return c;
};
const GAME_URL = 'https://raincast-studio.github.io/oathbreak/';
export function inviteCard(ctx) {
  const p = ctx.S.player;
  const url = `${GAME_URL}?ref=${myCode()}`;
  const text = `Jugá OATHBREAK conmigo: ${p.faction === 'hero' ? 'Héroes' : 'Villanos'} contra ${p.faction === 'hero' ? 'Villanos' : 'Héroes'}, al estilo BiteFight. Entrando con este link arrancás con ${CFG.referral.newGold} de oro extra y un ${CFG.referral.itemName}: ${url}`;
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'OATHBREAK', text, url }); return; } catch { /* cancelado */ } }
    open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  return h('section.invite',
    h('span.next-ico', icon('social', 22)),
    h('div.g-info', h('strong', 'Invitá a tus amigos'), h('span.muted', `Entran con +${CFG.referral.newGold} de oro y un ${CFG.referral.itemName} exclusivo. Con amigos reales, las visitas, los regalos y las venganzas tienen otro sabor.`)),
    h('div.row.tight',
      h('a.btn.gold.small', { href: `https://wa.me/?text=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener' }, 'WhatsApp'),
      h('button.btn.ghost.small', { type: 'button', onclick: share }, 'Compartir')));
}
// Al crear el personaje: si llegó con ?ref=CODIGO, cobra el bono de bienvenida una vez.
export function claimRef(game, refresh) {
  let code = null;
  try { code = new URLSearchParams(location.search).get('ref'); } catch { /* nada */ }
  if (!code || code === LS.get(REF)) return;
  const r = game.welcomeBonus(code);
  if (r.ok) refresh?.();
  if (r.ok) toast(`¡Bienvenido! Te invitó un amigo: +${num(r.gold)} oro y un ${CFG.referral.itemName}`, 'prize');
  try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* nada */ }
}
