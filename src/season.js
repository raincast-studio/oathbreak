// Temporadas de 4 semanas con pase de Gloria: metas de largo plazo que se renuevan y no inflan el oro.
// La Gloria se gana jugando (cazar, visitar, regalar, objetivos) y desbloquea recompensas por escalón.
import { CFG } from './config.js';
import { dayKey } from './core.js';
import { missionReward } from './economy.js';
import { addXp } from './character.js';
import { grantItem } from './effects.js';

const SZ = () => CFG.season;

// Las temporadas empiezan un lunes (mismo ancla que las semanas).
export const seasonKey = (ts) => Math.floor((dayKey(ts) + 3) / (7 * SZ().weeks));
export const seasonEnds = (ts) => ((seasonKey(ts) + 1) * 7 * SZ().weeks - 3) * 86_400_000 - CFG.dayOffsetMs;

function ensure(e, now) {
  const k = seasonKey(now);
  if (e.season?.key !== k) e.season = { key: k, glory: 0, claimed: [] };
  return e.season;
}

export function addGlory(e, kind, now, n = 1) {
  if (e.isBot) return 0;
  const g = (SZ().glory[kind] ?? 0) * n;
  if (!g) return 0;
  ensure(e, now).glory += g;
  return g;
}

// Recompensa del escalón t (1..tiers): oro, renombre o un cosmético exclusivo en los hitos.
export function tierReward(t, level) {
  if (SZ().cosmetics[t]) return { type: 'item', id: SZ().cosmetics[t] };
  if (t % 3 === 0) return { type: 'renown', amount: SZ().renownPerTier };
  if (t % 3 === 1) return { type: 'gold', amount: missionReward(SZ().goldMissionMin, level).gold };
  return { type: 'xp', amount: missionReward(SZ().goldMissionMin, level).xp };
}

export function seasonStatus(e, now) {
  const k = seasonKey(now);
  const s = e.season?.key === k ? e.season : { key: k, glory: 0, claimed: [] };
  const reached = Math.min(SZ().tiers, Math.floor(s.glory / SZ().gloryPerTier));
  return {
    key: k, endsAt: seasonEnds(now), glory: s.glory, gloryPerTier: SZ().gloryPerTier, reached, tiers: SZ().tiers,
    list: Array.from({ length: SZ().tiers }, (_, i) => ({ tier: i + 1, reward: tierReward(i + 1, e.level), unlocked: i + 1 <= reached, claimed: s.claimed.includes(i + 1) })),
  };
}

export function claimTier(e, tier, now) {
  if (!Number.isInteger(tier) || tier < 1 || tier > SZ().tiers) return { ok: false, error: 'escalon_invalido' };
  const s = ensure(e, now);
  if (Math.floor(s.glory / SZ().gloryPerTier) < tier) return { ok: false, error: 'escalon_bloqueado' };
  if (s.claimed.includes(tier)) return { ok: false, error: 'ya_cobrado' };
  s.claimed.push(tier);
  const r = tierReward(tier, e.level);
  if (r.type === 'gold') e.gold += r.amount;
  else if (r.type === 'xp') addXp(e, r.amount);
  else if (r.type === 'renown') e.lair.renown += r.amount;
  else grantItem(e, r.id);
  return { ok: true, reward: r };
}
