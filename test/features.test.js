// Funciones de la revisión 1: multijugador, idempotencia, telemetría, cierre semanal, amigos y regalos,
// temporada, presa, ligas, guerra de facciones y antiabuso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, HOUR, DAY } from '../src/config.js';
import { createClock, memoryStorage, dayKey } from '../src/core.js';
import * as C from '../src/character.js';
import * as S from '../src/systems.js';
import * as Lr from '../src/lair.js';
import * as So from '../src/social.js';
import * as Se from '../src/season.js';
import { createGame } from '../src/game.js';
import { ITEM } from '../src/catalog.js';

const MON = Date.UTC(2026, 9, 19, 3);
const newGame = (t = MON + 12 * HOUR, seed = 7, extra = {}) => {
  const storage = memoryStorage(), clock = createClock(() => t);
  const g = createGame({ storage, clock, seed, ...extra });
  g.newCharacter('Tester', 'hero');
  return { g, storage, clock };
};
const bot = (id, faction, extra = {}) => Object.assign(C.createEntity({ id, name: id, faction, now: MON, isBot: true }), extra);

test('multijugador: dos jugadores en el mismo mundo, bandejas separadas y bots repartidos', () => {
  const { g, storage, clock } = newGame();
  const r = g.debug.addPlayer('Rival', 'villain');
  assert.ok(r.ok);
  const g2 = createGame({ storage, clock, playerId: r.id });
  assert.equal(g2.state().player.name, 'Rival');
  const w = g.debug.world();
  const anchors = new Set(Object.values(w.entities).filter((e) => e.isBot).map((b) => b.anchor));
  assert.deepEqual([...anchors].sort(), ['p0', 'p1']);
  // p1 sube de nivel para poder ser atacado y p0 lo ataca: el informe llega a las dos bandejas.
  w.entities.p0.level = 10; w.entities.p1.level = 10;
  const a = g.attack('p1');
  assert.ok(a.ok, a.error);
  assert.equal(g.inbox().list[0].role, 'attacker');
  assert.equal(createGame({ storage, clock, playerId: 'p1' }).inbox().list[0].role, 'defender');
});

test('idempotencia: un reintento con la misma clave no cobra dos veces', () => {
  const { g } = newGame();
  g.debug.world().entities.p0.gold = 5000;
  const r1 = g.withOp('op-1', () => g.buyStat('fue'));
  const gold = g.state().player.gold;
  const r2 = g.withOp('op-1', () => g.buyStat('fue'));
  assert.ok(r1.ok && r2.replayed);
  assert.equal(g.state().player.gold, gold);
  assert.equal(g.withOp('', () => g.buyStat('fue')).error, 'op_invalida');
});

test('telemetría: registro, sesiones, compras, cazas y visitas; el analítico externo nunca rompe el juego', () => {
  const seen = [];
  const { g, clock } = newGame(MON + 12 * HOUR, 7, { onEvent: (e) => { seen.push(e.type); throw new Error('caído'); } });
  g.debug.world().entities.p0.gold = 5000;
  g.buyStat('def');
  g.hunt();
  g.visit(g.visitSuggestions().list[0].id);
  clock.advance(2 * HOUR); g.state();
  const types = g.debug.events().map((e) => e.type);
  for (const t of ['signup', 'session_start', 'spend', 'pvp', 'visit']) assert.ok(types.includes(t), `falta ${t}`);
  assert.equal(types.filter((t) => t === 'session_start').length, 2);
  assert.ok(seen.length > 0);
});

test('cierre semanal: el premio no depende de cada cuánto se consulta', () => {
  const run = (stepH) => {
    const { g, clock } = newGame(MON + 12 * HOUR, 21);
    for (let h = 0; h < 7 * 24; h += stepH) { clock.advance(stepH * HOUR); g.state(); }
    return JSON.stringify(g.debug.world().lastPrize.winners.map((x) => x.id));
  };
  assert.equal(run(1), run(10));
  assert.equal(run(1), run(37));
});

