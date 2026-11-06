// Telemetría de juego: eventos de producto para medir retención (D1/D7/D30), embudo, primera hora y economía.
// Diccionario completo y preguntas de negocio: docs/telemetria.md. Nunca datos personales (ni nombre ni email).
// En el cliente se guardan en un buffer circular del mundo (diagnóstico) y salen por el sink (ui/telemetry-sink.js →
// lote a Supabase). En E6 el mismo `track` corre en el servidor.
import { CFG, MIN } from './config.js';

let sink = null; // función opcional (evento) => void, p. ej. para enviar a un servidor
export const setTelemetrySink = (fn) => { sink = typeof fn === 'function' ? fn : null; };

// Hitos de la primera hora: la primera vez de cada cosa emite `first` { k, min } (minutos desde el alta).
// Se marcan en un entero de bits del jugador (e.tm, ≈ 6 bytes en el guardado). Sin e.tm (guardados de antes de v17):
// todo se da por hecho, para no contar como "primera" la misión 200 de un jugador viejo.
export const FIRSTS = ['mission', 'hunt', 'win', 'stat', 'gear', 'building', 'visit', 'gift', 'friend'];
const ALL = (1 << FIRSTS.length) - 1;
const firstsOf = (type, p) => (
  type === 'mission_start' ? ['mission']
    : type === 'pvp' && p.role === 'attacker' ? (p.won ? ['hunt', 'win'] : ['hunt'])
      : type === 'spend' && FIRSTS.includes(p.what) ? [p.what]
        : type === 'visit' ? ['visit'] : type === 'gift_sent' ? ['gift'] : type === 'friend_request' ? ['friend'] : []);

// keep: false → solo al sink (no entra al buffer del guardado). Se usa para `gold`, el evento más frecuente.
export function track(world, e, type, props, now, { keep = true } = {}) {
  if (!world || !e || e.isBot) return;
  const ev = { ts: now, pid: e.id, type, ...props };
  if (keep) {
    world.events ??= [];
    world.events.push(ev);
    if (world.events.length > CFG.telemetry.max) world.events.splice(0, world.events.length - CFG.telemetry.max);
  }
  if (sink) try { sink(ev); } catch { /* la analítica nunca rompe el juego */ }
  for (const k of firstsOf(type, props ?? {})) {
    const bit = 1 << FIRSTS.indexOf(k);
    e.tm ??= ALL;
    if (e.tm & bit) continue;
    e.tm |= bit;
    track(world, e, 'first', { k, min: Math.max(0, Math.round((now - (e.createdAt ?? now)) / MIN)) }, now);
  }
}

// Economía: patrimonio (oro en mano + banco) antes/después de cada comando. Una sola regla para todas las fuentes y
// sumideros: el evento dice cuánto cambió y por qué (src), sin repetir los cálculos de cada sistema.
export const wealth = (e) => (e ? (e.gold ?? 0) + (e.bank ?? 0) : 0);
export function trackGold(world, e, src, before, now) {
  const d = wealth(e) - before;
  if (d) track(world, e, 'gold', { src, d, bal: wealth(e) }, now, { keep: false });
}

// Marca inicio de sesión si pasó más de N minutos desde la última actividad del jugador.
export function touchSession(world, e, now) {
  if (!e || e.isBot) return;
  if (e.lastSeen == null || now - e.lastSeen > CFG.telemetry.sessionGapMin * MIN) track(world, e, 'session_start', { level: e.level }, now);
  e.lastSeen = now;
}
