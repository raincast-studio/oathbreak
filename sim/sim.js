// Reportes de balance: node sim/sim.js [--days=60] [--only=matrix|prog|bots]
import { matrix, runProfile, summarize, PROFILES } from './model.js';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const ONLY = arg('only');
const DAYS = +(arg('days') ?? 60);
const pct = (x) => `${(x * 100).toFixed(1)}%`.padStart(6);

if (ONLY !== 'prog' && ONLY !== 'bots') {
  console.log(`\n=== 1. Winrate de cada build contra el resto, a igual oro ===`);
  for (const gold of [600, 6000, 40000]) {
    const { rows, mirrorAtk } = matrix(gold);
    console.log(`\n· Inversión ${gold} oro — espejo balanceado: atacante gana ${pct(mirrorAtk)}`);
    for (const [k, r] of Object.entries(rows).sort((a, b) => b[1].wr - a[1].wr))
      console.log(`  ${k.padEnd(11)} ${pct(r.wr)}  KO ${pct(r.ko)}  F${r.s.fue} D${r.s.def} A${r.s.agi} R${r.s.res} HP${r.hp}`);
  }
}

// v17: economía con menos bots (jugadores reales simulados con addPlayer y retiro progresivo). node sim/sim.js --only=bots
if (ONLY === 'bots') {
  const { runCrowd } = await import('./crowd.js');
  const D = +(arg('days') ?? 30);
  const SCEN = [
    ['100% bots (1 jugador + 40 bots)', { humans: 0 }],
    ['50%: 21 jugadores, plan 0,5, cupos de hoy', { humans: 20, share: 0.5 }],
    ['50%: 21 jugadores, plan 0,5, bots reciben 30/día', { humans: 20, share: 0.5, caps: { bots: 30 } }],
    ['10%: 37 jugadores, plan 0,1, cupos de hoy', { humans: 36, share: 0.1 }],
    ['10%: 37 jugadores, plan 0,1, todos reciben 30/día', { humans: 36, share: 0.1, caps: { players: 30, bots: 30 } }],
  ];
  const f = (x, d = 0) => (x == null ? '–' : (+x).toFixed(d));
  for (const [name, o] of SCEN) {
    const r = runCrowd({ ...o, days: D });
    const sh = (d) => r.share.find((x) => x.day === d) ?? r.share.at(-1);
    const real = sh(D).real, b = sh(D).bots;
    console.log(`\n=== ${name} · ${D} días ===`);
    console.log(`bots activos día 1/7/14/${D}: ${[1, 7, 14, D].map((d) => sh(d).bots).join('/')} · proporción final ${pct(b / (b + real))} · inactivos ${sh(D).gone}`);
    console.log('objetivos a la vista por sesión (rango del cazador): ' + r.targets.filter((t) => t.sessions).map((t) => `Nv ${t.range[0]}–${t.range[1] > 99 ? '+' : t.range[1]}: ${f(t.humans, 1)} reales + ${f(t.bots, 1)} bots`).join(' · '));
    console.log(`p0 (perfil activo): oro/día ${r.p0.goldPerDay} · botGoldShare ${pct(r.p0.botGoldShare)} · winrate 7d ${r.p0.wr7.map(pct).join(' ')} · nivel día 1/7/14/30 ${r.p0.lvl.join('/')} · sesiones que terminan por energía ${pct(r.p0.endByEnergy)}`);
    if (r.crowd.n) console.log(`otros ${r.crowd.n}: oro neto/día ${f(r.crowd.goldPerDay)} · botín de bots ${pct(r.crowd.botLootShare)} · winrate ${pct(r.crowd.wr)} · nivel mediano ${r.crowd.lvlMedian} · ataques/día ${f(r.crowd.attacksPerDay, 1)} · terminan por energía ${pct(r.crowd.endByEnergy)}`);
  }
}

if (ONLY !== 'matrix' && ONLY !== 'bots') {
  const DAYS_SHOWN = [1, 2, 3, 7, 14, 21, 30, 45, 60, 90].filter((d) => d <= DAYS);
  for (const [name, prof] of Object.entries(PROFILES)) {
    const log = runProfile(prof, DAYS);
    const s = summarize(log);
    console.log(`\n=== 2. Perfil ${name} (${prof.sessions.length} sesiones/día, ${DAYS} días) ===`);
    console.log('día  nivel  stats  winrate7d  ataques  defensas  winDef  oroMisión   botín  recDef  taller  visitas  diarios  edif(BEGTV)  racha  renombre');
    for (const r of log.filter((x) => DAYS_SHOWN.includes(x.day))) {
      console.log([
        String(r.day).padStart(3), String(r.lvl).padStart(5), String(r.stats).padStart(5), pct(r.wr7).padStart(9),
        String(r.attacks).padStart(7), String(r.defended).padStart(8), pct(r.defended ? r.defWins / r.defended : 0),
        String(r.missionGold).padStart(9), String(r.lootIn - r.lootOut).padStart(6), String(r.bounty).padStart(6),
        String(r.workshop).padStart(6), String(r.visitGold).padStart(7), String(r.dailyGold).padStart(7),
        r.bld.padStart(11), String(r.streak).padStart(5), String(r.renown).padStart(8),
      ].join('  '));
    }
    console.log(`→ XP de PvP ${pct(s.pvpXpShare)} · Taller ${pct(s.workshopShare)} y visitas ${pct(s.visitShare)} del oro de misiones · sesiones que terminan por energía ${pct(s.endByEnergy)} · oro/día ${Math.round(s.goldPerDay)}`);
  }
}
