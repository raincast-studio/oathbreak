// Guarida: edificios, Taller, salas, decoración modular, prestigio, tiendas, visitas, racha y escaparate.
import { CFG, HOUR, MIN, DAY } from './config.js';
import { dayKey, weekKey, mulberry32 } from './core.js';
import { ITEM, ITEMS, SETS, setPieces } from './catalog.js';
import { bLevel, bValue, grantItem } from './effects.js';
import { addGlory } from './season.js';
export { grantItem };
import { addXp, sync } from './character.js';
import { missionReward, hasKey, isInt } from './economy.js';
import { bump } from './objectives.js';
import { track } from './telemetry.js';

const L = () => CFG.lair;
const DEFAULT = { floor: 'piso_piedra', wall: 'pared_ladrillo' };

/* ---------- Edificios ---------- */
export const buildingPrice = (k, lvl) => Math.round(L().buildings[k].base * L().costGrowth ** (lvl - 1));

export function buildingInfo(e) {
  return Object.entries(L().buildings).map(([k, b]) => {
    const lvl = bLevel(e, k), next = lvl < 5 ? lvl + 1 : null;
    return {
      key: k, name: b.name, level: lvl, value: bValue(e, k),
      next: next && { level: next, value: b.values[next - 1], price: buildingPrice(k, next), req: L().reqLevel[next - 1] },
    };
  });
}

export function upgradeBuilding(e, k, now) {
  if (!hasKey(L().buildings, k)) return { ok: false, error: 'edificio_invalido' };
  const lvl = bLevel(e, k);
  if (lvl >= 5) return { ok: false, error: 'nivel_maximo' };
  const req = L().reqLevel[lvl];
  if (e.level < req) return { ok: false, error: 'nivel_insuficiente', req };
  const price = buildingPrice(k, lvl + 1);
  if (e.gold < price) return { ok: false, error: 'oro_insuficiente', price };
  syncWorkshop(e, now); // cierra la producción al ritmo viejo
  sync(e, now);         // HP/energía al ritmo viejo antes de cambiar enfermería/generador
  e.gold -= price;
  e.lair.buildings[k] = lvl + 1;
  if (k === 'taller' && e.lair.workshop.ts == null) e.lair.workshop.ts = now;
  syncWorkshop(e, now); // fija el ritmo nuevo
  return { ok: true, price, level: lvl + 1 };
}

/* ---------- Taller (producción pasiva + potenciador por visitas) ---------- */
export const workshopRate = (e) => (bValue(e, 'taller') ?? 0) * missionReward(60, e.level).gold; // oro/h

const activeBoosts = (e, now) => e.lair.boosts.filter((end) => end > now).length;

// Producción acumulada proyectada a `now` sin modificar nada (la usan las consultas).
// Usa el ritmo vigente al último sync para el tramo transcurrido: no paga retroactivo al subir de nivel.
export function projectWorkshop(e, now) {
  const w = e.lair.workshop;
  if (!bLevel(e, 'taller') || w.ts == null || now <= w.ts) return w.stored;
  const rate = w.rate ?? workshopRate(e);
  const dtH = (now - w.ts) / HOUR;
  let boostH = 0;
  for (const end of e.lair.boosts) {
    const start = end - L().visit.hostBoostMin * MIN;
    boostH += Math.max(0, Math.min(end, now) - Math.max(start, w.ts)) / HOUR;
  }
  return Math.min(rate * L().workshopCapH, w.stored + rate * (dtH + L().visit.hostBoostPct * boostH));
}

export function syncWorkshop(e, now) {
  const w = e.lair.workshop;
  if (bLevel(e, 'taller') && w.ts != null && now > w.ts) { w.stored = projectWorkshop(e, now); w.ts = now; }
  if (bLevel(e, 'taller')) w.rate = workshopRate(e);
  e.lair.boosts = e.lair.boosts.filter((end) => end > now);
}

