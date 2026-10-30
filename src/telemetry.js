// Telemetría mínima: eventos de producto para medir retención (D1/D7/D30), embudo y economía.
// En el cliente se guardan en un buffer circular; en E6 el mismo `track` envía al backend de analítica.
import { CFG, MIN } from './config.js';

let sink = null; // función opcional (evento) => void, p. ej. para enviar a un servidor
export const setTelemetrySink = (fn) => { sink = typeof fn === 'function' ? fn : null; };

export function track(world, e, type, props, now) {
  if (!world || !e || e.isBot) return;
  const ev = { ts: now, pid: e.id, type, ...props };
  world.events ??= [];
  world.events.push(ev);
  if (world.events.length > CFG.telemetry.max) world.events.splice(0, world.events.length - CFG.telemetry.max);
  if (sink) try { sink(ev); } catch { /* la analítica nunca rompe el juego */ }
}

// Marca inicio de sesión si pasó más de N minutos desde la última actividad del jugador.
export function touchSession(world, e, now) {
  if (!e || e.isBot) return;
  if (e.lastSeen == null || now - e.lastSeen > CFG.telemetry.sessionGapMin * MIN) track(world, e, 'session_start', { level: e.level }, now);
  e.lastSeen = now;
}
