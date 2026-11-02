// Combate por turnos, resuelto instantáneo y determinístico por semilla. Sin efectos sobre entidades.
//
// Triángulo de builds (relaciones no transitivas):
//   FUE  → golpes grandes. Atraviesa la armadura (Fue > Def).
//   DEF  → armadura PLANA por golpe: anula muchos golpes chicos (Def > Agi).
//   AGI  → esquive y doble golpe relativos a la Agi rival: evita los golpes grandes (Agi > Fue).
//   RES  → vida. Escala todo lo anterior; ninguna build la puede ignorar.
import { CFG } from './config.js';

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
// log=false (v15): no arma el detalle por rondas; lo usa winChance, que simula miles de peleas.
// v15.1: las chances y el golpe base dependen solo de los atributos, que no cambian durante la pelea: se calculan una vez
// por pelea y el RNG va en línea (mismo mulberry32, mismas llamadas y en el mismo orden → resultados idénticos bit a bit).
export function resolveCombat(A, D, seed, cfg = CFG.combat, log = true) {
  let t = seed >>> 0;
  const rnd = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const sa = A.stats, sd = D.stats;
  // Índice 0 = A pega a D; 1 = D pega a A.
  const dodge = [dodgeChance(sd.agi, sa.agi, cfg), dodgeChance(sa.agi, sd.agi, cfg)];
  const dbl = [doubleChance(sa.agi, sd.agi, cfg), doubleChance(sd.agi, sa.agi, cfg)];
  const crit = [critChance(sa.agi, sd.agi, cfg), critChance(sd.agi, sa.agi, cfg)];
  const base = [baseDamage(sa.fue, sd.def, cfg), baseDamage(sd.fue, sa.def, cfg)];
  const [v0, v1] = cfg.dmgVar, vSpan = v1 - v0;
  const hp = [A.hp, D.hp], dealt = [0, 0];
  const rounds = [];
  const push = (r, k, o) => rounds.push({ r, actor: k ? 'D' : 'A', dmg: 0, crit: false, dodge: false, ...o, hpA: Math.max(0, Math.round(hp[0])), hpD: Math.max(0, Math.round(hp[1])) });
  // Un golpe de k: devuelve el daño y deja en `wasCrit` si fue crítico.
  let wasCrit = false;
  const strike = (k, mult) => {
    const f = 1 - k;
    wasCrit = rnd() < crit[k];
    let dmg = base[k] * (v0 + rnd() * vSpan) * mult;
    if (wasCrit) dmg *= cfg.critMult;
    dmg = Math.min(Math.max(1, Math.round(dmg)), Math.ceil(hp[f]));
    hp[f] -= dmg;
    dealt[k] += dmg;
    return dmg;
  };
  const first = sa.agi > sd.agi ? 0 : sd.agi > sa.agi ? 1 : -1;

  for (let r = 1; r <= cfg.rounds; r++) {
    const a0 = first >= 0 ? first : rnd() < 0.5 ? 0 : 1;
    for (let j = 0; j < 2; j++) {
      const k = j ? 1 - a0 : a0, f = 1 - k;
      if (hp[k] <= 0 || hp[f] <= 0) break;
      if (rnd() < dodge[k]) { if (log) push(r, k, { dodge: true }); continue; }
      const d1 = strike(k, 1);
      if (log) push(r, k, { dmg: d1, crit: wasCrit });
      if (hp[f] > 0 && rnd() < dbl[k]) { const d2 = strike(k, cfg.doubleMult); if (log) push(r, k, { dmg: d2, crit: wasCrit, double: true }); }
    }
    if (hp[0] <= 0 || hp[1] <= 0) break;
  }

  let winner, reason;
  if (hp[1] <= 0) { winner = 'A'; reason = 'KO'; }
  else if (hp[0] <= 0) { winner = 'D'; reason = 'KO'; }
  else {
    // Sin K.O. gana quien quitó mayor % de la vida rival.
    const scoreA = dealt[0] / D.maxHp, scoreD = dealt[1] / A.maxHp;
    if (scoreA > scoreD) { winner = 'A'; reason = 'DAMAGE'; }
    else if (scoreD > scoreA) { winner = 'D'; reason = 'DAMAGE'; }
    else { winner = 'D'; reason = 'TIE_DEF'; }
  }

  return { winner, reason, rounds, hpEndA: Math.max(0, hp[0]), hpEndD: Math.max(0, hp[1]), dealtA: dealt[0], dealtD: dealt[1] };
}
