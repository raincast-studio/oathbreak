// Fachada única para cualquier cliente (debug HTML hoy, UI Chibi mañana, servidor en E6).
// Toda entrada externa se valida acá. Consultas (query) no escriben el guardado; comandos (command) sí.
import { CFG, CONTRACTS, HOUR, DAY } from './config.js';
import { createClock, memoryStorage, readSave, saveWorld, clearWorld, backupSave, mulberry32, deriveSeed, dayKey, weekKey, TAB_KEY, tabToken } from './core.js';
import * as C from './character.js';
import * as S from './systems.js';
import * as Lr from './lair.js';
import * as O from './objectives.js';
import { energyMax, energyRegenMin, grantItem } from './effects.js';
import { ITEM } from './catalog.js';
import { migrate } from './migrate.js';
import { hasKey, isInt, isPosInt, missionReward } from './economy.js';
import { track, touchSession, setTelemetrySink, wealth, trackGold } from './telemetry.js';
import * as So from './social.js';
import * as Se from './season.js';
import * as Mod from './moderation.js';
import * as BL from './bots.js';
// v17: los nicks de bots pasan por el mismo filtro que los nombres de jugadores.
BL.setBotNameFilter((n) => Mod.validateName(n).ok);

// v17: datos de bots para la interfaz. eco: distintivo «Eco» (solo con bots.label = 'eco'). Activo = entró en los
// últimos retire.activeDays días (bots: según su horario; los retirados quedan congelados en el día en que se fueron).
const ecoOf = (e) => (BL.isEco(e) ? { eco: true } : null);
const seenOf = (world, e, now) => (e.isBot ? BL.lastSeen(world, e, now) : e.lastSeen ?? e.createdAt ?? null);
const activeAt = (world, e, now) => { const t = seenOf(world, e, now); return t != null && now - t < CFG.bots.retire.activeDays * DAY; };

const err = (error, extra) => ({ ok: false, error, ...extra });
const clone = (x) => (x === undefined ? x : structuredClone(x));