test('amigos y regalos: tope diario, uno por amigo, lo regalado no se recicla, racha con regalo', () => {
  const w = { seed: 5, seq: 0, entities: {} };
  const p = bot('p', 'hero', { isBot: false });
  const friends = Array.from({ length: 7 }, (_, i) => bot(`f${i}`, 'villain'));
  for (const f of friends) { assert.ok(So.addFriend(p, f, MON).pending); assert.ok(So.acceptFriend(f, p, MON).ok); }
  assert.equal(So.addFriend(p, friends[0], MON).error, 'ya_es_amigo');
  assert.equal(So.sendGift(w, p, bot('x', 'hero'), MON).error, 'no_es_amigo');
  let sent = 0;
  for (const f of friends) if (So.sendGift(w, p, f, MON).ok) sent++;
  assert.equal(sent, CFG.social.giftsPerDay);
  assert.equal(So.sendGift(w, p, friends[0], MON + HOUR).error, 'ya_le_regalaste_hoy');
  // Recibir y abrir (la amistad ya es de los dos)
  assert.ok(So.sendGift(w, friends[0], p, MON).ok);
  const o = So.openGifts(p);
  assert.equal(o.opened, 1);
  const uid = p.lair.inventory[0].uid;
  assert.equal(Lr.recycleItem(p, uid, MON + DAY).error, 'no_reciclable'); // recién llegado: todavía no se vende
  assert.equal(Lr.recycleItem(p, uid, MON + 3 * DAY).gold, CFG.social.giftSellGold); // a los 3 días, barato
  // Racha: 3 visitas + 1 regalo enviado ese día
  for (const f of friends.slice(0, 3)) Lr.visit(w, p, f, MON);
  assert.equal(p.lair.streak.count, 1);
});

test('temporada: la gloria desbloquea escalones; un escalón se cobra una vez; se reinicia a las 4 semanas', () => {
  const p = bot('p', 'hero', { isBot: false });
  Se.addGlory(p, 'daily', MON, CFG.season.gloryPerTier / CFG.season.glory.daily); // = 1 escalón
  const st = Se.seasonStatus(p, MON);
  assert.equal(st.reached, 1);
  const g0 = p.gold;
  assert.ok(Se.claimTier(p, 1, MON).ok);
  assert.ok(p.gold > g0);
  assert.equal(Se.claimTier(p, 1, MON).error, 'ya_cobrado');
  assert.equal(Se.claimTier(p, 2, MON).error, 'escalon_bloqueado');
  assert.equal(Se.seasonStatus(p, MON + 28 * DAY).glory, 0);
  assert.equal(Se.tierReward(30, 10).id, 'temp_portal');
});

test('presa del día: estable en el día, paga doble XP y oro una sola vez, no sale al azar', () => {
  const { g } = newGame();
  const p = g.debug.world().entities.p0;
  const t = g.targets().list.find((x) => x.prey);
  assert.ok(t, 'hay presa');
  for (let i = 0; i < 12; i++) { const r = g.hunt(); if (!r.ok) break; assert.notEqual(r.report.defender.id, t.id); }
  p.energy = 12; p.stats = { fue: 60, def: 60, agi: 60, res: 60 };
  const r = g.attack(t.id);
  assert.ok(r.ok && r.report.prey && r.report.prey.gold > 0);
  assert.equal(p.preyDone, dayKey(g.state().now));
  assert.ok(!g.targets().list.some((x) => x.prey));
});

test('ligas: el escaparate separa por nivel y premia a cada liga', () => {
  assert.equal(Lr.leagueOf(1), 'novatos');
  assert.equal(Lr.leagueOf(15), 'veteranos');
  assert.equal(Lr.leagueOf(40), 'leyendas');
  const { g } = newGame();
  const r = g.showcase('hero', 'novatos');
  assert.ok(r.list.every((x) => x.league === 'novatos' && x.faction === 'hero'));
  assert.equal(g.showcase('hero', 'xx').error, 'liga_invalida');
});

test('guerra de facciones: la facción ganadora premia solo a sus miembros activos', () => {
  const { g, clock } = newGame();
  const w = g.debug.world(), p = w.entities.p0;
  for (let d = 0; d < 8; d++) { clock.advance(DAY); g.state(); }
  const fx = w.lastPrize.faction;
  assert.ok(fx && typeof fx.score.hero === 'number');
  assert.ok(!fx.rewarded.includes('p0'), 'un jugador sin victorias no cobra');
  void p;
});

test('prestigio con rendimiento decreciente por duplicados', () => {
  const e = bot('a', 'hero');
  for (let i = 0; i < 4; i++) Lr.placeItem(e, Lr.grantItem(e, 'cofre'), 0, i * 2, 0, 0);
  assert.equal(Lr.prestige(e).total, Math.round(1 + 0.5 + 0.25 + 0.125));
});

test('antiabuso: visitas de cuentas novatas no dan propina ni aplauso; recompensa de defensa exige victorias recientes', () => {
  const w = { seed: 1, seq: 0, entities: {} };
  const h = bot('h', 'hero');
  const novato = bot('n', 'villain', { isBot: false, level: 2 });
  const r = Lr.visit(w, novato, h, MON);
  assert.ok(r.gold > 0 && r.hostTip === 0 && h.lair.applause.voters.length === 0);
  const att = bot('a', 'hero', { recent: Array(10).fill(false) }), def = bot('d', 'villain');
  assert.equal(S.defenseBounty(att, def, MON).reason, 'atacante_sin_victorias');
});

