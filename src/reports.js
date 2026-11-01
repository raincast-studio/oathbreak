// Texto del informe armado en cliente a partir del objeto (no se guarda texto).
const REASON = { KO: 'por K.O.', DAMAGE: 'por quitar más % de vida', TIE_DEF: 'por empate (gana el defensor)' };
const BOUNTY_NO = { rival_debil: 'sin recompensa: el atacante no tenía chances reales', ya_cobrada_hoy: 'sin recompensa: ya cobraste por este rival hoy', atacante_sin_victorias: 'sin recompensa: el atacante casi nunca gana (antiabuso)' };

function goldLine(r, me) {
  if (r.winner === 'attacker') return me === 'attacker' ? `+${r.loot.gold} oro robado` : `-${r.loot.gold} oro robado`;
  if (me === 'attacker') return 'No perdiste oro';
  return r.loot.bounty ? `+${r.loot.bounty} oro de recompensa por defensa` : (BOUNTY_NO[r.loot.bountyReason] ?? 'sin recompensa');
}

export function summary(report, viewerId) {
  const me = report.attacker.id === viewerId ? 'attacker' : 'defender';
  const foe = me === 'attacker' ? 'defender' : 'attacker';
  const won = report.winner === me;
  const pct = report.dealtPct ?? { attacker: 0, defender: 0 };
  const lines = [
    me === 'attacker'
      ? `Atacaste a ${report.defender.name} (Nv ${report.defender.lvl})`
      : `Fuiste atacado por ${report.attacker.name} (Nv ${report.attacker.lvl})`,
    `${won ? 'VICTORIA' : 'DERROTA'} ${REASON[report.reason]}`,
    `Vida quitada: vos ${pct[me]}% · rival ${pct[foe]}%  (daño ${report.dealt[me]} vs ${report.dealt[foe]})`,
    goldLine(report, me),
    `+${report.xp[me]} XP${won ? ` · +${report.rep.winner} reputación` : ''}`,
    `HP: ${report[me].hpStart} → ${report[me].hpEnd} / ${report[me].maxHp}`,
  ];
  if (report.levelUp[me]) lines.push(`¡SUBISTE ${report.levelUp[me]} NIVEL(ES)!`);
  if (report.trophy?.to === me) lines.push(`¡Trofeo desbloqueado: ${report.trophy.name}!`);
  return lines;
}

export function details(report) {
  const n = { A: report.attacker.name, D: report.defender.name };
  const out = [];
  let lastR = 0;
  if (!report.rounds) return ['El detalle por rondas solo se guarda en los 5 informes más recientes.'];
  for (const x of report.rounds) {
    if (x.r !== lastR) { out.push(`— Ronda ${x.r} —`); lastR = x.r; }
    const foe = x.actor === 'A' ? n.D : n.A;
    out.push(x.dodge
      ? `${n[x.actor]} ataca, ${foe} esquiva.`
      : `${n[x.actor]} golpea por ${x.dmg}${x.crit ? ' (¡CRÍTICO!)' : ''}. [${n.A} ${x.hpA} · ${n.D} ${x.hpD}]`);
  }
  return out;
}
