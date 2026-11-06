// v17: economía con menos bots. Suma jugadores reales simulados con addPlayer al mundo del perfil activo y activa el
// retiro progresivo (bots.retire) con la proporción pedida. El jugador medido (p0) usa la fachada (model.js); los demás
// juegan con las reglas de src/ directamente sobre el mismo mundo (una fachada carga su propia copia del guardado).
import { CFG, HOUR, DAY } from '../src/config.js';
import { mulberry32 } from '../src/core.js';
import * as S from '../src/systems.js';
import * as Lr from '../src/lair.js';
import * as So from '../src/social.js';
import * as C from '../src/character.js';
import * as BL from '../src/bots.js';
import { touchSession } from '../src/telemetry.js';
import { runProfile, summarize, PROFILES } from './model.js';

const BAL = { fue: 1, def: 1, agi: 1, res: 1 };
const BRACKETS = [[1, 9], [10, 19], [20, 29], [30, 999]];
const bracket = (lvl) => BRACKETS.findIndex(([a, b]) => lvl >= a && lvl <= b);

// Rivales que se pueden atacar ahora (sin contar la misión en curso ni la energía).
const visible = (world, e, now) => { const me = { ...e, mission: null }; return Object.values(world.entities).filter((o) => !S.attackBlock(me, o, now, { ignoreEnergy: true })); };

// Una sesión de un jugador simulado: misión, amigos y regalos, 4 visitas, caza hasta quedarse sin energía, gasto y misión.
function play(world, e, now, rng, st) {
  touchSession(world, e, now);
  C.sync(e, now);
  if (e.mission && now >= e.mission.end) S.claimMission(e, now, rng, world);
  for (const r of So.pendingIn(e, now)) if (world.entities[r.id]) So.acceptFriend(e, world.entities[r.id], now);
  if ((e.friends ?? []).length < 10) {
    const o = rng.pick(world.players.map((id) => world.entities[id]).filter((x) => x.id !== e.id));
    if (o) So.addFriend(e, o, now, world);
  }
  for (const id of e.friends ?? []) if (world.entities[id]) So.sendGift(world, e, world.entities[id], now);
  So.openGifts(e);
  const hosts = Object.values(world.entities).filter((h) => h.id !== e.id && !BL.gone(h, now));
  for (let i = 0; i < 4; i++) Lr.visit(world, e, rng.pick(hosts), now);
  // Objetivos a la vista (antes de cazar): rivales en rango que se pueden atacar ahora.
  const k = bracket(e.level), free = visible(world, e, now);
  st.targets[k].n++; st.targets[k].h += free.filter((o) => !o.isBot).length; st.targets[k].b += free.filter((o) => o.isBot).length;
  for (;;) {
    if (e.energy < CFG.energy.pvpCost) { st.endEnergy++; break; }
    const pool = Object.values(world.entities).filter((o) => !S.attackBlock(e, o, now));
    if (!pool.length) { st.endTargets++; break; }
    const r = S.pvp(world, e, rng.pick(pool), now);
    if (!r.ok) break;
    st.attacks++; if (r.report.winner === 'attacker') st.wins++;
  }
  S.spendByWeights(e, BAL, 0.25);
  if (!e.mission) S.startMission(e, CONTRACTS_240(e), now);
}
const CONTRACTS_240 = (e) => (e.faction === 'hero' ? 'h4' : 'v4');

// humans: jugadores reales además de p0 · share: proporción máxima de bots del plan (null = retiro apagado)
// caps: { players, bots } cupos de ataques recibidos por día (null = los de config).
export function runCrowd({ humans = 0, share = null, days = 30, seed = 1234, caps = {} } = {}) {
  const saved = { retire: { ...CFG.bots.retire }, recv: CFG.pvp.maxReceivedPerDay, recvBot: CFG.bots.receiveFromPlayers };
  const t0 = Date.UTC(2026, 9, 19, 3);
  if (share != null) {
    const step = CFG.bots.retire.plan.find(([, s]) => s === share) ?? [0, share];
    Object.assign(CFG.bots.retire, { enabled: true, since: t0 - step[0] * DAY });
    if (!CFG.bots.retire.plan.some(([, s]) => s === share)) CFG.bots.retire.plan = [[0, share]];
  }
  if (caps.players != null) CFG.pvp.maxReceivedPerDay = caps.players;
  if (caps.bots !== undefined) CFG.bots.receiveFromPlayers = caps.bots;
  const st = { attacks: 0, wins: 0, endEnergy: 0, endTargets: 0, targets: BRACKETS.map(() => ({ n: 0, h: 0, b: 0 })), share: [] };
  const crowd = [], rng = mulberry32(seed ^ 0xc40d);
  let world, g0;
  try {
    const log = runProfile(PROFILES.activo, days, seed, {
      setup(g) {
        g0 = g; world = g.debug.world();
        for (let i = 0; i < humans; i++) {
          const r = g.debug.addPlayer(`Jugador${i}`, i % 2 ? 'hero' : 'villain');
          const e = world.entities[r.id];
          e.sessions = i % 5 < 3 ? [0, 1, 2, 3] : [0, 3]; // 60% juega como el activo, 40% dos veces por día
          crowd.push(e);
        }
      },
      session(g, now, i) {
        for (const e of crowd) if (e.sessions.includes(i)) play(world, e, now, rng, st);
        // p0 también cuenta en los objetivos a la vista
        const p = world.entities.p0, k = bracket(p.level), free = visible(world, p, now);
        st.targets[k].n++; st.targets[k].h += free.filter((o) => !o.isBot).length; st.targets[k].b += free.filter((o) => o.isBot).length;
      },
      onDay(g, d) {
        const now = g.state().now, bots = Object.values(world.entities).filter((e) => e.isBot);
        const act = bots.filter((b) => !BL.retireStage(b, now)).length;
        st.share.push({ day: d, bots: act, gone: bots.filter((b) => BL.gone(b, now)).length, real: world.players.length });
      },
    });
    const s = summarize(log);
    const lv = crowd.map((e) => e.level).sort((a, b) => a - b);
    return {
      p0: { goldPerDay: Math.round(s.goldPerDay), botGoldShare: s.botGoldShare, wr7: [7, 14, 30].filter((d) => d <= days).map((d) => log[d - 1].wr7),
        lvl: [1, 7, 14, 30].filter((d) => d <= days).map((d) => s.lvlAt(d)), endByEnergy: s.endByEnergy },
      crowd: { n: crowd.length, wr: st.wins / Math.max(1, st.attacks), endByEnergy: st.endEnergy / Math.max(1, st.endEnergy + st.endTargets),
        lvlMedian: lv[lv.length >> 1] ?? null, attacksPerDay: st.attacks / Math.max(1, crowd.length) / days },
      targets: st.targets.map((t, i) => ({ range: BRACKETS[i], sessions: t.n, humans: t.n ? t.h / t.n : null, bots: t.n ? t.b / t.n : null })),
      share: st.share,
      kb: g0 ? g0.debug.exportSave().length / 1024 : null,
    };
  } finally {
    Object.assign(CFG.bots.retire, saved.retire);
    CFG.pvp.maxReceivedPerDay = saved.recv; CFG.bots.receiveFromPlayers = saved.recvBot;
  }
}
void HOUR;
