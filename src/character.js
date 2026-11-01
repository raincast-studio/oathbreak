// Personaje: stats, HP, energía, XP, equipo. Funciones puras sobre la entidad (muta in place).
import { CFG, MIN } from './config.js';
import { createLair, energyMax, energyRegenMin } from './effects.js';
import { hasKey } from './economy.js';

export function createEntity({ id, name, faction, isBot = false, now }) {
  const stats = Object.fromEntries(CFG.stats.map((s) => [s, CFG.start.stat]));
  const e = {
    id, name, faction, isBot, createdAt: now,
    level: 1, xp: 0, stats,
    gear: {}, // slot -> tier
    gold: CFG.start.gold, bank: 0, rep: 0,
    hp: 0, hpTs: now,
    energy: CFG.energy.max, energyTs: now,
    mission: null,
    received: { day: -1, count: 0 },
    lastAttackOn: {}, // targetId -> ts (cooldown del atacante)
    record: { w: 0, l: 0 },
    lair: createLair(),
  };
  e.hp = maxHp(e);
  return e;
}

// Variante (atributo) de cada pieza: la elegida al comprar o la de fábrica (primera opción del slot).
export const gearOptions = (slot) => CFG.gear.slots[slot];
export const gearStatOf = (e, slot) => e.gearStat?.[slot] ?? gearOptions(slot)[0];
// Bonus que da un tier para su atributo ('*' = la mitad a todos, mínimo 1).
export const tierBonus = (t, stat) => (stat === '*' ? Math.max(1, Math.floor(t.bonus / 2)) : t.bonus);

export function gearBonus(e, stat) {
  let b = 0;
  for (const [slot, tier] of Object.entries(e.gear)) {
    const t = CFG.gear.tiers[tier - 1]?.tier === tier ? CFG.gear.tiers[tier - 1] : CFG.gear.tiers.find((x) => x.tier === tier);
    const target = gearStatOf(e, slot);
    if (target === stat || target === '*') b += tierBonus(t, target);
  }
  return b;
}

export const effStat = (e, s) => e.stats[s] + gearBonus(e, s);
export const effStats = (e) => Object.fromEntries(CFG.stats.map((s) => [s, effStat(e, s)]));
export const maxHp = (e) => CFG.hp.base + effStat(e, 'res') * CFG.hp.perRes;

// La vida no se arrastra entre combates (cada pelea arranca completa); se mantiene el campo para el informe.
export function syncHp(e, now) {
  e.hp = maxHp(e);
  e.hpTs = Math.max(e.hpTs, now);
}

export function syncEnergy(e, now) {
  const step = energyRegenMin(e) * MIN;
  const max = energyMax(e);
  if (e.energy >= max) { e.energyTs = now; return; }
  const ticks = Math.floor((now - e.energyTs) / step);
  if (ticks <= 0) return;
  e.energy = Math.min(max, e.energy + ticks);
  e.energyTs = e.energy >= max ? now : e.energyTs + ticks * step;
}

export const nextEnergyIn = (e, now) =>
  e.energy >= energyMax(e) ? 0 : energyRegenMin(e) * MIN - (now - e.energyTs);

export function sync(e, now) { syncHp(e, now); syncEnergy(e, now); }

// Devuelve niveles ganados. Subir de nivel cura completo.
export function addXp(e, amount) {
  e.xp += amount;
  let gained = 0;
  while (e.xp >= CFG.xpNeed(e.level)) {
    e.xp -= CFG.xpNeed(e.level);
    e.level++;
    gained++;
  }
  if (gained) e.hp = maxHp(e);
  return gained;
}

export const totalPoints = (e) => CFG.stats.reduce((a, k) => a + e.stats[k], 0);
// Multiplicador por atributo: el de arranque hasta statCostBlend[0] puntos, el normal desde statCostBlend[1], lineal en el medio.
export function statMul(total, s) {
  const [a, b] = CFG.statCostBlend ?? [0, 0], E = CFG.statCostMulEarly ?? CFG.statCostMul;
  const t = Math.min(1, Math.max(0, (total - a) / Math.max(1, b - a)));
  return E[s] + (CFG.statCostMul[s] - E[s]) * t;
}
const rawCost = (t, s) => Math.round(CFG.statCost(t) * statMul(t, s));
// v15: nunca más barato que el punto anterior (en la mezcla, Def y Res bajaban de 75 a 74 al pasar de 27 a 28 puntos).
export const statCost = (e, s) => { const t = totalPoints(e); return Math.max(rawCost(t, s), rawCost(t - 1, s)); };

export function buyStat(e, s) {
  if (!CFG.stats.includes(s)) return { ok: false, error: 'stat_invalido' };
  const cost = statCost(e, s);
  if (e.gold < cost) return { ok: false, error: 'oro_insuficiente', cost };
  e.gold -= cost;
  e.stats[s]++;
  e.hp = maxHp(e);
  return { ok: true, cost };
}

export const itemPrice = (t) => CFG.gear.priceK * t.tier ** 2 * t.req;

// Comprar el tier siguiente (o uno mayor) eligiendo su variante; con el mismo tier y otra variante, se reforja.
export function buyGear(e, slot, tier, stat) {
  if (!hasKey(CFG.gear.slots, slot)) return { ok: false, error: 'slot_invalido' };
  const t = Number.isInteger(tier) && CFG.gear.tiers.find((x) => x.tier === tier);
  if (!t) return { ok: false, error: 'tier_invalido' };
  const opts = gearOptions(slot);
  if (stat == null) stat = (e.gear[slot] ?? 0) >= tier ? gearStatOf(e, slot) : opts[0];
  if (!opts.includes(stat)) return { ok: false, error: 'variante_invalida' };
  if (e.level < t.req) return { ok: false, error: 'nivel_insuficiente', req: t.req };
  const cur = e.gear[slot] ?? 0;
  const reforge = cur === tier && stat !== gearStatOf(e, slot);
  if (cur >= tier && !reforge) return { ok: false, error: 'ya_equipado' };
  const price = reforge ? Math.round(itemPrice(t) * CFG.gear.reforgePct) : itemPrice(t);
  if (e.gold < price) return { ok: false, error: 'oro_insuficiente', price };
  e.gold -= price;
  e.gear[slot] = tier;
  e.gearStat = { ...(e.gearStat ?? {}), [slot]: stat };
  e.hp = maxHp(e);
  return { ok: true, price, reforge };
}

// Poder aproximado (para bots y sim; no se muestra al jugador).
// Poder = valor de combate ≈ atributos efectivos ponderados por su costo (el costo está calibrado al valor en combate).
export const power = (e) => Math.round(CFG.stats.reduce((a, s) => a + CFG.statCostMul[s] * effStat(e, s), 0) * 10) / 10;
