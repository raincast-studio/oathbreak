// Migraciones de guardado: cada paso lleva de la versión N a N+1 sin perder progreso.
import { mulberry32 } from './core.js';
import { createLair } from './effects.js';
import { furnishBot } from './lair.js';

const STEPS = {
  // v1 → v2: agrega guaridas.
  1(w) {
    for (const e of Object.values(w.entities)) e.lair = createLair();
    const rng = mulberry32(w.seed ^ 0x1a12);
    for (const e of Object.values(w.entities)) if (e.isBot) furnishBot(e, rng);
  },
  // v2 → v3: piso/pared por defecto como null, ritmo del Taller, aplausos únicos, propinas.
  2(w) {
    for (const e of Object.values(w.entities)) {
      const l = e.lair;
      for (const r of l.rooms) {
        if (r.floor === 'piso_piedra') r.floor = null;
        if (r.wall === 'pared_ladrillo') r.wall = null;
      }
      l.workshop.rate ??= undefined;
      l.applause = { week: l.applause?.week ?? -1, voters: [] };
      l.tips ??= { day: -1, count: 0, renown: 0 };
    }
  },
  // v3 → v4: varios jugadores por mundo, bandeja por jugador, bots anclados, horas de bots alineadas, telemetría.
  3(w) {
    const pid = w.playerId;
    w.players = [pid];
    if (w.entities[pid]) w.entities[pid].inbox = w.inbox ?? [];
    delete w.inbox;
    for (const e of Object.values(w.entities)) if (e.isBot) e.anchor = pid;
    w.botHour = Math.floor((w.botTs ?? 0) / 3_600_000);
    delete w.botTs;
    w.events ??= [];
    w.ops ??= [];
  },
  // v4 → v5: amigos, regalos, temporada (todo opcional, se inicializa al usarse).
  4(w) {
    for (const e of Object.values(w.entities)) {
      e.friends ??= [];
      if (!e.isBot) e.giftbox ??= [];
      if (e.isBot) { e.skill ??= (e.powerMul ?? 0.9) - 0.9; e.scale ??= 1; e.wealth ??= 1; delete e.powerMul; }
    }
  },
};

export function migrate(w, target) {
  while (w.version < target) {
    const step = STEPS[w.version];
    if (!step) throw new Error(`sin migración desde v${w.version}`);
    step(w);
    w.version++;
  }
  return w;
}