export function claimWorkshop(world, e, now) {
  if (!bLevel(e, 'taller')) return { ok: false, error: 'sin_taller' };
  syncWorkshop(e, now);
  const gold = Math.floor(e.lair.workshop.stored);
  if (gold <= 0) return { ok: false, error: 'taller_vacio' };
  e.lair.workshop.stored -= gold;
  e.gold += gold;
  bump(world, e, 'workshop', now);
  return { ok: true, gold };
}

export function workshopInfo(e, now) {
  return {
    level: bLevel(e, 'taller'), ratePerH: Math.round(workshopRate(e)),
    stored: Math.floor(projectWorkshop(e, now)), cap: Math.round(workshopRate(e) * L().workshopCapH),
    boostPct: activeBoosts(e, now) * L().visit.hostBoostPct * 100,
  };
}

/* ---------- Salas ---------- */
export function buyRoom(e) {
  const n = e.lair.rooms.length;
  if (n >= L().room.max) return { ok: false, error: 'salas_maximas' };
  const u = L().room.unlock[n];
  if (e.level < u.lvl) return { ok: false, error: 'nivel_insuficiente', req: u.lvl };
  if (e.gold < u.price) return { ok: false, error: 'oro_insuficiente', price: u.price };
  e.gold -= u.price;
  e.lair.rooms.push({ floor: null, wall: null });
  return { ok: true, price: u.price, rooms: e.lair.rooms.length };
}

/* ---------- Ítems y tiendas ---------- */
export const itemPrice = (it) => L().rarity[it.rarity].price;
export const recycleValue = (it) => (it.buyable ? Math.floor(itemPrice(it) * L().recyclePct) : 0);
const canUse = (e, it) => !it.faction || it.faction === e.faction;

// Tienda de oro: básicos fijos + 6 rotativos por día (semilla mundo + día + facción), ponderados por rareza.
export function dailyShop(world, e, now) {
  const basics = ITEMS.filter((i) => i.basic && canUse(e, i));
  const pool = ITEMS.filter((i) => i.buyable && !i.basic && canUse(e, i));
  const rng = mulberry32((world.seed ^ Math.imul(dayKey(now), 0x9e3779b1) ^ (e.faction === 'hero' ? 1 : 2)) >>> 0);
  // Cada casilla rotativa: primero la rareza con probabilidades fijas (shopOdds), después un objeto de esa rareza.
  // Así la chance no depende de cuántos objetos hay de cada rareza en el catálogo.
  const picks = [];
  const bag = pool.slice();
  while (picks.length < L().shopSlots && bag.length) {
    const avail = Object.entries(L().shopOdds).filter(([r]) => bag.some((i) => i.rarity === r));
    let r = rng() * avail.reduce((a, [, w]) => a + w, 0);
    const rarity = (avail.find(([, w]) => (r -= w) < 0) ?? avail[avail.length - 1])[0];
    const same = bag.filter((i) => i.rarity === rarity);
    const it = same[Math.floor(rng() * same.length)];
    picks.push(bag.splice(bag.indexOf(it), 1)[0]);
  }
  const view = (i, rotating) => ({ ...i, price: itemPrice(i), prestige: L().rarity[i.rarity].prestige, rotating });
  return [...basics.map((i) => view(i, false)), ...picks.map((i) => view(i, true))];
}

export function buyItem(world, e, id, now) {
  const it = dailyShop(world, e, now).find((i) => i.id === id);
  if (!it) return { ok: false, error: 'no_disponible_hoy' };
  if (e.gold < it.price) return { ok: false, error: 'oro_insuficiente', price: it.price };
  e.gold -= it.price;
  return { ok: true, price: it.price, uid: grantItem(e, id) };
}

// Tienda de renombre: el renombre (socializar) compra decoración exclusiva.
export const renownShop = () => ITEMS.filter((i) => i.renown).map((i) => ({ ...i, prestige: L().rarity[i.rarity].prestige }));

