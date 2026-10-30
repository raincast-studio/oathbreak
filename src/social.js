// Amigos y regalos (Pet Society): regalar es gratis, el objeto lo crea el sistema y beneficia a los dos.
// Antiabuso: tope diario (enviados y recibidos), un regalo por amigo por día, y lo regalado se vende recién a los 3 días y barato.
import { CFG, DAY, HOUR } from './config.js';
import { dayKey, mulberry32 } from './core.js';
import { ITEMS } from './catalog.js';
import { grantItem } from './effects.js';
import { checkStreak } from './lair.js';
import { bump } from './objectives.js';
import { track } from './telemetry.js';
import { addGlory } from './season.js';

const G = () => CFG.social;

/* ---------- Solicitudes de amistad ----------
   e.friendReq = { in: [{id, name, faction, level, ts}], out: [{id, ts}] }. Una amistad existe solo cuando el otro acepta. */
const reqs = (e) => (e.friendReq ??= { in: [], out: [] });
const alive = (r, now) => now == null || now - r.ts < G().requestTtlDays * DAY;
// Lectura pura (sin vencidas) para las consultas.
export const pendingIn = (e, now) => (e.friendReq?.in ?? []).filter((r) => alive(r, now));
export const pendingOut = (e, now) => (e.friendReq?.out ?? []).filter((r) => alive(r, now));
function prune(e, now) { const q = reqs(e); q.in = q.in.filter((r) => alive(r, now)); q.out = q.out.filter((r) => alive(r, now)); }
function link(a, b) {
  for (const [x, y] of [[a, b], [b, a]]) { x.friends ??= []; if (!x.friends.includes(y.id)) x.friends.push(y.id); }
  for (const [x, y] of [[a, b], [b, a]]) { const q = reqs(x); q.in = q.in.filter((r) => r.id !== y.id); q.out = q.out.filter((r) => r.id !== y.id); }
}
const full = (e) => (e.friends ?? []).length >= G().maxFriends;