test('reparto automático de atributos avanza el objetivo diario y respeta el oro a guardar', () => {
  const { g } = newGame();
  const p = g.debug.world().entities.p0;
  p.gold = 3000;
  const r = g.autoSpend({ fue: 1, def: 1, agi: 1, res: 1 }, 1000);
  assert.ok(r.ok && r.points > 0 && p.gold >= 1000);
  assert.equal(g.autoSpend({ fue: 1 }).error, 'pesos_invalidos');
});

test('regresión: un regalo colocado y quitado sigue sin poder reciclarse (ni aparece como reciclable)', () => {
  const { g } = newGame();
  const p = g.debug.world().entities.p0;
  p.giftbox = [{ id: 'gato', from: 'b1', fromName: 'b1', ts: MON }];
  assert.ok(g.openGifts().ok);
  const uid = g.lair().inventory[0].uid;
  assert.equal(g.lair().inventory[0].recycle, 0);
  assert.ok(g.autoPlace(uid).ok);
  assert.ok(g.removeItem(uid).ok);
  assert.equal(g.lair().inventory[0].recycle, 0);
  assert.equal(g.recycleItem(uid).error, 'no_reciclable');
});

test('regresión: los regalos del mismo día de distintos amigos no son todos iguales', () => {
  const w = { seed: 9, seq: 0, entities: {} };
  const p = bot('p0', 'hero', { isBot: false });
  const got = [];
  for (let i = 0; i < 5; i++) { const b = bot(`b${i}`, 'villain'); So.addFriend(b, p, MON); So.acceptFriend(p, b, MON); got.push(So.sendGift(w, b, p, MON).item); }
  assert.ok(new Set(got).size >= 4, `regalos: ${got}`);
});

test('los ataques de bots no consumen el cupo de ataques de jugadores reales', () => {
  const { g, storage, clock } = newGame();
  const w = g.debug.world(), p = w.entities.p0;
  p.level = 10;
  const bots = Object.values(w.entities).filter((e) => e.isBot && e.faction !== p.faction).slice(0, 5);
  for (const b of bots) { b.level = 10; S.pvp(w, b, p, clock.now(), { ignoreEnergy: true }); }
  assert.equal(S.attackBlock(bot('b9', 'villain', { level: 10 }), p, clock.now()), 'objetivo_protegido');
  const r = g.debug.addPlayer('Rival', 'villain');
  w.entities[r.id].level = 10;
  assert.equal(S.attackBlock(w.entities[r.id], p, clock.now()), null);
  void storage;
});

test('los duelos entre bots no suman a la guerra de facciones', () => {
  const w = { seed: 3, seq: 0, entities: {} };
  const a = bot('a', 'hero'), d = bot('d', 'villain');
  w.entities = { a, d };
  S.pvp(w, a, d, MON, { ignoreEnergy: true, duel: true });
  assert.deepEqual(S.factionScore(w, MON), { hero: 0, villain: 0 });
});

test('solicitudes de amistad: hay que aceptar; los bots contestan con demora; vencen a los 7 días', () => {
  const w = { seed: 4, seq: 0, entities: {} };
  const p = bot('p0', 'hero', { isBot: false }), q = bot('p1', 'villain', { isBot: false });
  w.entities = { p0: p, p1: q };
  assert.ok(So.addFriend(p, q, MON).pending);
  assert.ok(!(p.friends ?? []).includes('p1'));
  assert.equal(So.addFriend(p, q, MON).error, 'solicitud_enviada');
  assert.equal(So.pendingIn(q, MON)[0].id, 'p0');
  assert.ok(So.acceptFriend(q, p, MON).ok);
  assert.ok(p.friends.includes('p1') && q.friends.includes('p0'));
  // Rechazo y vencimiento
  const r = bot('p2', 'hero', { isBot: false });
  So.addFriend(r, p, MON);
  assert.ok(So.rejectFriend(p, 'p2').ok);
  So.addFriend(r, q, MON);
  assert.equal(So.pendingIn(q, MON + 8 * DAY).length, 0);
  assert.equal(So.acceptFriend(q, r, MON + 8 * DAY).error, 'sin_solicitud');
  // Bot: la decisión llega entre 1 y 6 h
  const b = bot('b1', 'villain');
  w.entities.b1 = b;
  So.addFriend(p, b, MON, w);
  const req = b.friendReq.in[0];
  assert.ok(req.replyAt >= MON + HOUR && req.replyAt <= MON + 6 * HOUR);
  So.botFriendship(w, b, p, req.replyAt, () => 1);
  assert.equal((p.friends ?? []).includes('b1'), req.accept);
});