export function buyRenownItem(e, id) {
  const it = hasKey(ITEM, id) && ITEM[id];
  if (!it || !it.renown) return { ok: false, error: 'item_invalido' };
  if (e.lair.renown < it.renown) return { ok: false, error: 'renombre_insuficiente', price: it.renown };
  e.lair.renown -= it.renown;
  return { ok: true, renown: it.renown, uid: grantItem(e, id) };
}

// Regalos: no se venden hasta pasados N días desde que llegaron, y valen poco (para que regalar no sea una fuente de oro).
export const giftSellableAt = (inv) => (inv.giftTs ?? 0) + CFG.social.giftSellDays * DAY;
export const sellValue = (inv, now) => (inv.gifted ? (now != null && now >= giftSellableAt(inv) ? CFG.social.giftSellGold : 0) : recycleValue(ITEM[inv.id]));

export function recycleItem(e, uid, now) {
  const i = e.lair.inventory.findIndex((x) => x.uid === uid);
  if (i < 0) return { ok: false, error: 'item_no_en_inventario' };
  const inv = e.lair.inventory[i], it = ITEM[inv.id];
  if (!it.buyable) return { ok: false, error: 'no_reciclable' };
  if (inv.gifted && !(now >= giftSellableAt(inv))) return { ok: false, error: 'no_reciclable', sellableAt: giftSellableAt(inv) };
  const gold = sellValue(inv, now);
  e.lair.inventory.splice(i, 1);
  e.gold += gold;
  return { ok: true, gold };
}

/* ---------- Colocación en grilla ---------- */
const footprint = (it, rot) => (rot % 2 ? [it.size[1], it.size[0]] : it.size);
const cells = (p) => {
  const [w, h] = footprint(ITEM[p.id], p.rot);
  const out = [];
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) out.push(`${p.x + dx},${p.y + dy}`);
  return out;
};

export function placeItem(e, uid, room, x, y, rot = 0) {
  if (!isInt(room, 0, L().room.max - 1) || !isInt(x, 0, L().room.w - 1) || !isInt(y, 0, L().room.h - 1) || !isInt(rot, 0, 3))
    return { ok: false, error: 'posicion_invalida' };
  const inv = e.lair.inventory.find((i) => i.uid === uid);
  if (!inv) return { ok: false, error: 'item_no_en_inventario' };
  const it = ITEM[inv.id];
  if (!e.lair.rooms[room]) return { ok: false, error: 'sala_invalida' };

  // Piso y pared se aplican a la sala; el anterior (si no era el de fábrica) vuelve al inventario.
  if (it.cat === 'piso' || it.cat === 'pared') {
    const key = it.cat === 'piso' ? 'floor' : 'wall';
    const prev = e.lair.rooms[room][key];
    e.lair.rooms[room][key] = it.id;
    e.lair.inventory = e.lair.inventory.filter((i) => i.uid !== uid);
    if (prev) grantItem(e, prev);
    return { ok: true, applied: key };
  }

  const cand = { uid, id: inv.id, room, x, y, rot, ...(inv.gifted && { gifted: true, giftTs: inv.giftTs ?? 0 }) }; // un regalo sigue siendo regalo
  const [w, h] = footprint(it, rot);
  if (x + w > L().room.w || y + h > L().room.h) return { ok: false, error: 'fuera_de_sala' };

  const here = e.lair.placed.filter((p) => p.room === room);
  const floorOcc = new Map(), topOcc = new Set();
  for (const p of here) for (const c of cells(p)) (p.on ? topOcc.add(c) : floorOcc.set(c, p));
  const mine = cells(cand);

  if (mine.every((c) => !floorOcc.has(c))) {
    e.lair.placed.push(cand);
  } else if (it.small && mine.length === 1 && ITEM[floorOcc.get(mine[0]).id].surface && !topOcc.has(mine[0])) {
    cand.on = floorOcc.get(mine[0]).uid; // apilado sobre una superficie
    e.lair.placed.push(cand);
  } else return { ok: false, error: 'casilla_ocupada' };

  e.lair.inventory = e.lair.inventory.filter((i) => i.uid !== uid);
  return { ok: true, stacked: !!cand.on };
}

