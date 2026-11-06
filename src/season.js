// Temporadas de 4 semanas con pase de Gloria: metas de largo plazo que se renuevan y no inflan el oro.
// La Gloria se gana jugando (cazar, visitar, regalar, objetivos) y desbloquea recompensas por escalón.
import { CFG } from './config.js';
import { dayKey, mulberry32 } from './core.js';
import { missionReward } from './economy.js';
import { addXp } from './character.js';
import { grantItem } from './effects.js';
import { ITEMS } from './catalog.js';

const SZ = () => CFG.season;

// Las temporadas empiezan un lunes (mismo ancla que las semanas).
export const seasonKey = (ts) => Math.floor((dayKey(ts) + 3) / (7 * SZ().weeks));
export const seasonEnds = (ts) => ((seasonKey(ts) + 1) * 7 * SZ().weeks - 3) * 86_400_000 - CFG.dayOffsetMs;

function ensure(e, now) {
  const k = seasonKey(now);
  if (e.season?.key !== k) e.season = { key: k, glory: 0, claimed: [] };
  return e.season;
}

// v17: escalón esperado para este momento de la temporada (catch-up).
export const seasonStart = (ts) => seasonEnds(ts) - 7 * SZ().weeks * 86_400_000;
export function expectedTier(now) {
  const len = 7 * SZ().weeks * 86_400_000;
  return Math.floor(SZ().tiers * (SZ().catchUp?.pace ?? 0) * Math.min(1, (now - seasonStart(now)) / len));
}
// ¿Recibe Gloria ×mult? Mientras esté por debajo del escalón esperado (no en los cofres extra).
export const catchUpOn = (glory, now) => !!SZ().catchUp && Math.floor(glory / SZ().gloryPerTier) < expectedTier(now);

export function addGlory(e, kind, now, n = 1) {
  if (e.isBot) return 0;
  let g = (SZ().glory[kind] ?? 0) * n;
  if (!g) return 0;
  const s = ensure(e, now);
  if (catchUpOn(s.glory, now)) g *= SZ().catchUp.mult;
  s.glory += g;
  return g;
}

// Cofres extra alcanzados: uno cada gloryPerExtra de Gloria después de completar los 30 escalones.
const extraReached = (glory) => Math.max(0, Math.min(SZ().extraTiers ?? 0, Math.floor((glory - SZ().tiers * SZ().gloryPerTier) / (SZ().gloryPerExtra ?? Infinity))));

// Decoración de la temporada (key) para una facción: piezas distintas del catálogo, sorteadas con la clave de la
// temporada (cada temporada trae otras). Se calcula una vez por temporada y facción.
const DECOR = new Map();
function seasonDecor(key, faction) {
  const k = `${key}|${faction}`;
  if (DECOR.has(k)) return DECOR.get(k);
  const r = mulberry32((Math.imul(key + 1, 0x9e3779b1) ^ (faction === 'villain' ? 0x5bd1e995 : 0)) >>> 0);
  const used = new Set(), out = {};
  for (let t = 1; t <= SZ().tiers; t++) {
    if ((SZ().plan ?? '')[t - 1] !== 'D') continue;
    const rar = (SZ().decorRarity.find(([upTo]) => t < upTo) ?? SZ().decorRarity.at(-1))[1];
    const pool = ITEMS.filter((i) => i.buyable && i.rarity === rar && (!i.faction || i.faction === faction) && !used.has(i.id));
    const it = pool[Math.floor(r() * pool.length)];
    if (it) { used.add(it.id); out[t] = it.id; }
  }
  if (DECOR.size > 32) DECOR.clear();
  DECOR.set(k, out);
  return out;
}

// Recompensa del escalón t (1..tiers): oro, XP, renombre, cofre, decoración o un cosmético exclusivo en los hitos.
// faction y key (temporada) eligen la decoración; sin ellos (o fuera del plan), el ciclo de 3 de antes.
export function tierReward(t, level, faction = 'hero', key = 0) {
  const gold = () => missionReward(SZ().goldMissionMin, level).gold;
  if (t > SZ().tiers) return { type: 'chest', gold: gold(), renown: SZ().renownPerTier }; // cofre extra
  if (SZ().cosmetics[t]) return { type: 'item', id: SZ().cosmetics[t] };
  const k = (SZ().plan ?? '')[t - 1] ?? (t % 3 === 0 ? 'R' : t % 3 === 1 ? 'G' : 'X');
  if (k === 'D') { const id = seasonDecor(key, faction)[t]; if (id) return { type: 'item', id, decor: true }; }
  if (k === 'R') return { type: 'renown', amount: SZ().renownPerTier };
  if (k === 'C') return { type: 'chest', gold: gold(), renown: SZ().renownPerTier };
  if (k === 'X') return { type: 'xp', amount: missionReward(SZ().goldMissionMin, level).xp };
  return { type: 'gold', amount: gold() };
}

export function seasonStatus(e, now) {
  const k = seasonKey(now);
  const s = e.season?.key === k ? e.season : { key: k, glory: 0, claimed: [] };
  const reached = Math.min(SZ().tiers, Math.floor(s.glory / SZ().gloryPerTier));
  const extra = extraReached(s.glory);
  const list = Array.from({ length: SZ().tiers + (reached >= SZ().tiers ? SZ().extraTiers ?? 0 : 0) }, (_, i) => {
    const t = i + 1, extraT = t > SZ().tiers;
    return { tier: t, extra: extraT, reward: tierReward(t, e.level, e.faction, k), unlocked: extraT ? t - SZ().tiers <= extra : t <= reached, claimed: s.claimed.includes(t) };
  });
  return {
    key: k, endsAt: seasonEnds(now), glory: s.glory, gloryPerTier: SZ().gloryPerTier, reached, tiers: SZ().tiers,
    extraReached: extra, extraTiers: SZ().extraTiers ?? 0, gloryPerExtra: SZ().gloryPerExtra,
    // v17: para la tarjeta de Inicio y el badge: cuántos hay para cobrar, el próximo premio y el catch-up.
    claimable: list.filter((x) => x.unlocked && !x.claimed).length,
    next: list.find((x) => !x.unlocked) ?? null,
    expected: expectedTier(now), boost: catchUpOn(s.glory, now) ? SZ().catchUp.mult : 1,
    list,
  };
}

export function claimTier(e, tier, now) {
  if (!Number.isInteger(tier) || tier < 1 || tier > SZ().tiers + (SZ().extraTiers ?? 0)) return { ok: false, error: 'escalon_invalido' };
  const s = ensure(e, now);
  const open = tier > SZ().tiers ? tier - SZ().tiers <= extraReached(s.glory) : Math.floor(s.glory / SZ().gloryPerTier) >= tier;
  if (!open) return { ok: false, error: 'escalon_bloqueado' };
  if (s.claimed.includes(tier)) return { ok: false, error: 'ya_cobrado' };
  s.claimed.push(tier);
  const r = tierReward(tier, e.level, e.faction, s.key);
  if (r.type === 'gold') e.gold += r.amount;
  else if (r.type === 'xp') addXp(e, r.amount);
  else if (r.type === 'renown') e.lair.renown += r.amount;
  else if (r.type === 'chest') { e.gold += r.gold; e.lair.renown += r.renown; }
  else grantItem(e, r.id);
  return { ok: true, reward: r };
}