test('regalos chicos y tope de recibidos por día', () => {
  const w = { seed: 2, seq: 0, entities: {} };
  const p = bot('p0', 'hero', { isBot: false });
  const out = [];
  for (let i = 0; i < 7; i++) { const b = bot(`g${i}`, 'villain'); So.addFriend(b, p, MON); So.acceptFriend(p, b, MON); out.push(So.sendGift(w, b, p, MON)); }
  assert.equal(out.filter((r) => r.ok).length, CFG.social.giftsReceivedPerDay);
  assert.equal(out.at(-1).error, 'buzon_lleno_hoy');
  for (const g of p.giftbox) {
    const it = ITEM[g.id];
    assert.equal(it.rarity, 'comun');
    assert.ok(it.size[0] * it.size[1] <= CFG.social.giftMaxCells);
  }
});

test('misión en curso: no se puede cazar; venganza ignora rango y cooldown, una vez', () => {
  const { g, clock } = newGame();
  const w = g.debug.world(), p = w.entities.p0;
  assert.ok(g.startMission('h1').ok);
  assert.equal(g.hunt().error, 'en_mision');
  assert.ok(g.targets().list.every((t) => t.block === 'en_mision'));
  g.cancelMission();
  // Un bot fuera de rango te ataca: podés vengarte aunque esté fuera de rango y sin esperar el cooldown.
  p.level = 10;
  const b = Object.values(w.entities).find((e) => e.isBot && e.faction !== p.faction);
  b.level = 10;
  assert.ok(S.pvp(w, b, p, clock.now(), { ignoreEnergy: true }).ok);
  b.level = 30; // después del ataque queda fuera de rango
  const rv = g.revenge().list;
  assert.equal(rv[0].id, b.id);
  assert.equal(rv[0].block, null);
  const a = g.attack(b.id);
  assert.ok(a.ok && a.report.revenge);
  assert.equal(g.revenge().list.length, 0);
  assert.equal(g.attack(b.id).error, 'fuera_de_rango'); // la venganza se usa una vez
});

test('equipo: variantes por slot, reforja al 50% y la de fábrica por defecto', () => {
  const e = bot('a', 'hero', { gold: 1e5, level: 10 });
  assert.ok(C.buyGear(e, 'arma', 1, 'agi').ok);
  assert.equal(C.effStat(e, 'agi'), 5 + CFG.gear.tiers[0].bonus);
  assert.equal(C.effStat(e, 'fue'), 5);
  assert.equal(C.buyGear(e, 'arma', 1, 'def').error, 'variante_invalida');
  const g0 = e.gold;
  const r = C.buyGear(e, 'arma', 1, 'fue');
  assert.ok(r.ok && r.reforge && g0 - e.gold === Math.round(C.itemPrice(CFG.gear.tiers[0]) * CFG.gear.reforgePct));
  assert.equal(C.buyGear(e, 'arma', 1, 'fue').error, 'ya_equipado');
  assert.ok(C.buyGear(e, 'armadura', 2).ok);
  assert.equal(C.effStat(e, 'def'), 5 + CFG.gear.tiers[1].bonus);
});

test('tienda: 4 fijos y 12 rotativos; la rareza sale con las probabilidades configuradas', () => {
  const p = bot('p0', 'hero', { isBot: false });
  const count = { comun: 0, raro: 0, epico: 0, legendario: 0 };
  let n = 0;
  for (let d = 0; d < 400; d++) {
    const list = Lr.dailyShop({ seed: 7 }, p, MON + d * DAY);
    assert.equal(list.filter((i) => !i.rotating).length, 4);
    for (const i of list.filter((x) => x.rotating)) { count[i.rarity]++; n++; }
  }
  for (const [r, pct] of Object.entries(CFG.lair.shopOdds)) assert.ok(Math.abs(count[r] / n - pct / 100) < 0.03, `${r}: ${(count[r] / n).toFixed(3)}`);
});

test('markAllRead: marca todos los informes sin leer y devuelve cuántos', () => {
  const { g } = newGame();
  for (let i = 0; i < 3; i++) g.hunt();
  for (const it of g.debug.world().entities.p0.inbox) it.read = false; // simula informes de defensa sin leer
  const before = g.inbox().list.filter((x) => !x.read).length;
  assert.ok(before > 0);
  const r = g.markAllRead();
  assert.deepEqual(r, { ok: true, count: before });
  assert.equal(g.inbox().list.filter((x) => !x.read).length, 0);
  assert.equal(g.state().unread, 0);
  assert.equal(g.markAllRead().count, 0);
});