export function removeItem(e, uid) {
  const p = e.lair.placed.find((x) => x.uid === uid);
  if (!p) return { ok: false, error: 'item_no_colocado' };
  const ids = [uid, ...e.lair.placed.filter((x) => x.on === uid).map((x) => x.uid)]; // lo apilado baja también
  for (const id of ids) {
    const q = e.lair.placed.find((x) => x.uid === id);
    e.lair.inventory.push({ uid: q.uid, id: q.id, ...(q.gifted && { gifted: true, giftTs: q.giftTs ?? 0 }) });
  }
  e.lair.placed = e.lair.placed.filter((x) => !ids.includes(x.uid));
  return { ok: true, removed: ids.length };
}

// Primera posición libre (ayuda para el debug y los bots).
export function autoPlace(e, uid) {
  const inv = e.lair.inventory.find((i) => i.uid === uid);
  if (!inv) return { ok: false, error: 'item_no_en_inventario' };
  const it = ITEM[inv.id];
  if (it.cat === 'piso' || it.cat === 'pared') return { ...placeItem(e, uid, 0, 0, 0), room: 0 };
  for (let room = 0; room < e.lair.rooms.length; room++)
    for (let y = 0; y < L().room.h; y++)
      for (let x = 0; x < L().room.w; x++)
        for (const rot of [0, 1]) {
          const r = placeItem(e, uid, room, x, y, rot);
          if (r.ok) return { ...r, room, x, y, rot };
        }
  return { ok: false, error: 'sin_espacio' };
}

/* ---------- Prestigio y sets ---------- */
function shownIds(e) {
  const ids = e.lair.placed.map((p) => p.id);
  for (const r of e.lair.rooms) { if (r.floor) ids.push(r.floor); if (r.wall) ids.push(r.wall); }
  return ids;
}

// El prestigio se recalcula solo cuando cambia la decoración (caché por guarida, fuera del guardado).
const PRESTIGE_CACHE = new WeakMap();
const decorKey = (e) => `${e.lair.placed.length}|${e.lair.seq}|${e.lair.rooms.map((r) => `${r.floor},${r.wall}`).join(';')}|${e.lair.placed.map((p) => p.uid).join(',')}`;

export function prestige(e) {
  const key = decorKey(e);
  const hit = PRESTIGE_CACHE.get(e.lair);
  if (hit?.key === key) return hit.value;
  const value = computePrestige(e);
  PRESTIGE_CACHE.set(e.lair, { key, value });
  return value;
}

function computePrestige(e) {
  const ids = shownIds(e);
  const pts = (id) => L().rarity[ITEM[id].rarity].prestige;
  // Rendimiento decreciente por duplicados: llenar la sala de copias del mismo objeto no es una estrategia.
  const seen = {};
  let total = 0;
  for (const id of ids) { const k = (seen[id] = (seen[id] ?? 0) + 1); total += pts(id) * L().visit.dupFactor ** (k - 1); }
  total = Math.round(total);
  const sets = [];
  for (const [sid, s] of Object.entries(SETS)) {
    const pieces = setPieces(sid);
    if (pieces.every((p) => ids.includes(p.id))) {
      const bonus = Math.round(pieces.reduce((a, p) => a + pts(p.id), 0) * L().setBonus);
      total += bonus;
      sets.push({ id: sid, name: s.name, bonus });
    }
  }
  return { total, sets };
}

/* ---------- Visitas ---------- */
const resetDaily = (e, now) => {
  const d = dayKey(now), v = e.lair.visits;
  if (v.day !== d) Object.assign(v, { day: d, hosts: [], rewarded: 0, renown: 0 });
};

