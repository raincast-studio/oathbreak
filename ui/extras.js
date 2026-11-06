// 31/10 (plan de la revisión experta): próxima acción, escudo de novato visible, "Mientras no estabas", ceremonia de
// evolución, PWA con avisos e invitaciones. Solo presenta lo que dice la fachada; no duplica reglas.
import { h, icon, num, clock, toast, openSheet, closeSheet, sprite, spriteSrc, stageOf, reduced, $, burst } from './kit.js';
import { sfx } from './audio.js';
import { CFG } from '../src/game.js';
import { claimMission } from './tabs/misiones.js';
import { emit } from './telemetry-sink.js';

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
  if (installState() !== 'installed' && LS.get('oathbreak.installNo') !== '1') return card('star', 'Instalá el juego en tu celular', `${wait}. Instalado se abre como una app y te avisa.`, 'Instalar', () => install());
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
export function awaySummary(ctx, force = 0) {
  const { S, game, go } = ctx;
  const last = force ? S.now - force : Number(LS.get(SEEN)) || 0; // force: ms simulados (herramientas de prueba)
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
  // v15: solo si pasó algo que importa (ataques, misión cumplida o regalos); energía llena o solicitudes solas no alcanzan.
  if (!force && !(def.length || p.mission?.done || (fr.ok && fr.giftbox.length))) return;
  if (!lines.length) { if (force) toast('No pasó nada en ese lapso.'); return; }
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
export function checkEvolution(S, game) {
  const p = S.player;
  const u = game.uiState();
  const st = stageOf(p.level), seen = Number(u.ok && u.ui.stageSeen) || Number(LS.get(STAGE_SEEN)) || 0; // v15: en la partida
  if (!seen) { game.setUi('stageSeen', st); return; }
  if (st <= seen || document.querySelector('.hunt-layer, .evo-layer, .onb')) return;
  game.setUi('stageSeen', st);
  const prev = document.activeElement;
  const el = h('div.evo-layer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '¡Evolucionaste!' },
    h('div.evo',
      h('p.kick.gold', `NIVEL ${p.level} · ETAPA ${st} DE 10`),
      h('h1.display.evo-title', '¡Evolucionaste!'),
      h('div.evo-stage', h('span.evo-rays', { 'aria-hidden': 'true' }),
        h('span.evo-old', sprite(p.faction, '', Math.max(1, levelOfStage(seen)))), h('span.evo-new', sprite(p.faction, '', p.level))),
      p.shield?.mode === 'partial' ? h('p.note', `Tu escudo de novato empieza a retirarse: en este nivel te pueden atacar como máximo ${p.shield.perDay} ${p.shield.perDay === 1 ? 'vez' : 'veces'} por día, y una más por cada nivel, hasta quedar sin escudo en el Nv ${p.shield.untilLevel}. Guardá oro en el banco o la Bóveda.`) : null,
      nextStageHint(p.level),
      h('div.row.evo-actions',
        h('button.btn.ghost', { type: 'button', onclick: (e) => shareEvolution(p, st, e.currentTarget) }, 'Compartir'),
        h('button.btn.gold', { type: 'button', onclick: () => closeEvo(el, prev) }, 'Continuar'))));
  // v15.1: Esc cierra (escucha en el documento: al compartir, el botón se deshabilita y el foco sale del diálogo).
  el._esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeEvo(el, prev); } };
  document.addEventListener('keydown', el._esc);
  document.body.append(el);
  $('#app').inert = true;
  requestAnimationFrame(() => el.classList.add('in'));
  el.querySelector('button')?.focus({ preventScroll: true });
  // v17: fanfarria sincronizada con la animación (impacto a los 0,92 s, cuando aparece la etapa nueva) + chispas.
  sfx('evolve');
  setTimeout(() => { const s = el.querySelector('.evo-stage')?.getBoundingClientRect(); if (s) burst(s.left + s.width / 2, s.top + s.height * 0.45, { n: 18, cls: '.gold', spread: 150 }); }, 920);
}
// v15: tarjeta de 1080×1350 con el personaje nuevo para compartir (o descargar si el navegador no comparte archivos).
async function shareEvolution(p, st, btn) {
  btn.disabled = true;
  try {
    const W = 1080, H = 1350, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const hero = p.faction === 'hero', acc = hero ? '#FFC93C' : '#E2364B';
    const bg = g.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.42, W * 0.8);
    bg.addColorStop(0, hero ? '#4A3A12' : '#4A1424'); bg.addColorStop(1, '#0E0A1C');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H * 0.47); g.globalAlpha = 0.18; g.fillStyle = acc;
    for (let i = 0; i < 18; i++) { g.rotate(Math.PI / 9); g.fillRect(-14, 0, 28, 560); } g.restore();
    const img = new Image(); img.src = spriteSrc(p.faction, p.level);
    await img.decode();
    const ih = 760, iw = (img.width / img.height) * ih;
    g.drawImage(img, (W - iw) / 2, H * 0.47 - ih / 2 + 40, iw, ih);
    try { await document.fonts.load('80px "Lilita One"'); } catch { /* fuente del sistema */ }
    g.textAlign = 'center';
    g.fillStyle = acc; g.font = '900 40px Nunito, system-ui, sans-serif'; g.fillText(`NIVEL ${p.level} · ETAPA ${st} DE 10`, W / 2, 120);
    g.fillStyle = '#F4EEFF'; g.font = '96px "Lilita One", system-ui, sans-serif'; g.fillText(`¡${p.name} evolucionó!`, W / 2, 230, W - 80);
    g.fillStyle = acc; g.font = '72px "Lilita One", system-ui, sans-serif'; g.fillText('OATHBREAK', W / 2, H - 120);
    g.fillStyle = '#B4A7D6'; g.font = '800 34px Nunito, system-ui, sans-serif'; g.fillText(hero ? 'Héroes contra Villanos' : 'Villanos contra Héroes', W / 2, H - 66);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const file = new File([blob], `oathbreak-etapa-${st}.png`, { type: 'image/png' });
    const text = `¡${p.name} llegó a la etapa ${st} en OATHBREAK! ${GAME_URL}?ref=${myCode()}`;
    emit('invite_share', { via: 'evolution' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    const href = URL.createObjectURL(blob);
    const a = h('a', { href, download: file.name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000); // v15.1: no dejar la imagen de 1080×1350 en memoria
    toast('Imagen descargada: compartila donde quieras', 'ok');
  } catch (e) { if (e?.name !== 'AbortError') toast('No se pudo armar la imagen', 'err'); }
  finally { btn.disabled = false; if (btn.isConnected && document.activeElement === document.body) btn.focus({ preventScroll: true }); }
}
// v15.1: devuelve el foco a donde estaba (antes quedaba en <body> y el lector de pantalla perdía el lugar).
function closeEvo(el, prev) { document.removeEventListener('keydown', el._esc); $('#app').inert = false; el.remove(); (prev?.isConnected && prev !== document.body ? prev : $('#main'))?.focus({ preventScroll: true }); }
const STAGE_LEVELS = [1, 5, 10, 15, 25, 32, 40, 60, 80, 100];
const levelOfStage = (st) => STAGE_LEVELS[Math.max(0, st - 1)];
function nextStageHint(level) {
  const nx = STAGE_LEVELS.find((l) => l > level);
  return nx ? h('p.muted', `Próxima evolución en el nivel ${nx}.`) : h('p.muted', 'Llegaste a la última etapa.');
}

/* ---------- PWA: instalación y avisos ---------- */
// v15.1: se registra una sola vez (antes, "Reiniciar desde el onboarding" sumaba listeners y otro setInterval) y solo se
// recarga cuando el jugador tocó "Actualizar" (antes, la primera instalación del service worker —clients.claim()—
// disparaba controllerchange y recargaba la página justo después de crear el personaje).
let pwaReady = false, wantReload = false;
export function registerPwa() {
  if (pwaReady) return;
  pwaReady = true;
  // Botón "Instalar": el navegador avisa que se puede instalar; guardamos el aviso para usarlo cuando el jugador toque.
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); if (!installEvt) emit('pwa_prompt'); installEvt = e; dispatchEvent(new Event('oath:installable')); });
  addEventListener('appinstalled', () => { installEvt = null; emit('app_installed'); toast('¡Listo! OATHBREAK quedó instalado.', 'ok'); });
  if (!('serviceWorker' in navigator) || !isSecureContext) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (w) => { if (w && navigator.serviceWorker.controller) updateBanner(w); };
    offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    // Revisar si hay versión nueva cada vez que se vuelve a la app (y cada hora); si quedó una esperando ("Más tarde"),
    // volver a ofrecerla.
    addEventListener('visibilitychange', () => { if (!document.hidden) { offer(reg.waiting); reg.update().catch(() => {}); } });
    setInterval(() => reg.update().catch(() => {}), 3_600_000);
    // Primera visita: la página cargó las fuentes antes de que existiera el service worker; se las pasamos para guardarlas.
    navigator.serviceWorker.ready.then((r) => r.active?.postMessage({ type: 'media',
      urls: performance.getEntriesByType('resource').map((x) => x.name).filter((u) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) }));
  }).catch(() => { /* el visor de artifacts no lo permite: el juego sigue igual */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (wantReload) { wantReload = false; location.reload(); } });
}
// Aviso de versión nueva (abajo, sobre las pestañas). "Actualizar" activa el service worker nuevo y recarga.
function updateBanner(worker) {
  if (document.querySelector('.update-bar')) return;
  const bar = h('div.update-bar', { role: 'status' }, icon('star', 18), h('span', 'Hay una versión nueva de OATHBREAK.'),
    h('button.btn.gold.small', { type: 'button', onclick: () => { wantReload = true; worker.postMessage('skipWaiting'); bar.remove(); } }, 'Actualizar'),
    h('button.icon-btn', { type: 'button', 'aria-label': 'Más tarde', onclick: () => bar.remove() }, icon('close', 18)));
  document.body.append(bar);
  sfx('notify');
}
let installEvt = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
// Estado para la interfaz: 'installed' | 'prompt' (botón nativo) | 'ios' (instrucciones) | 'manual' (menú del navegador).
export const installState = () => (standalone() ? 'installed' : installEvt ? 'prompt' : isIOS() ? 'ios' : 'manual');
export async function install() {
  emit('install_tap', { mode: installState() });
  if (installEvt) {
    const e = installEvt; installEvt = null;
    e.prompt();
    const r = await e.userChoice.catch(() => null);
    emit('install_result', { outcome: r?.outcome ?? 'error' });
    if (r?.outcome !== 'accepted') installEvt = e; // se puede volver a ofrecer
    return;
  }
  openSheet({ title: 'Instalar OATHBREAK', body: h('div.stack',
    isIOS() ? h('p', 'En Safari, tocá ', h('strong', 'Compartir'), ' (el cuadrado con la flecha) y después ', h('strong', '"Agregar a inicio"'), '.')
      : h('p', 'Abrí el menú del navegador (⋮) y elegí ', h('strong', '"Instalar app"'), ' o ', h('strong', '"Agregar a la pantalla de inicio"'), '.'),
    h('p.muted', 'Se abre como una app, sin barra del navegador, y te puede avisar cuando termine tu misión o te ataquen.'),
    h('button.btn.gold.wide', { type: 'button', onclick: () => closeSheet() }, 'Entendido')) });
}
// Botón listo para usar (o null si ya está instalado).
export const installButton = (cls = '.btn.gold.small') => (installState() === 'installed' ? null
  : h(`button${cls}`, { type: 'button', onclick: install }, 'Instalar'));