// Enviar solicitud. Si el otro ya te había mandado una, se aceptan las dos y quedan amigos.
export function addFriend(e, f, now = 0, world) {
  if (e.id === f.id) return { ok: false, error: 'no_podes_agregarte' };
  if ((e.friends ?? []).includes(f.id)) return { ok: false, error: 'ya_es_amigo' };
  prune(e, now); prune(f, now);
  if (reqs(e).in.some((r) => r.id === f.id)) return acceptFriend(e, f, now);
  if (reqs(e).out.some((r) => r.id === f.id)) return { ok: false, error: 'solicitud_enviada' };
  if (full(e)) return { ok: false, error: 'lista_llena' };
  if (reqs(e).out.length >= G().maxOutgoing) return { ok: false, error: 'demasiadas_solicitudes' };
  reqs(e).out.push({ id: f.id, ts: now });
  const entry = { id: e.id, name: e.name, faction: e.faction, level: e.level, ts: now };
  // Un bot decide con demora (1–6 h) y acepta el 70% de las veces; la decisión se fija con semilla al recibirla.
  if (f.isBot) {
    let h = 2166136261; for (const ch of `${e.id}>${f.id}|${now}|${world?.seed ?? 0}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const rng = mulberry32(h >>> 0), [lo, hi] = G().botReplyH;
    entry.replyAt = now + Math.round((lo + rng() * (hi - lo)) * HOUR);
    entry.accept = rng() < G().botAcceptChance;
  }
  reqs(f).in.push(entry);
  return { ok: true, pending: true };
}

export function acceptFriend(e, f, now = 0) {
  if (!reqs(e).in.some((r) => r.id === f.id && alive(r, now))) return { ok: false, error: 'sin_solicitud' };
  if (full(e) || full(f)) return { ok: false, error: 'lista_llena' };
  link(e, f);
  return { ok: true, friends: e.friends.length };
}

export function rejectFriend(e, id) {
  const q = reqs(e), n = q.in.length;
  q.in = q.in.filter((r) => r.id !== id);
  return q.in.length < n ? { ok: true } : { ok: false, error: 'sin_solicitud' };
}

export function cancelRequest(e, f) {
  const q = reqs(e), n = q.out.length;
  q.out = q.out.filter((r) => r.id !== f.id);
  if (f.friendReq) f.friendReq.in = f.friendReq.in.filter((r) => r.id !== e.id);
  return q.out.length < n ? { ok: true } : { ok: false, error: 'sin_solicitud' };
}

export function removeFriend(e, id, f) {
  const i = (e.friends ?? []).indexOf(id);
  if (i < 0) return { ok: false, error: 'no_es_amigo' };
  e.friends.splice(i, 1);
  if (f?.friends) f.friends = f.friends.filter((x) => x !== e.id); // la amistad se corta para los dos
  return { ok: true };
}

// Bots: contestan las solicitudes cuando llega su hora y, de vez en cuando, le mandan una a su jugador
// (más probable si lo visitaron). Así el jugador también recibe solicitudes para aceptar.
export function botFriendship(world, b, p, now, rng) {
  const q = reqs(b);
  for (const r of q.in.filter((x) => x.replyAt != null && x.replyAt <= now)) {
    const from = world.entities[r.id];
    q.in = q.in.filter((x) => x !== r);
    if (!from) continue;
    if (r.accept && alive(r, now) && !full(b) && !full(from)) link(b, from);
    else if (from.friendReq) from.friendReq.out = from.friendReq.out.filter((x) => x.id !== b.id);
  }
  const already = (b.friends ?? []).includes(p.id) || reqs(b).out.some((r) => r.id === p.id) || reqs(p).out.some((r) => r.id === b.id);
  const visited = p.lair.guestbook.some((g) => g.id === b.id);
  if (!already && !full(p) && rng() < G().botRequestChancePerHour * (visited ? 3 : 1)) {
    reqs(b).out.push({ id: p.id, ts: now });
    reqs(p).in.push({ id: b.id, name: b.name, faction: b.faction, level: b.level, ts: now });
  }
}

const sentToday = (e, now) => (e.giftsSent?.day === dayKey(now) ? e.giftsSent : { day: dayKey(now), to: [] });

export function giftStatus(e, now) {
  const s = sentToday(e, now);
  return { sentToday: s.to.length, cap: G().giftsPerDay, sentTo: s.to, pending: (e.giftbox ?? []).length };
}

// Regalo sorpresa chico: siempre común, de hasta 2 casillas, de la facción del que lo recibe.
function rollGift(world, from, to, now) {
  let h = 2166136261; // FNV-1a de los ids completos: cada par emisor→receptor da un regalo distinto
  for (const ch of `${from.id}>${to.id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rng = mulberry32((world.seed ^ Math.imul(dayKey(now), 2654435761) ^ h) >>> 0);
  const pool = ITEMS.filter((i) => i.buyable && i.rarity === 'comun' && (!i.faction || i.faction === to.faction) && i.cat !== 'piso' && i.cat !== 'pared'
    && i.size[0] * i.size[1] <= G().giftMaxCells);
  return pool[Math.floor(rng() * pool.length)];
}

export function sendGift(world, from, to, now) {
  if (from.id === to.id) return { ok: false, error: 'no_podes_regalarte' };
  if (!(from.friends ?? []).includes(to.id)) return { ok: false, error: 'no_es_amigo' };
  const s = sentToday(from, now);
  if (s.to.includes(to.id)) return { ok: false, error: 'ya_le_regalaste_hoy' };
  if (s.to.length >= G().giftsPerDay) return { ok: false, error: 'tope_de_regalos' };
  const d = dayKey(now);
  if (to.giftsIn?.day === d && to.giftsIn.count >= G().giftsReceivedPerDay) return { ok: false, error: 'buzon_lleno_hoy' };
  to.giftsIn = to.giftsIn?.day === d ? { day: d, count: to.giftsIn.count + 1 } : { day: d, count: 1 };
  from.giftsSent = { day: s.day, to: [...s.to, to.id] };
  const it = rollGift(world, from, to, now);
  to.giftbox ??= [];
  to.giftbox.push({ id: it.id, from: from.id, fromName: from.name, ts: now });
  if (to.giftbox.length > G().giftboxMax) to.giftbox.splice(0, to.giftbox.length - G().giftboxMax);
  bump(world, from, 'gift', now);
  addGlory(from, 'gift', now);
  track(world, from, 'gift_sent', { to: to.isBot ? 'bot' : 'player' }, now);
  // El que regala también gana: un poco de renombre (con tope por los regalos diarios).
  from.lair.renown += G().senderRenown;
  const streakRewards = checkStreak(from, now);
  return { ok: true, item: it.name, sentToday: from.giftsSent.to.length, streakRewards };
}

// Abrir regalos: pasan al inventario marcados como regalo (no se reciclan por oro).
export function openGifts(e) {
  const box = e.giftbox ?? [];
  if (!box.length) return { ok: false, error: 'sin_regalos' };
  const names = [];
  for (const g of box) { const uid = grantItem(e, g.id); Object.assign(e.lair.inventory.find((x) => x.uid === uid), { gifted: true, giftTs: g.ts ?? 0 }); names.push(g.id); }
  e.giftbox = [];
  return { ok: true, opened: names.length, items: names };
}