function bumpStreak(e, now) {
  const s = e.lair.streak, d = dayKey(now), w = weekKey(now);
  if (s.shieldWeek !== w) { s.shieldWeek = w; s.shields = L().visit.shieldsPerWeek; }
  if (s.lastDay === d) return [];
  if (s.lastDay === d - 1) s.count++;
  else if (s.lastDay === d - 2 && s.shields > 0) { s.shields--; s.count++; }
  else s.count = 1;
  s.lastDay = d;
  s.best = Math.max(s.best, s.count);
  const rewards = [];
  if (s.count === 7 && !e.lair.owned[L().visit.streak7Item]) { grantItem(e, L().visit.streak7Item); rewards.push(ITEM[L().visit.streak7Item].name); }
  if (s.count % 30 === 0) {
    const pool = ITEMS.filter((i) => i.buyable && i.rarity === L().visit.streak30Rarity && canUse(e, i));
    const it = pool[Math.floor(mulberry32(d + s.count)() * pool.length)];
    grantItem(e, it.id); rewards.push(it.name);
  }
  return rewards;
}

const applauseOf = (e, week) => (e.lair.applause.week === week ? e.lair.applause.voters.length : 0);

export function visit(world, v, h, now, { applaud = true } = {}) {
  if (v.id === h.id) return { ok: false, error: 'tu_propia_guarida' };
  resetDaily(v, now);
  const vs = v.lair.visits, cfg = L().visit;
  const repeat = vs.hosts.includes(h.id);
  const out = { ok: true, repeat, gold: 0, xp: 0, renown: 0, streakRewards: [], levels: 0, lair: lairSnapshot(h, now) };
  if (repeat) return out; // volver a ver sí; recompensas, una vez por anfitrión por día

  vs.hosts.push(h.id);
  const n = vs.hosts.length;
  if (n <= cfg.rewardedCap) {
    out.gold = missionReward(cfg.goldMissionMin, v.level).gold;
    out.xp = cfg.xp;
    syncWorkshop(v, now);
    v.gold += out.gold;
    out.levels = addXp(v, out.xp);
    vs.rewarded++;
  } else if (n <= cfg.renownCap) {
    out.renown = 1; v.lair.renown++; vs.renown++;
  }
  out.streakRewards = checkStreak(v, now);
  addGlory(v, 'visit', now);
  out.streak = v.lair.streak.count;
  bump(world, v, 'visit', now);
  track(world, v, 'visit', { host: h.isBot ? 'bot' : 'player', gold: out.gold, renown: out.renown, streak: out.streak }, now);

  // Anfitrión: propina de oro, renombre por visitante único, potenciador del Taller, libro y aplauso.
  syncWorkshop(h, now);
  out.hostTip = 0;
  // Antiabuso: las cuentas novatas visitan y ganan, pero no generan propina, renombre ni aplausos al anfitrión.
  if (!v.isBot && v.level < CFG.pvp.newbieLevel) {
    h.lair.guestbook.unshift({ id: v.id, name: v.name, faction: v.faction, lvl: v.level, ts: now, applause: false, tip: 0 });
    if (h.lair.guestbook.length > cfg.guestbookMax) h.lair.guestbook.length = cfg.guestbookMax;
    return out;
  }
  const d = dayKey(now);
  if (h.lair.tips.day !== d) h.lair.tips = { day: d, count: 0, renown: 0 };
  if (h.lair.tips.count < cfg.hostTipCap) {
    out.hostTip = Math.max(1, Math.round(missionReward(cfg.goldMissionMin, h.level).gold * cfg.hostTipPct));
    h.gold += out.hostTip; h.lair.tips.count++;
  }
  if (h.lair.tips.renown < cfg.hostRenownCap) { h.lair.renown++; h.lair.tips.renown++; }
  if (h.lair.boosts.filter((end) => end > now).length < cfg.hostBoostMax) h.lair.boosts.push(now + cfg.hostBoostMin * MIN);
  h.lair.guestbook.unshift({ id: v.id, name: v.name, faction: v.faction, lvl: v.level, ts: now, applause: applaud, tip: out.hostTip });
  if (h.lair.guestbook.length > cfg.guestbookMax) h.lair.guestbook.length = cfg.guestbookMax;
  if (applaud) {
    const w = weekKey(now);
    if (h.lair.applause.week !== w) h.lair.applause = { week: w, voters: [] };
    if (!h.lair.applause.voters.includes(v.id)) h.lair.applause.voters.push(v.id); // un aplauso por visitante por semana
  }
  return out;
}

