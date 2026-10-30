// Fórmulas de recompensa sin dependencias (rompe el ciclo systems ↔ lair).
import { CFG } from './config.js';

export function missionReward(min, level) {
  const m = CFG.missions, f = min ** m.exp * (1 + m.lvlFactor * level);
  return { gold: Math.round(m.goldBase * f), xp: Math.round(m.xpBase * f) };
}

// Validadores de borde (fachada): nada de NaN, fraccionarios ni claves heredadas del prototipo.
export const isInt = (n, min = -Infinity, max = Infinity) => Number.isInteger(n) && n >= min && n <= max;
export const isPosInt = (n) => Number.isSafeInteger(n) && n > 0;
export const hasKey = (obj, k) => typeof k === 'string' && Object.hasOwn(obj, k);