export const notifyState = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
export async function askNotify() {
  if (notifyState() !== 'default') return;
  const r = await Notification.requestPermission().catch(() => 'denied');
  emit('notify_ask', { result: r });
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
// v15.1: scheduleNotify se llama en cada refresh. Antes rearmaba todo cada vez: el sondeo de "Te atacaron" volvía a
// empezar sus 5 min con cada toque y, al primer sondeo, avisaba de un ataque viejo sin leer (lastDef arrancaba en 0).
// Ahora el sondeo es uno solo y los avisos de misión y energía se rearman solo si cambia su hora.
const timers = {};
let poll = 0, lastDef = null;
function arm(tag, ms, fn) {
  const at = Date.now() + ms, t = timers[tag];
  if (t && Math.abs(t.at - at) < 5_000) return;
  if (t) clearTimeout(t.id);
  timers[tag] = { at, id: setTimeout(() => { delete timers[tag]; fn(); }, ms) };
}
function disarm(tag) { if (timers[tag]) { clearTimeout(timers[tag].id); delete timers[tag]; } }
const lastDefense = (game) => {
  const ib = game.inbox();
  return (ib.ok ? ib.list : []).reduce((m, x) => (x.role === 'defender' ? Math.max(m, x.report.ts) : m), 0);
};
export function scheduleNotify(S, game) {
  if (notifyState() !== 'granted') { for (const k of Object.keys(timers)) disarm(k); return; }
  const p = S.player;
  if (p.mission && !p.mission.done) arm('mision', p.mission.msLeft + 1500, () => notify('Tu misión terminó', `${p.mission.name}: tu recompensa te espera.`, 'mision'));
  else disarm('mision');
  if (p.energy < p.energyMax) {
    arm('energia', p.energyFullMs + 1500, () => notify('Energía llena', 'Tenés toda la energía: salí a cazar.', 'energia'));
  } else disarm('energia');
  // "Te atacaron": cada 5 min, con la app en segundo plano, se consulta la fachada (los bots avanzan al consultar).
  // Solo avisa de ataques posteriores al momento en que se activaron los avisos.
  lastDef ??= lastDefense(game);
  if (!poll) poll = setInterval(() => {
    if (!document.hidden || notifyState() !== 'granted') return;
    const ib = game.inbox();
    const d = (ib.ok ? ib.list : []).find((x) => x.role === 'defender' && !x.read && x.report.ts > lastDef);
    if (d) { lastDef = d.report.ts; notify(d.report.winner === 'defender' ? 'Te atacaron y ganaste' : 'Te atacaron', `${d.report.attacker.name} te atacó. Mirá el informe.`, 'ataque'); }
  }, 5 * 60_000);
}
// Para los tests de interfaz: cuántos temporizadores de avisos hay vivos.
export const notifyTimers = () => ({ timeouts: Object.keys(timers).length, intervals: poll ? 1 : 0 });

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
    emit('invite_share', { via: 'share' });
    if (navigator.share) { try { await navigator.share({ title: 'OATHBREAK', text, url }); return; } catch { /* cancelado */ } }
    open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  // v15: versión compacta (una fila) dentro de Amigos; el botón abre WhatsApp o el menú de compartir del celular.
  return h('section.invite.compact',
    h('span.next-ico', icon('social', 20)),
    h('div.g-info', h('strong', 'Invitá a tus amigos'), h('span.muted', `Entran con +${CFG.referral.newGold} de oro y un ${CFG.referral.itemName}.`)),
    h('div.row.tight',
      h('a.btn.gold.small', { href: `https://wa.me/?text=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener', 'aria-label': 'Invitar por WhatsApp', onclick: () => emit('invite_share', { via: 'whatsapp' }) }, 'WhatsApp'),
      navigator.share ? h('button.btn.ghost.small', { type: 'button', onclick: share }, 'Más') : null));
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
