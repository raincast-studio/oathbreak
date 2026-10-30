// Combate por turnos, resuelto instantáneo y determinístico por semilla. Sin efectos sobre entidades.
//
// Triángulo de builds (relaciones no transitivas):
//   FUE  → golpes grandes. Atraviesa la armadura (Fue > Def).
//   DEF  → armadura PLANA por golpe: anula muchos golpes chicos (Def > Agi).
//   AGI  → esquive y doble golpe relativos a la Agi rival: evita los golpes grandes (Agi > Fue).
//   RES  → vida. Escala todo lo anterior; ninguna build la puede ignorar.
import { CFG } from './config.js';
import { mulberry32 } from './core.js';

const rel = (mine, theirs) => mine / (mine + theirs || 1);

// Esquive = tope × Agi_def/(Agi_def + Agi_atk).
export const dodgeChance = (agiDef, agiAtk, cfg = CFG.combat) => cfg.dodgeCap * rel(agiDef, agiAtk);
// Doble golpe = tope × Agi/(Agi + Agi_rival).
export const doubleChance = (agi, agiFoe, cfg = CFG.combat) => cfg.doubleCap * rel(agi, agiFoe);
// Crítico = base + rango × Agi/(Agi + Agi_rival).
export const critChance = (agi, agiFoe, cfg = CFG.combat) => (cfg.critBasePct + cfg.critSpanPct * rel(agi, agiFoe)) / 100;
// Golpe = mult × Fue − k × Def, con piso de un % del golpe bruto.
export const baseDamage = (fue, def, cfg = CFG.combat) => {
  const raw = cfg.dmgMult * fue;
  return Math.max(raw * cfg.armorFloor, raw - cfg.armorK * def);
};

// A / D: { stats:{fue,def,agi,res}, hp, maxHp }
export function resolveCombat(A, D, seed, cfg = CFG.combat) {
  const rng = mulberry32(seed);
  const side = { A: { ...A, hp: A.hp, dealt: 0 }, D: { ...D, hp: D.hp, dealt: 0 } };
  const rounds = [];
  const push = (r, actor, o) => rounds.push({ r, actor, dmg: 0, crit: false, dodge: false, ...o, hpA: Math.max(0, Math.round(side.A.hp)), hpD: Math.max(0, Math.round(side.D.hp)) });

  const strike = (me, foe, mult) => {
    const crit = rng() < critChance(me.stats.agi, foe.stats.agi, cfg);
    let dmg = baseDamage(me.stats.fue, foe.stats.def, cfg) * rng.range(cfg.dmgVar[0], cfg.dmgVar[1]) * mult;
    if (crit) dmg *= cfg.critMult;
    dmg = Math.min(Math.max(1, Math.round(dmg)), Math.ceil(foe.hp));
    foe.hp -= dmg;
    me.dealt += dmg;
    return { dmg, crit };
  };

  for (let r = 1; r <= cfg.rounds; r++) {
    const aA = side.A.stats.agi, aD = side.D.stats.agi;
    const order = aA > aD ? ['A', 'D'] : aD > aA ? ['D', 'A'] : rng() < 0.5 ? ['A', 'D'] : ['D', 'A'];
    for (const k of order) {
      const me = side[k], foe = side[k === 'A' ? 'D' : 'A'];
      if (me.hp <= 0 || foe.hp <= 0) break;
      if (rng() < dodgeChance(foe.stats.agi, me.stats.agi, cfg)) { push(r, k, { dodge: true }); continue; }
      push(r, k, strike(me, foe, 1));
      if (foe.hp > 0 && rng() < doubleChance(me.stats.agi, foe.stats.agi, cfg)) push(r, k, { ...strike(me, foe, cfg.doubleMult), double: true });
    }
    if (side.A.hp <= 0 || side.D.hp <= 0) break;
  }

  let winner, reason;
  if (side.D.hp <= 0) { winner = 'A'; reason = 'KO'; }
  else if (side.A.hp <= 0) { winner = 'D'; reason = 'KO'; }
  else {
    // Sin K.O. gana quien quitó mayor % de la vida rival.
    const scoreA = side.A.dealt / D.maxHp, scoreD = side.D.dealt / A.maxHp;
    if (scoreA > scoreD) { winner = 'A'; reason = 'DAMAGE'; }
    else if (scoreD > scoreA) { winner = 'D'; reason = 'DAMAGE'; }
    else { winner = 'D'; reason = 'TIE_DEF'; }
  }

  return { winner, reason, rounds, hpEndA: Math.max(0, side.A.hp), hpEndD: Math.max(0, side.D.hp), dealtA: side.A.dealt, dealtD: side.D.dealt };
}
