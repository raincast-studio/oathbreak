// RNG con semilla, reloj inyectable y persistencia versionada.
import { CFG } from './config.js';

export function mulberry32(seed) {
  let t = seed >>> 0;
  const next = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + next() * (b - a);
  next.int = (a, b) => Math.floor(a + next() * (b - a + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

// Deriva una semilla nueva por acción: reproducible a partir de (seedMundo, contador).
export function deriveSeed(world) {
  world.seq = (world.seq + 1) >>> 0;
  let h = (world.seed ^ Math.imul(world.seq, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

// Reloj con offset manipulable (debug: adelantar tiempo).
export function createClock(base = () => Date.now()) {
  let offset = 0;
  return {
    now: () => base() + offset,
    advance: (ms) => { offset += ms; },
    get offset() { return offset; },
    set offset(v) { offset = v; },
  };
}

export const dayKey = (ts) => Math.floor((ts + CFG.dayOffsetMs) / 86_400_000);
// Semanas de lunes a domingo en ART (el día 0 de dayKey fue jueves).
export const weekKey = (ts) => Math.floor((dayKey(ts) + 3) / 7);

// Storage: localStorage en browser, memoria en Node.
export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

export const SAVE_KEY = 'oathbreak.save';
export const BACKUP_KEY = 'oathbreak.save.backup';

export function saveWorld(storage, world) {
  storage.setItem(SAVE_KEY, JSON.stringify(world));
}

// Lee el guardado sin pisar nada: devuelve el estado para que la fachada decida (migrar, bloquear o empezar).
export function readSave(storage) {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return { status: 'empty' };
  let w;
  try { w = JSON.parse(raw); } catch { return { status: 'corrupt', raw }; }
  if (!w || typeof w !== 'object' || !Number.isInteger(w.version)) return { status: 'corrupt', raw };
  if (w.version > CFG.saveVersion) return { status: 'future', raw, version: w.version };
  if (w.version < CFG.saveVersion) return { status: 'old', world: w, raw };
  return { status: 'ok', world: w };
}

// Antes de empezar de cero sobre un guardado ilegible o de otra versión, se respalda.
export function backupSave(storage, raw) { if (raw) storage.setItem(BACKUP_KEY, raw); }
export function clearWorld(storage) { storage.removeItem(SAVE_KEY); }