// Lectura pura del estado de visitas del día (no reinicia nada).
export const todaysVisits = (e, now) => (e.lair.visits.day === dayKey(now) ? e.lair.visits : { hosts: [], rewarded: 0, renown: 0 });

export function visitStatus(e, now) {
  const v = todaysVisits(e, now), cfg = L().visit, s = e.lair.streak, d = dayKey(now);
  const tips = e.lair.tips.day === d ? e.lair.tips : { count: 0, renown: 0 };
  return {
    today: v.hosts.length, rewarded: v.rewarded, rewardedCap: cfg.rewardedCap, renownToday: v.renown, renownCap: cfg.renownCap - cfg.rewardedCap,
    streak: s.count, streakAlive: s.lastDay >= d - 1, streakToday: s.lastDay === d, shields: s.shields, renown: e.lair.renown,
    nextGold: v.hosts.length < cfg.rewardedCap ? missionReward(cfg.goldMissionMin, e.level).gold : 0,
    hostTipsToday: tips.count, hostTipCap: cfg.hostTipCap,
  };
}

// Vista pública (lo que ve un visitante): sin oro ni stats.
export function lairSnapshot(e, now) {
  const p = prestige(e);
  return {
    id: e.id, name: e.name, faction: e.faction, level: e.level,
    rooms: e.lair.rooms.map((r, i) => ({ floor: r.floor ?? DEFAULT.floor, wall: r.wall ?? DEFAULT.wall,
      items: e.lair.placed.filter((x) => x.room === i).map(({ id, x, y, rot, on }) => ({ id, x, y, rot, on: !!on })) })),
    buildings: { ...e.lair.buildings },
    prestige: p.total, sets: p.sets, applause: applauseOf(e, weekKey(now)),
    honors: e.lair.owned.marco_honor ? 1 : 0,
    guestbook: e.lair.guestbook.slice(0, 5).map(({ name, faction, ts, applause }) => ({ name, faction, ts, applause })),
  };
}

/* ---------- Escaparate (ranking semanal por facción y liga) ---------- */
const scoreOf = (e, week) => prestige(e).total + L().visit.applauseWeight * applauseOf(e, week);
// Ligas por nivel: un jugador nuevo compite con su camada, no con los más ricos.
export const leagueOf = (level) => [...L().leagues].reverse().find((l) => level >= l.min).id;

