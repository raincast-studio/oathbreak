// Estado base de la guarida y efectos de edificios (sin dependencias cruzadas: lo usan character y systems).
import { CFG } from './config.js';

export function createLair() {
  return {
    buildings: Object.fromEntries(Object.keys(CFG.lair.buildings).map((k) => [k, 0])),
    rooms: [{ floor: null, wall: null }], // null = piso/pared por defecto (no cuentan prestigio)
    placed: [],      // {uid, id, room, x, y, rot}
    inventory: [],   // {uid, id}
    owned: {},       // id -> true (para exclusivos/hitos)
    seq: 0,
    workshop: { ts: null, stored: 0, rate: 0 },
    boosts: [],      // timestamps de fin de cada +1%
    guestbook: [],   // {id, name, faction, ts, applause}
    applause: { week: -1, voters: [] }, // aplaudidores únicos de la semana
    visits: { day: -1, hosts: [], rewarded: 0, renown: 0 },
    streak: { count: 0, lastDay: -1, shields: CFG.lair.visit.shieldsPerWeek, shieldWeek: -1, best: 0 },
    renown: 0,
    tips: { day: -1, count: 0, renown: 0 },
  };
}

export function grantItem(e, id) {
  const uid = `i${++e.lair.seq}`;
  e.lair.inventory.push({ uid, id });
  e.lair.owned[id] = true;
  return uid;
}

export const bLevel = (e, k) => e.lair?.buildings[k] ?? 0;
export const bValue = (e, k) => { const l = bLevel(e, k); return l ? CFG.lair.buildings[k].values[l - 1] : null; };

export const energyMax = (e) => bValue(e, 'generador') ?? CFG.energy.max;
export const energyRegenMin = (e) => bValue(e, 'enfermeria') ?? CFG.energy.regenMin;
export const vaultPct = (e) => bValue(e, 'boveda') ?? 0;
export const towerPct = (e) => bValue(e, 'torre') ?? 0;