// playerId: jugador al que representa esta fachada (en el navegador, el local; en E6, el autenticado).
// autosave: false solo para simulaciones masivas (el guardado se hace a mano con save()).
// onStale: la interfaz se entera de que otra pestaña tomó el guardado (B1).
export function createGame({ storage = memoryStorage(), clock = createClock(), seed, playerId, onEvent, autosave = true, onStale } = {}) {
  if (onEvent) setTelemetrySink(onEvent);
  let world = null;
  let saveIssue = null; // 'future' | 'corrupt' | null — bloquea crear personaje hasta resolverlo
  // v17 (B1): esta pestaña se anota como dueña del guardado al cargarlo; si otra se anota después, esta queda
  // desactualizada: no escribe más (rechaza la escritura vieja) hasta que el jugador elija "Jugar acá" (reload).
  let tab = null, stale = false;
  const peek = () => { try { return storage.getItem(TAB_KEY); } catch { return tab; } };
  const claim = () => { tab = tabToken(); stale = false; try { storage.setItem(TAB_KEY, tab); } catch { /* sin storage: una sola pestaña */ } };
  const markStale = () => { if (stale) return; stale = true; try { onStale?.(); } catch { /* la interfaz decide */ } };
  function load(initial) {
    world = null; saveIssue = null;
    const s = readSave(storage);
    if (s.status === 'ok') world = s.world;
    else if (s.status === 'old') {
      try { world = migrate(s.world, CFG.saveVersion); } catch { saveIssue = 'corrupt'; }
    } else if (s.status === 'future' || s.status === 'corrupt') saveIssue = s.status;
    if (world?.clockOffset || !initial) clock.offset = world?.clockOffset ?? 0;
    if (world) S.compactWorld(world, clock.now());
    claim();
  }
  load(true);

  const pid = () => playerId ?? world?.playerId;
  const P = () => (world && hasKey(world.entities, pid()) ? world.entities[pid()] : null);
  const ent = (id) => (world && hasKey(world.entities, id) ? world.entities[id] : null);
  const persist = (force = false) => {
    if (!autosave && !force) return;
    if (stale || peek() !== tab) { markStale(); return; } // B1: escritura de una pestaña vieja: se rechaza
    world.clockOffset = clock.offset; saveWorld(storage, world);
  };
  const isStale = () => { if (!stale && peek() !== tab) markStale(); return stale; };

  // Materializa el paso del tiempo (horas de bots, cierre semanal, energía, sesión). Devuelve true si hay algo que guardar.
  function advance(now) {
    const w0 = wealth(P());
    const ticked = S.tickBots(world, now) > 0;
    const prize = Lr.settleShowcase(world, now);
    const relays = S.ensureTargets(world, P(), now) > 0; // v17 (B2): nunca menos de bots.floor.targets rivales en tu rango
    trackGold(world, P(), 'world', w0, now); // v17: lo que pasó mientras no estabas (asaltos de bots, premios)
    C.sync(P(), now);
    const w1 = wealth(P()), back = comeback(P(), now);
    trackGold(world, P(), 'comeback', w1, now);
    const before = world.events?.length ?? 0;
    touchSession(world, P(), now);
    return ticked || !!prize || relays || back || (world.events?.length ?? 0) !== before;
  }
  // v17 (B2): bono de regreso tras ≥ comeback.days días sin entrar: energía llena, un cofre y un resumen de lo que pasó
  // (rivales nuevos de tu nivel, guerra de facciones, temporada nueva). La interfaz lo muestra en "Mientras no estabas".
  function comeback(p, now) {
    const K = CFG.bots.comeback, fresh = p.fresh ?? 0;
    delete p.fresh;
    const last = p.lastSeen;
    if (last == null || now - last < K.days * DAY) return false;
    const gold = missionReward(K.chestMissionMin, p.level).gold;
    p.energy = Math.max(p.energy, energyMax(p)); p.energyTs = now;
    p.gold += gold; p.lair.renown += K.renown;
    const war = world.lastPrize && world.lastPrize.week >= weekKey(last) ? world.lastPrize.faction : null;
    p.comeback = { ts: now, days: Math.floor((now - last) / DAY), gold, renown: K.renown, fresh,
      ...(war && { war: { winner: war.winner, hero: war.score.hero, villain: war.score.villain } }),
      ...(Se.seasonKey(last) !== Se.seasonKey(now) && { season: true }) };
    track(world, p, 'comeback', { days: p.comeback.days, fresh }, now);
    return true;
  }
  // Consulta: materializa el paso del tiempo y lee. Las funciones de lectura son puras (test: robustness
  // "las consultas no modifican el mundo") y el resultado es una copia: nunca expone referencias vivas.
  const query = (fn) => {
    if (isStale()) return err('otra_pestana');
    if (!world || !P()) return err('sin_personaje');
    const now = clock.now();
    if (advance(now)) persist();
    return clone(fn(P(), now));
  };
  // v17: src = categoría económica del comando en curso (la pone econWrap); el cambio de patrimonio sale como `gold`.
  let src = null;
  const command = (fn) => {
    if (isStale()) return err('otra_pestana');
    if (!world || !P()) return err('sin_personaje');
    const now = clock.now();
    advance(now);
    const w0 = wealth(P());
    const r = fn(P(), now);
    trackGold(world, P(), src ?? 'otro', w0, now);
    persist();
    return clone(r);
  };

  const api = {
    hasCharacter: () => !!P(),
    saveIssue: () => saveIssue,
    // v17 (B1): ¿otra pestaña tomó el guardado? reload(): "Jugar acá" (relee el guardado y esta pestaña pasa a ser la
    // dueña; la otra queda desactualizada). yieldTab(): otra pestaña avisó que abrió el juego (BroadcastChannel).
    isStale,
    reload: () => { load(); return { ok: true, hasCharacter: !!P() }; },
    yieldTab: () => { markStale(); return { ok: true }; },
    save: () => { if (world) persist(true); return { ok: !!world }; },
    // v15.1: ponerse al día con las horas de bots de a tramos (la interfaz lo llama al abrir y cede el hilo entre
    // tramos, para no congelar la pantalla al volver tras días afuera). Mismo mundo que hacerlo todo de una vez.
    // Guarda una sola vez, al terminar. pending: horas que faltan.
    catchUp(maxHours = 6) {
      if (isStale()) return err('otra_pestana');
      if (!world || !P()) return err('sin_personaje');
      if (!isPosInt(maxHours)) return err('horas_invalidas');
      const now = clock.now();
      const w0 = wealth(P());
      const hours = S.tickBots(world, now, maxHours);
      let pending = S.botHoursPending(world, now), relays = 0;
      // v17 (B2): al terminar las horas, los relevos que falten para el piso de rivales, de a pocos por tramo.
      if (!pending && (relays = S.ensureTargets(world, P(), now, CFG.bots.floor.relays))) {
        const d = S.targetDeficit(world, P(), now);
        pending = Math.min(d.miss, d.donors.length);
      }
      trackGold(world, P(), 'world', w0, now);
      if ((hours || relays) && !pending) persist();
      return { ok: true, hours, pending, ...(relays && { relays }) };
    },

    // Idempotencia: si un comando se reintenta con la misma clave (p. ej. por un corte de red), devuelve el resultado
    // original sin volver a ejecutarlo. Uso: game.withOp('uuid', () => game.buyStat('fue')).
    withOp(opId, thunk) {
      if (typeof opId !== 'string' || !opId || opId.length > 64) return err('op_invalida');
      if (isStale()) return err('otra_pestana');
      if (!world || !P()) return err('sin_personaje');
      world.ops ??= [];
      const hit = world.ops.find((o) => o.id === opId && o.pid === pid());
      if (hit) return clone({ ...hit.result, replayed: true });
      const result = thunk();
      world.ops.push({ id: opId, pid: pid(), result });
      if (world.ops.length > CFG.ops.max) world.ops.splice(0, world.ops.length - CFG.ops.max);
      persist();
      return clone(result);
    },

    // v17: el nombre pasa por la moderación (src/moderation.js). terms: versión de los Términos aceptada (clickwrap).
    newCharacter(name, faction, { terms } = {}) {
      if (isStale()) return err('otra_pestana');
      if (saveIssue) return err(saveIssue === 'future' ? 'guardado_de_version_futura' : 'guardado_ilegible');
      if (faction !== 'hero' && faction !== 'villain') return err('faccion_invalida');
      const vn = Mod.validateName(name);
      if (!vn.ok) return err(vn.error);
      name = vn.name;
      const now = clock.now();
      world = {
        version: CFG.saveVersion,
        seed: (seed ?? (Math.random() * 2 ** 32)) >>> 0,
        seq: 0, playerId: 'p0', players: [], entities: {}, botHour: Math.floor(now / HOUR), clockOffset: clock.offset,
        showcaseWeek: weekKey(now), events: [], ops: [],
      };
      S.createBots(world, now);
      const p = S.addPlayer(world, { id: 'p0', name, faction, now });
      if (typeof terms === 'string' && /^[\w.-]{1,20}$/.test(terms)) p.consent = { terms, ts: now };
      track(world, p, 'signup', { faction, ...(p.consent && { terms }) }, now);
      touchSession(world, p, now);
      persist();
      return { ok: true };
    },

    state() {
      return query((p, now) => ({
        ok: true, now,
        player: {
          id: p.id, name: p.name, faction: p.faction, level: p.level,
          xp: p.xp, xpNeed: CFG.xpNeed(p.level),
          maxHp: C.maxHp(p),
          energy: p.energy, energyMax: energyMax(p), nextEnergyMs: C.nextEnergyIn(p, now),
          // v15.1: cuánto falta para la energía llena, con la Enfermería (el aviso usaba el ritmo base: llegaba tarde).
          energyFullMs: p.energy >= energyMax(p) ? 0 : C.nextEnergyIn(p, now) + (energyMax(p) - p.energy - 1) * energyRegenMin(p) * 60_000,
          gold: p.gold, bank: p.bank, rep: p.rep, renown: p.lair.renown, record: p.record,
          stats: p.stats, effStats: C.effStats(p),
          statCosts: Object.fromEntries(CFG.stats.map((k) => [k, C.statCost(p, k)])),
          gear: p.gear, gearStat: Object.fromEntries(Object.keys(CFG.gear.slots).map((k) => [k, C.gearStatOf(p, k)])),
          newbieShield: p.level < CFG.pvp.newbieLevel, shield: S.shieldInfo(p),
          mission: p.mission && { ...p.mission, msLeft: Math.max(0, p.mission.end - now), done: now >= p.mission.end },
        },
        unread: p.inbox.filter((i) => !i.read).length,
        revenge: S.revengeList(p, now).length,
        friendRequests: So.pendingIn(p, now).length,
        faction: S.factionScore(world, now),
        lastPrize: world.lastPrize ?? null,
        comeback: p.comeback ?? null, // v17 (B2): bono de regreso por mostrar (ackComeback lo da por visto)
        event: (({ id, name, desc } = {}) => (id ? { id, name, desc } : null))(S.weekendEvent(now) ?? undefined),
      }));
    },

    // 31/10: bono de bienvenida por invitación (una sola vez, solo el primer día del personaje).
    welcomeBonus: (code) => command((p, now) => {
      code = String(code ?? '').trim().toUpperCase();
      // v14: mismo formato que generan las invitaciones (6 caracteres sin 0/O/1/I), solo personajes de menos de 1 día
      // (los guardados previos a la v13 no tienen fecha de creación: no cobran) y una sola vez.
      if (!new RegExp(CFG.referral.codeRe).test(code)) return err('codigo_invalido');
      if (p.referral) return err('ya_cobrado');
      if (!Number.isFinite(p.createdAt) || now - p.createdAt > DAY) return err('fuera_de_plazo');
      p.referral = { code, ts: now };
      p.gold += CFG.referral.newGold;
      grantItem(p, CFG.referral.item);
      track(world, p, 'referral', { code }, now);
      return { ok: true, gold: CFG.referral.newGold, item: CFG.referral.item };
    }),

    // v15: estado chico de la interfaz que viaja con la partida (y con la nube): tutorial y última etapa vista.
    uiState: () => query((p) => ({ ok: true, ui: p.ui ?? {} })),
    setUi: (key, value) => command((p) => {
      if (!['tutorial', 'stageSeen'].includes(key)) return err('clave_invalida');
      const json = JSON.stringify(value ?? null);
      if (json.length > 300) return err('valor_muy_grande');
      p.ui = { ...(p.ui ?? {}), [key]: JSON.parse(json) };
      return { ok: true };
    }),

    ackComeback: () => command((p) => { const had = !!p.comeback; delete p.comeback; return { ok: true, had }; }),

    // Personaje
    buyStat: (k) => command((p, now) => {
      if (!CFG.stats.includes(k)) return err('stat_invalido');
      const r = C.buyStat(p, k);
      if (r.ok) { O.bump(world, p, 'stat', now); track(world, p, 'spend', { what: 'stat', gold: r.cost }, now); }
      return r;
    }),
    // Reparto automático: gasta todo el oro posible siguiendo pesos {fue, def, agi, res} (botón "Distribuir").
    autoSpend: (weights, keepGold = 0) => command((p, now) => {
      if (!weights || typeof weights !== 'object' || !CFG.stats.every((k) => Number.isFinite(weights[k]) && weights[k] > 0)) return err('pesos_invalidos');
      if (!Number.isInteger(keepGold) || keepGold < 0) return err('monto_invalido');
      const before = C.totalPoints(p), g0 = p.gold;
      const wallet = Math.max(0, p.gold - keepGold);
      p.gold = wallet; S.spendByWeights(p, weights, 0); p.gold += g0 - wallet;
      const bought = C.totalPoints(p) - before;
      if (bought) { O.bump(world, p, 'stat', now, bought); track(world, p, 'spend', { what: 'stat', gold: g0 - p.gold, points: bought }, now); }
      return { ok: true, points: bought, gold: g0 - p.gold };
    }),
    // Equipo: por slot y tier, las variantes posibles (atributo y bonus), precio, y precio de reforja si ya lo tenés.
    shop: () => query((p) => ({
      ok: true,
      items: Object.keys(CFG.gear.slots).flatMap((slot) => CFG.gear.tiers.map((t) => ({
        slot, tier: t.tier, stat: C.gearOptions(slot)[0], bonus: C.tierBonus(t, C.gearOptions(slot)[0]),
        options: C.gearOptions(slot).map((st) => ({ stat: st, bonus: C.tierBonus(t, st) })),
        req: t.req, price: C.itemPrice(t), owned: (p.gear[slot] ?? 0) >= t.tier,
        current: (p.gear[slot] ?? 0) === t.tier ? C.gearStatOf(p, slot) : null,
        reforgePrice: Math.round(C.itemPrice(t) * CFG.gear.reforgePct),
      }))),
    })),
    buyGear: (slot, tier, stat) => command((p, now) => {
      const r = C.buyGear(p, slot, tier, stat);
      if (r.ok) track(world, p, 'spend', { what: 'gear', gold: r.price, tier }, now);
      return r;
    }),

    // Misiones
    contracts: () => query((p) => ({ ok: true, list: S.contractsFor(p) })),
    startMission: (id) => command((p, now) => {
      const r = S.startMission(p, id, now);
      if (r.ok) track(world, p, 'mission_start', { id, min: Math.round((r.mission.end - r.mission.start) / 60_000) }, now);
      return r;
    }),
    cancelMission: () => command((p, now) => {
      const m = p.mission, r = S.cancelMission(p);
      if (r.ok) track(world, p, 'mission_cancel', { id: m.id, left: Math.max(0, Math.round((m.end - now) / 60_000)) }, now);
      return r;
    }),
    claimMission: () => command((p, now) => S.claimMission(p, now, mulberry32(deriveSeed(world)), world)),

    // Objetivos diarios
    daily: () => query((p, now) => ({ ok: true, ...O.dailyStatus(world, p, now) })),
    claimDaily: (id) => command((p, now) => O.claimDaily(world, p, id, now)),

    // Banco
    deposit: (n) => command((p) => S.deposit(p, n)),
    withdraw: (n) => command((p) => S.withdraw(p, n)),

    // PvP
    targets: () => query((p, now) => ({
      ok: true,
      list: Object.values(world.entities)
        .filter((e) => e.faction !== p.faction && S.inRange(p, e) && !BL.gone(e, now)) // v17: los bots retirados ya no figuran
        .map((e) => ({ id: e.id, name: e.name, level: e.level, ...ecoOf(e), band: S.powerBand(p, e), loot: S.lootEstimate(e),
          prey: e.id === S.preyOf(world, p, now) && p.preyDone !== dayKey(now), block: S.attackBlock(p, e, now, { ignoreEnergy: true }) }))
        .sort((a, b) => b.prey - a.prey || a.level - b.level),
    })),
    attack: (id) => command((p, now) => {
      const d = ent(id);
      if (d) S.fixPrey(world, p, now);
      return d ? S.pvp(world, p, d, now) : err('objetivo_invalido');
    }),
    // "Cazar": ataca a un objetivo válido al azar; si no puede, explica por qué (energía u objetivos).
    hunt: () => command((p, now) => {
      if (p.mission) return err('en_mision');
      if (p.energy < CFG.energy.pvpCost) return err('sin_energia');
      // La presa del día no sale al azar: hay que ir a buscarla desde la lista de objetivos.
      S.fixPrey(world, p, now);
      const prey = p.preyDone === dayKey(now) ? null : S.preyOf(world, p, now);
      const pool = Object.values(world.entities).filter((e) => e.id !== prey && !S.attackBlock(p, e, now));
      if (!pool.length) return err('sin_objetivos');
      return S.pvp(world, p, mulberry32(deriveSeed(world)).pick(pool), now);
    }),

    // Guarida
    lair: () => query((p, now) => ({
      ok: true,
      buildings: Lr.buildingInfo(p),
      workshop: Lr.workshopInfo(p, now),
      rooms: p.lair.rooms.map((r, i) => ({ floor: r.floor ?? 'piso_piedra', wall: r.wall ?? 'pared_ladrillo', items: p.lair.placed.filter((x) => x.room === i) })),
      nextRoom: p.lair.rooms.length < CFG.lair.room.max ? CFG.lair.room.unlock[p.lair.rooms.length] : null,
      inventory: p.lair.inventory.map((i) => ({ ...i, item: ITEM[i.id], recycle: Lr.sellValue(i, now), ...(i.gifted && { sellableAt: Lr.giftSellableAt(i) }) })),
      prestige: Lr.prestige(p),
      visits: Lr.visitStatus(p, now),
      guestbook: p.lair.guestbook.filter((g) => !p.muted?.includes(g.id)).map((g) => ({ ...g, ...ecoOf(world.entities[g.id]) })), // v17: sin firmas de silenciados; marca Eco
    })),
    upgradeBuilding: (k) => command((p, now) => {
      const r = Lr.upgradeBuilding(p, k, now);
      if (r.ok) track(world, p, 'spend', { what: 'building', key: k, gold: r.price, level: r.level }, now);
      return r;
    }),
    claimWorkshop: () => command((p, now) => Lr.claimWorkshop(world, p, now)),
    buyRoom: () => command((p) => Lr.buyRoom(p)),
    lairShop: () => query((p, now) => ({ ok: true, list: Lr.dailyShop(world, p, now) })),
    myPublicLair: () => query((p, now) => ({ ok: true, ...Lr.lairSnapshot(p, now) })),
    renownShop: () => query((p) => ({ ok: true, renown: p.lair.renown, list: Lr.renownShop() })),
    buyItem: (id) => command((p, now) => Lr.buyItem(world, p, id, now)),
    buyRenownItem: (id) => command((p) => Lr.buyRenownItem(p, id)),
    placeItem: (uid, room, x, y, rot = 0) => command((p) => Lr.placeItem(p, uid, room, x, y, rot)),
    autoPlace: (uid) => command((p) => Lr.autoPlace(p, uid)),
    removeItem: (uid) => command((p) => Lr.removeItem(p, uid)),
    recycleItem: (uid) => command((p, now) => Lr.recycleItem(p, uid, now)),
    visit: (id, applaud = true) => command((p, now) => {
      const h = ent(id);
      return h ? Lr.visit(world, p, h, now, { applaud: applaud !== false }) : err('guarida_invalida');
    }),
    showcase: (faction, league) => query((p, now) => {
      if (faction != null && faction !== 'hero' && faction !== 'villain') return err('faccion_invalida');
      if (league != null && !CFG.lair.leagues.some((l) => l.id === league)) return err('liga_invalida');
      return { ok: true, myLeague: Lr.leagueOf(p.level), list: Lr.showcase(world, now, faction, weekKey(now), league) };
    }),

    // Amigos y regalos
    friends: () => query((p, now) => ({
      ok: true, ...So.giftStatus(p, now), max: CFG.social.maxFriends,
      // v17: seen = última vez activo; inactive = no entra hace retire.activeDays días (un amigo bot que se retiró
      // sigue en la lista, marcado como inactivo).
      list: (p.friends ?? []).filter((id) => world.entities[id]).map((id) => {
        const f = world.entities[id], seen = seenOf(world, f, now);
        return { id, name: f.name, faction: f.faction, level: f.level, ...ecoOf(f), giftedToday: So.giftStatus(p, now).sentTo.includes(id),
          seen, inactive: BL.gone(f, now) || !activeAt(world, f, now) };
      }),
      giftbox: (p.giftbox ?? []).filter((g) => !p.muted?.includes(g.from)).map((g) => ({ ...g, name: ITEM[g.id].name })),
      requests: So.pendingIn(p, now).filter((r) => world.entities[r.id] && !p.muted?.includes(r.id)).map(({ id, name, faction, level, ts }) => ({ id, name, faction, level, ts, ...ecoOf(world.entities[id]) })),
      sent: So.pendingOut(p, now).filter((r) => world.entities[r.id]).map(({ id, ts }) => ({ id, ts, name: world.entities[id].name, faction: world.entities[id].faction, level: world.entities[id].level, ...ecoOf(world.entities[id]) })),
      // v17: jugadores reales activos para sumar (los de tu rango primero), sobre todo cuando un amigo quedó inactivo.
      suggest: (world.players ?? []).map((id) => world.entities[id])
        .filter((e) => e && e.id !== p.id && !(p.friends ?? []).includes(e.id) && !So.pendingOut(p, now).some((r) => r.id === e.id) && activeAt(world, e, now))
        .sort((a, b) => S.inRange(p, b) - S.inRange(p, a) || Math.abs(a.level - p.level) - Math.abs(b.level - p.level)).slice(0, 3)
        .map((e) => ({ id: e.id, name: e.name, faction: e.faction, level: e.level })),
    })),
    // Amistad por solicitud: el otro tiene que aceptar (los bots contestan en 1–6 h).
    addFriend: (id) => command((p, now) => {
      const f = ent(id), r = f ? So.addFriend(p, f, now, world) : err('jugador_invalido');
      if (r.ok) track(world, p, 'friend_request', { to: f.isBot ? 'bot' : 'player' }, now);
      return r;
    }),
    acceptFriend: (id) => command((p, now) => {
      const f = ent(id), r = f ? So.acceptFriend(p, f, now) : err('jugador_invalido');
      if (r.ok) track(world, p, 'friend_accept', { from: f.isBot ? 'bot' : 'player' }, now);
      return r;
    }),
    rejectFriend: (id) => command((p) => So.rejectFriend(p, id)),
    cancelRequest: (id) => command((p) => { const f = ent(id); return f ? So.cancelRequest(p, f) : err('jugador_invalido'); }),
    removeFriend: (id) => command((p) => So.removeFriend(p, id, ent(id))),
    sendGift: (id) => command((p, now) => { const f = ent(id); return f ? So.sendGift(world, p, f, now) : err('jugador_invalido'); }),
    openGifts: () => command((p, now) => {
      if (p.muted?.length) p.giftbox = (p.giftbox ?? []).filter((g) => !p.muted.includes(g.from));
      const r = So.openGifts(p);
      if (r.ok && r.opened) track(world, p, 'gift_open', { n: r.opened }, now);
      return r;
    }),

    // v17 · Confianza. Reportar: valida y devuelve el reporte compacto (la interfaz lo encola y lo manda a la nube).
    reportPlayer: (id, reason, note, where, ref) => command((p, now) => {
      const e = ent(id);
      if (!e || id === p.id) return err('jugador_invalido');
      const r = Mod.makeReport({ target: e, reason, note, where, ref, now });
      if (r.ok) track(world, p, 'report', { reason: r.report.r, where: r.report.w }, now);
      return r;
    }),
    // Silenciar: oculta sus solicitudes, regalos y firmas (y rechaza la solicitud pendiente). on=false lo quita.
    mute: (id, on = true) => command((p) => {
      const e = ent(id);
      if (!e || id === p.id) return err('jugador_invalido');
      const list = (p.muted ?? []).filter((x) => x !== id);
      if (on) {
        if (list.length >= Mod.MUTE_MAX) list.shift();
        list.push(id);
        So.rejectFriend(p, id); // si no había solicitud, no hace nada
      }
      p.muted = list;
      return { ok: true, muted: !!on };
    }),
    muted: () => query((p) => ({ ok: true, list: (p.muted ?? []).filter((id) => world.entities[id]).map((id) => ({ id, name: world.entities[id].name, faction: world.entities[id].faction })) })),
    // Descargar mis datos: el guardado completo, tal cual (JSON).
    exportData: () => (world ? JSON.stringify(world) : null),

    // Temporada
    season: () => query((p, now) => ({ ok: true, ...Se.seasonStatus(p, now) })),
    claimSeasonTier: (tier) => command((p, now) => { const r = Se.claimTier(p, tier, now); if (r.ok) track(world, p, 'season_claim', { tier }, now); return r; }),
    // Guaridas sugeridas: quienes te visitaron, destacadas y el resto; marca si hoy todavía rinde recompensa.
    visitSuggestions: () => query((p, now) => {
      const seen = new Set(Lr.todaysVisits(p, now).hosts);
      // v17: jugadores reales activos antes que el resto; los bots que se están yendo solo si son amigos o te visitaron.
      const mine = new Set([...(p.friends ?? []), ...p.lair.guestbook.map((g) => g.id)]);
      const ids = [...new Set([
        ...(p.friends ?? []),
        ...p.lair.guestbook.map((g) => g.id),
        ...(world.players ?? []).filter((id) => world.entities[id] && activeAt(world, world.entities[id], now)),
        ...Lr.showcase(world, now).slice(0, 8).map((x) => x.id),
        ...Object.keys(world.entities),
      ])].filter((id) => id !== p.id && world.entities[id] && (mine.has(id) || BL.retireStage(world.entities[id], now) < 2)).slice(0, 40);
      return { ok: true, list: ids.map((id) => {
        const e = world.entities[id];
        return { id, name: e.name, faction: e.faction, level: e.level, ...ecoOf(e), prestige: Lr.prestige(e).total, visitedToday: seen.has(id),
          friend: (p.friends ?? []).includes(id), returning: p.lair.guestbook.some((g) => g.id === id),
          requested: So.pendingOut(p, now).some((r) => r.id === id) };
      }) };
    }),

    // Venganza: quienes te atacaron en las últimas 24 h y todavía podés devolverles el ataque (sin rango ni cooldown).
    revenge: () => query((p, now) => ({
      ok: true,
      list: S.revengeList(p, now).filter((r) => world.entities[r.id]).map((r) => {
        const e = world.entities[r.id];
        return { id: e.id, name: e.name, level: e.level, faction: e.faction, ...ecoOf(e), ts: r.ts, stolen: r.loot, loot: S.lootEstimate(e),
          band: S.powerBand(p, e), block: S.attackBlock(p, e, now, { ignoreEnergy: true }) };
      }),
    })),
    // Ranking de la facción rival por reputación (los fuera de rango figuran, pero bloqueados).
    ranking: () => query((p, now) => ({
      ok: true,
      list: Object.values(world.entities).filter((e) => e.faction !== p.faction && !BL.unlisted(e, now)).sort((a, b) => b.rep - a.rep || b.level - a.level).slice(0, 20) // v17: sin Ecos ni bots que se retiran
        .map((e, i) => ({ pos: i + 1, id: e.id, name: e.name, level: e.level, rep: e.rep, loot: S.lootEstimate(e),
          band: S.inRange(p, e) ? S.powerBand(p, e) : null, block: S.attackBlock(p, e, now, { ignoreEnergy: true }) })),
    })),

    // Informes
    inbox: () => query((p) => ({ ok: true, list: p.inbox.map(({ report, role, read }) => ({ report, role, read })) })),
    markRead: (reportId) => command((p) => {
      const it = p.inbox.find((i) => i.report.id === reportId);
      if (it) it.read = true;
      return { ok: !!it };
    }),
    // Marca todos los informes como leídos; devuelve cuántos cambió.
    markAllRead: () => command((p) => {
      let n = 0;
      for (const it of p.inbox) if (!it.read) { it.read = true; n++; }
      return { ok: true, count: n };
    }),

    // Debug (solo para pruebas; en producción no existe)
    debug: {
      advance(ms) { if (isInt(ms, 1, 400 * 24 * HOUR)) { clock.advance(ms); if (world) persist(); } },
      // Salta al próximo inicio de día (00:00 ART) o de semana (lunes 00:00 ART).
      toNext(unit) {
        const now = clock.now(), d = dayKey(now);
        const targetDay = unit === 'week' ? (weekKey(now) + 1) * 7 - 3 : d + 1;
        const ts = targetDay * 86_400_000 - CFG.dayOffsetMs;
        clock.advance(ts - now);
        if (world) persist();
      },
      reset() { clearWorld(storage); world = null; saveIssue = null; clock.offset = 0; },
      exportSave: () => (world ? JSON.stringify(world) : null),
      importSave(json) {
        let w;
        try { w = JSON.parse(json); } catch { return err('json_invalido'); }
        if (!w || !Number.isInteger(w.version) || w.version > CFG.saveVersion || !w.entities || !w.playerId) return err('guardado_invalido');
        try { w = migrate(w, CFG.saveVersion); } catch { return err('guardado_invalido'); }
        if (world) backupSave(storage, JSON.stringify(world));
        world = w; saveIssue = null; clock.offset = w.clockOffset ?? 0;
        persist();
        return { ok: true };
      },
      discardBadSave() { const s2 = readSave(storage); backupSave(storage, s2.raw); clearWorld(storage); saveIssue = null; return { ok: true }; },
      worldPanel: () => query((p, now) => ({
        ok: true, seed: world.seed,
        bots: Object.values(world.entities).filter((e) => e.isBot).map((b) => ({
          id: b.id, name: b.name, faction: b.faction, level: b.level, arch: b.arch, power: S.power(b), powerVsYou: +(S.power(b) / S.power(p)).toFixed(2),
          gold: b.gold, prestige: Lr.prestige(b).total, anchor: b.anchor, retire: BL.retireStage(b, now), seen: BL.lastSeen(world, b, now), // v17
        })).sort((a, b) => a.level - b.level),
      })),
      world: () => world,
      events: () => clone(world?.events ?? []),
      // Agrega otro jugador real al mismo mundo (para probar multijugador). Devuelve su id.
      addPlayer(name, faction) {
        if (!world) return err('sin_mundo');
        if (faction !== 'hero' && faction !== 'villain') return err('faccion_invalida');
        const id = `p${world.players.length}`;
        S.addPlayer(world, { id, name: String(name).slice(0, 16), faction, now: clock.now() });
        persist();
        return { ok: true, id };
      },
    },
  };
  // v17: cada comando anota su categoría económica (fuente si el patrimonio sube, sumidero si baja). Sin entrada en
  // ECON_SRC, la categoría es el nombre del comando. Lo que pasa al materializar el tiempo va como 'world'.
  for (const k of Object.keys(api)) {
    const f = api[k];
    if (typeof f !== 'function' || NO_ECON.has(k)) continue;
    api[k] = (...a) => { const prev = src; src = ECON_SRC[k] ?? k; try { return f(...a); } finally { src = prev; } };
  }
  return api;
}
const NO_ECON = new Set(['hasCharacter', 'saveIssue', 'save', 'catchUp', 'withOp', 'newCharacter', 'exportData', 'isStale', 'reload', 'yieldTab']);
const ECON_SRC = {
  attack: 'pvp', hunt: 'pvp', buyStat: 'stat', autoSpend: 'stat', buyGear: 'gear', startMission: 'mission', cancelMission: 'mission',
  claimMission: 'mission', claimDaily: 'daily', deposit: 'bank', withdraw: 'bank', upgradeBuilding: 'building', claimWorkshop: 'workshop',
  buyRoom: 'room', buyItem: 'decor', recycleItem: 'recycle', visit: 'visit', sendGift: 'gift', openGifts: 'gift', welcomeBonus: 'referral',
  claimSeasonTier: 'season',
};

export { CFG, CONTRACTS };
export { ITEM } from "./catalog.js"; // datos del catálogo (nombre, tamaño, rareza) para dibujar; las reglas siguen acá
