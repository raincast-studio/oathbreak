// Eventos de fin de semana (v15): rotan cada semana entre 3 (caza, botín, social). Sábado y domingo, en ART.
// Módulo aparte para que lo usen systems (PvP) y lair (visitas) sin dependencia circular.
import { CFG } from './config.js';
import { weekKey } from './core.js';

export function weekendEvent(now) {
  const ev = CFG.events?.weekend;
  if (!ev) return null;
  const wd = new Date(now + CFG.dayOffsetMs).getUTCDay(); // 0 = domingo … 6 = sábado
  if (!ev.days.includes(wd)) return null;
  return ev.rotation[weekKey(now) % ev.rotation.length];
}