export function showcase(world, now, faction, week = weekKey(now), league) {
  return Object.values(world.entities)
    .filter((e) => (!faction || e.faction === faction) && (!league || leagueOf(e.level) === league))
    .map((e) => ({ id: e.id, name: e.name, faction: e.faction, level: e.level, league: leagueOf(e.level), prestige: prestige(e).total, applause: applauseOf(e, week), score: scoreOf(e, week) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

// Al empezar una semana nueva: premia al top 3 de cada facción y liga de la semana anterior, y a los miembros
// activos de la facción que más reputación sumó. Lo llama tickBots antes de procesar horas de la semana nueva.
export function settleShowcase(world, now) {
  const w = weekKey(now);
  if (world.showcaseWeek == null) { world.showcaseWeek = w; return null; }
  if (world.showcaseWeek >= w) return null;
  const prev = world.showcaseWeek;
  world.showcaseWeek = w;
  const winners = [];
  for (const f of ['hero', 'villain']) for (const lg of L().leagues) {
    for (const row of showcase(world, now, f, prev, lg.id).slice(0, L().visit.prize.top)) {
      const e = world.entities[row.id];
      e.lair.renown += L().visit.prize.renown;
      if (!e.lair.owned.marco_honor) grantItem(e, 'marco_honor');
      winners.push({ id: e.id, name: e.name, faction: f, league: lg.id, score: row.score });
    }
  }
  // Guerra de facciones: gana la facción con más victorias en la semana; premia a sus miembros con participación real.
  const score = { hero: 0, villain: 0 };
  for (const e of Object.values(world.entities)) if (e.repWeek?.week === prev) score[e.faction] += e.repWeek.count;
  const winFaction = score.hero === score.villain ? null : score.hero > score.villain ? 'hero' : 'villain';
  const rewarded = [];
  if (winFaction) for (const e of Object.values(world.entities)) {
    if (e.isBot || e.faction !== winFaction || !(e.repWeek?.week === prev && e.repWeek.count >= CFG.faction.minWins)) continue;
    e.lair.renown += CFG.faction.renown;
    addGlory(e, 'faction', now);
    if (!e.lair.owned.estandarte_victoria) grantItem(e, 'estandarte_victoria');
    rewarded.push(e.id);
  }
  world.lastPrize = { week: prev, winners, faction: { score, winner: winFaction, rewarded } };
  return world.lastPrize;
}

// Racha social del día: 3 visitas (y 1 regalo, si está activo). Idempotente: cuenta una vez por día.
export function checkStreak(e, now) {
  const v = todaysVisits(e, now);
  const giftOk = !L().visit.streakNeedsGift || (e.giftsSent?.day === dayKey(now) && e.giftsSent.to.length > 0);
  if (v.hosts.length < L().visit.streakMinVisits || !giftOk) return [];
  return bumpStreak(e, now);
}

/* ---------- Drops e hitos ---------- */
export function missionDrop(e, minutes, rng) {
  if (rng() >= L().dropChancePerHour * (minutes / 60)) return null;
  const pool = ITEMS.filter((i) => i.buyable && i.rarity === 'raro' && canUse(e, i));
  const it = pool[Math.floor(rng() * pool.length)];
  grantItem(e, it.id);
  return it.name;
}

export function pvpMilestone(e) {
  if (e.record.w >= L().pvpTrophyWins && !e.lair.owned.trofeo_campeon) { grantItem(e, 'trofeo_campeon'); return ITEM.trofeo_campeon.name; }
  return null;
}

/* ---------- Bots: guaridas generadas ---------- */
export function furnishBot(e, rng) {
  const lvlB = Math.min(5, Math.floor(e.level / 6));
  for (const k of Object.keys(L().buildings)) e.lair.buildings[k] = Math.max(e.lair.buildings[k], Math.min(lvlB, rng.int(0, 5)));
  const pool = ITEMS.filter((i) => canUse(e, i) && i.buyable);
  // Rareza acorde al nivel: los épicos/legendarios aparecen recién en niveles altos.
  const w = { comun: 60, raro: 30, epico: 8 * Math.min(1, e.level / 20), legendario: 2 * Math.min(1, e.level / 40) };
  const pick = () => {
    let r = rng() * pool.reduce((a, i) => a + w[i.rarity], 0);
    return pool.find((i) => (r -= w[i.rarity]) < 0) ?? pool[0];
  };
  const want = Math.min(14, 2 + Math.floor(e.level / 2)) - e.lair.placed.length;
  for (let i = 0; i < want; i++) autoPlace(e, grantItem(e, pick().id));
  e.lair.inventory = [];
}
