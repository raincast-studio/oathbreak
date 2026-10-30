// Objetivos diarios: 3 por día elegidos con semilla, recompensa por cada uno y bono por completar todos.
import { CFG } from './config.js';
import { dayKey, mulberry32 } from './core.js';
import { missionReward, hasKey } from './economy.js';
import { addXp } from './character.js';
import { track } from './telemetry.js';
import { addGlory } from './season.js';

// Objetivos del día: si no existen todavía, los calcula; solo los guarda si `store` (comandos).
function ensure(world, e, now, store = true) {
  const d = dayKey(now);
  if (e.daily?.day === d) return e.daily;
  let h = 2166136261; for (const ch of e.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); // FNV-1a del id: cada jugador tiene los suyos
  const rng = mulberry32((world.seed ^ Math.imul(d, 0x27d4eb2d) ^ h) >>> 0);
  const pool = CFG.daily.pool.slice();
  const picks = [];
  while (picks.length < CFG.daily.count) picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
  const fresh = { day: d, ids: picks, progress: Object.fromEntries(picks.map((id) => [id, 0])), claimed: [], bonus: false };
  if (store) e.daily = fresh;
  return fresh;
}

export function bump(world, e, type, now, n = 1) {
  if (e.isBot) return;
  const dl = ensure(world, e, now);
  if (hasKey(dl.progress, type)) dl.progress[type] += n;
}

export function dailyStatus(world, e, now, store = false) {
  const dl = ensure(world, e, now, store);
  const def = Object.fromEntries(CFG.daily.pool.map((o) => [o.id, o]));
  const r = missionReward(CFG.daily.rewardMissionMin, e.level);
  return {
    list: dl.ids.map((id) => ({ id, name: def[id].name, target: def[id].target, progress: Math.min(def[id].target, dl.progress[id]),
      done: dl.progress[id] >= def[id].target, claimed: dl.claimed.includes(id), reward: r })),
    bonus: { claimed: dl.bonus, gold: missionReward(CFG.daily.bonusMissionMin, e.level).gold, renown: CFG.daily.bonusRenown },
  };
}

export function claimDaily(world, e, id, now) {
  const st = dailyStatus(world, e, now, true);
  if (id === 'bonus') {
    if (st.bonus.claimed) return { ok: false, error: 'ya_cobrado' };
    if (!st.list.every((o) => o.claimed)) return { ok: false, error: 'objetivos_incompletos' };
    e.daily.bonus = true;
    e.gold += st.bonus.gold;
    e.lair.renown += st.bonus.renown;
    track(world, e, 'daily_bonus', {}, now);
    addGlory(e, 'bonus', now);
    return { ok: true, gold: st.bonus.gold, renown: st.bonus.renown };
  }
  const o = st.list.find((x) => x.id === id);
  if (!o) return { ok: false, error: 'objetivo_invalido' };
  if (o.claimed) return { ok: false, error: 'ya_cobrado' };
  if (!o.done) return { ok: false, error: 'objetivo_incompleto' };
  e.daily.claimed.push(id);
  e.gold += o.reward.gold;
  const levels = addXp(e, o.reward.xp);
  track(world, e, 'daily_claim', { id }, now);
  addGlory(e, 'daily', now);
  return { ok: true, gold: o.reward.gold, xp: o.reward.xp, levels };
}
