// Flujo de un ataque (Arena, Venganza, Revancha): comando → "Cazando…" fijo → informe. La energía baja al instante;
// el oro y la XP se revelan recién con el informe.
import { playHunt } from './report.js';

export function startFight(ctx, btn, run) {
  const r = ctx.act(btn, run, null, { refresh: false });
  if (!r?.ok) return;
  ctx.refreshTop({ energyOnly: true });
  playHunt(r.report, ctx.S.player.id, {
    onReveal: () => ctx.refreshTop(),
    onDone: () => { ctx.game.markRead(r.report.id); ctx.refresh(); ctx.celebrate(r.report); },
  });
}

// Chance estimada (banda de la fachada) en palabras, como en los mockups.
export const CHANCE = { debil: ['Chance alta', 'hi'], parejo: ['Chance pareja', 'mid'], fuerte: ['Chance baja', 'lo'], muy_fuerte: ['Chance muy baja', 'xlo'] };
