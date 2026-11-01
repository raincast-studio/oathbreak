// Todas las constantes de balance en un solo lugar (tunear acá, no en los sistemas).
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const CFG = {
  saveVersion: 5,
  dayOffsetMs: -3 * HOUR, // reset diario a las 00:00 ART
  stats: ['fue', 'def', 'agi', 'res'],
  start: { stat: 5, gold: 250 }, // 31/10: 250 para poder mejorar 2 atributos en la primera sesión

  // Post-15 la curva se empina +4% por nivel (más difícil progresar).
  xpNeed: (lvl) => Math.round(100 * lvl ** 1.4 * (1 + 0.04 * Math.max(0, lvl - 15))),
  // Costo de un punto según el TOTAL de puntos (repartir no es más barato que especializarse) × multiplicador por stat.
  statCost: (totalPoints) => 10 * (totalPoints / 4) ** 1.5,
  statCostMul: { fue: 1.8, def: 0.4, agi: 1, res: 0.4 }, // calibrado con sim/model.js para que ninguna build domine
  // 31/10: al empezar (hasta 20 puntos totales) Fue es más barata y Def/Res más caras, para que el triángulo se cumpla desde el
  // primer día (antes, con 600 de oro, las builds iban de 36% a 74%). Se mezcla linealmente con statCostMul hasta los 28 puntos.
  statCostMulEarly: { fue: 1.6, def: 0.6, agi: 1, res: 0.5 }, statCostBlend: [20, 28],

  hp: { base: 50, perRes: 8 }, // cada combate arranca con la vida completa: el único recurso limitante es la energía
  energy: { max: 12, regenMin: 20, pvpCost: 1 },

  combat: {
    rounds: 5,
    dmgVar: [0.85, 1.15],
    dmgMult: 2.5,      // golpe = 2.5 × Fue − 1.3 × Def, mínimo 20% del golpe bruto
    armorK: 1.3,
    armorFloor: 0.2,
    dodgeCap: 0.9,     // esquive = 90% × Agi/(Agi + Agi_rival) → 45% en paridad
    doubleCap: 1.2,    // doble golpe = min(1, 1.2 × Agi/(Agi + Agi_rival)) → 60% en paridad
    doubleMult: 1,
    critBasePct: 5,
    critSpanPct: 25,   // crit = 5% + 25% × Agi/(Agi + Agi_rival)
    critMult: 1.6,
  },

  pvp: {
    lootPct: 0.10,
    xpWinMissionMin: 19,   // XP de victoria = XP de misión de N min al nivel del rival (20/10: PvP ≥ 50% de la XP del jugador activo)
    xpLosePct: 0.2,        // la derrota da 20% de eso
    newbieLevel: 5,        // jugadores reales bajo este nivel no pueden ser atacados
    // 31/10: el escudo se retira de a poco: en Nv 5, 6 y 7 se pueden recibir como máximo 1, 2 y 3 ataques por día (de jugadores y de bots).
    shieldFade: [1, 2, 3],
    // Recompensa del defensor que gana: oro de misión de N min al nivel del atacante × poder atk/def (acotado).
    defenseBounty: { missionMin: 30, ratioMin: 0.5, ratioMax: 1.5, minAttackerChance: 0.2, perPairPerDay: 1, minAttackerWinrate: 0.25, recentWindow: 20, recentMin: 5 },
    repWin: 1,
    sameTargetCooldownMin: 60,
    maxReceivedPerDay: 5,     // ataques de jugadores reales que se pueden recibir por día
    maxBotAttacksPerDay: 5,   // cupo aparte para ataques de bots
    rangeAbs: 3,
    rangePct: 0.2,
    riskXpMin: 0.7, riskXpMax: 1.4, // XP de victoria × (1.6 − chance estimada de ganar)
    // Oro de victoria creado por el sistema (además del botín): oro de misión de N min al nivel del rival × riesgo.
    winGoldMissionMin: 20, // 20/10: con el botín y las defensas, PvP ≈ 48% del oro del jugador activo
    revengeH: 24, // venganza: durante 24 h podés atacar a quien te atacó, ignorando rango, cooldown y escudo de novato
  },

  bank: { depositFee: 0.10 },

  missions: { goldBase: 2.0, xpBase: 3.2, exp: 0.8, lvlFactor: 0.1 }, // 20/10: bajan para que cazar rinda más que trabajar

  gear: {
    // 20/10: bonus ×0.4 (el equipo pasa de ~60% a ~35–40% de los atributos efectivos) y precio proporcional.
    priceK: 20,
    tiers: [ // metas espaciadas cada ~10 días de juego activo
      { tier: 1, req: 1, bonus: 1 },
      { tier: 2, req: 10, bonus: 3 },
      { tier: 3, req: 20, bonus: 6 },
      { tier: 4, req: 32, bonus: 10 },
      { tier: 5, req: 45, bonus: 14 },
      { tier: 6, req: 60, bonus: 18 },
      { tier: 7, req: 75, bonus: 24 },
    ],
    // Variantes: cada pieza se compra para uno de sus atributos (la primera es la de fábrica). '*' = la mitad a todos.
    slots: { arma: ['fue', 'agi'], armadura: ['def', 'res'], botas: ['agi', 'def'], casco: ['res', 'fue'], amuleto: ['*'] },
    reforgePct: 0.5, // cambiar la variante de una pieza que ya tenés cuesta 50% de su precio
  },

  lair: {
    // Edificios: costo = base × 2.2^(nivel−1); nivel de jugador requerido por nivel de edificio.
    costGrowth: 2.2,
    reqLevel: [1, 5, 10, 20, 30],
    buildings: {
      boveda:     { name: 'Bóveda',          base: 300, values: [0.10, 0.20, 0.30, 0.40, 0.50] }, // % oro en mano protegido
      enfermeria: { name: 'Enfermería',      base: 250, values: [19, 18, 17, 16, 15] },           // min por punto de energía (hoy 20)
      generador:  { name: 'Generador',       base: 400, values: [13, 14, 15, 16, 18] },           // energía máx
      taller:     { name: 'Taller',          base: 350, values: [0.04, 0.07, 0.10, 0.14, 0.18] }, // × oro de misión 1 h, por hora
      torre:      { name: 'Torre de vigía',  base: 450, values: [0.03, 0.06, 0.09, 0.12, 0.15] }, // +% Def/Agi al defender
    },
    workshopCapH: 12,
    room: { w: 8, h: 8, max: 4, unlock: [null, { lvl: 5, price: 1500 }, { lvl: 15, price: 8000 }, { lvl: 30, price: 30000 }] },
    rarity: {
      comun:      { prestige: 1,  price: 150,   weight: 40 },
      raro:       { prestige: 5,  price: 900,   weight: 60 },
      epico:      { prestige: 20, price: 4000,  weight: 32 },
      legendario: { prestige: 80, price: 15000, weight: 8 },
    },
    setBonus: 0.5,
    recyclePct: 0.25,
    shopSlots: 12, // rotativos por día (más 4 fijos)
    shopOdds: { comun: 45, raro: 37, epico: 15, legendario: 3 }, // % por casilla rotativa: primero la rareza, después el objeto
    dropChancePerHour: 0.02, // por hora de misión cobrada (8 h → 16%)
    visit: {
      goldMissionMin: 4, xp: 5, rewardedCap: 10, renownCap: 30,
      hostBoostPct: 0.01, hostBoostMax: 10, hostBoostMin: 60,
      streakMinVisits: 3, streak7Item: 'trofeo_racha', streak30Rarity: 'raro', shieldsPerWeek: 1,
      guestbookMax: 30, guestbookMaxBot: 3, // 31/10: los bots guardan menos firmas (40 bots × 30 firmas pesaban ~115 KB)
      hostTipPct: 0.5, hostTipCap: 10, hostRenownCap: 20, // anfitrión: propina = 50% del oro del visitante, tope 10/día; +1 renombre por visitante único
      applauseWeight: 2, // escaparate = prestigio + 2 × aplaudidores únicos de la semana
      prize: { top: 3, renown: 50 }, // premio semanal del escaparate: top 3 por facción y por liga
      dupFactor: 0.5,   // la 2ª copia de un mismo objeto vale 50% de prestigio, la 3ª 25%, etc.
      streakNeedsGift: true, // la racha del día pide 3 visitas y 1 regalo
    },
    leagues: [ { id: 'novatos', name: 'Novatos', min: 1 }, { id: 'veteranos', name: 'Veteranos', min: 15 }, { id: 'leyendas', name: 'Leyendas', min: 30 } ],
    pvpTrophyWins: 100,
  },

  social: {
    maxFriends: 50, giftsPerDay: 5, giftboxMax: 30, senderRenown: 1, botGiftChancePerHour: 0.03,
    // Regalos chicos: solo comunes de hasta 2 casillas; tope de recibidos por día; vendibles a los 3 días por 15 de oro.
    giftMaxCells: 2, giftsReceivedPerDay: 5, giftSellDays: 3, giftSellGold: 15,
    // Solicitudes de amistad: vencen a los 7 días; máximo 20 enviadas pendientes; los bots contestan con demora.
    requestTtlDays: 7, maxOutgoing: 20, botAcceptChance: 0.7, botReplyH: [1, 6], botRequestChancePerHour: 0.01,
  },

  season: {
    weeks: 4, tiers: 30, gloryPerTier: 160, // 31/10: antes 130 (el pase se completaba antes de tiempo)
    renownPerTier: 15, goldMissionMin: 60,
    glory: { win: 3, visit: 2, gift: 3, daily: 5, bonus: 10, mission: 2, prey: 10, faction: 50 },
    cosmetics: { 10: 'temp_aura', 20: 'temp_estatua', 30: 'temp_portal' },
  },

  // 31/10: evento de fin de semana (sábado y domingo, ART): más XP por ganar en la Arena y Gloria doble por victoria.
  events: { weekend: { name: 'Fin de semana de caza', days: [6, 0], xpWinMult: 1.25, gloryWinMult: 2 } },
  // 31/10: invitar amigos. El invitado recibe oro al crear su personaje; el premio del que invita llega con el servidor (E6).
  referral: { newGold: 300 },

  faction: { minWins: 5, renown: 20 }, // premio semanal a la facción ganadora (miembros con ≥ 5 victorias)

  prey: { xpMult: 2, goldMissionMin: 30 }, // presa del día: un rival marcado que paga doble XP y un bono de oro

  daily: {
    count: 3,
    rewardMissionMin: 30, // cada objetivo: oro y XP de misión de 30 min
    bonusMissionMin: 60, bonusRenown: 10, // completar los 3
    pool: [
      { id: 'win', name: 'Ganá 3 cazas', target: 3 },
      { id: 'visit', name: 'Visitá 3 guaridas', target: 3 },
      { id: 'mission', name: 'Cobrá 2 misiones', target: 2 },
      { id: 'workshop', name: 'Cobrá el Taller', target: 1 },
      { id: 'stat', name: 'Mejorá 2 atributos', target: 2 },
      { id: 'hunt', name: 'Salí a cazar 5 veces', target: 5 },
      { id: 'gift', name: 'Mandá 2 regalos', target: 2 },
      { id: 'prey', name: 'Derrotá a tu presa del día', target: 1 },
    ],
  },

  reports: { max: 25, detailed: 5 }, // 31/10: guardado ≤ 120 KB — solo los 5 informes más nuevos guardan las rondas
  bots: { count: 40, maxCatchUpHours: 72, attackChancePerHour: 0.04, incomeEff: 0.85, reservePct: 0.2, handGoldMissionMin: 60, wealth: [0.3, 2.5], visitChancePerHour: 0.25, duelChancePerHour: 0.3 },
  telemetry: { max: 60, sessionGapMin: 30 }, // 31/10: antes 500 (50 KB del guardado); en E6 va al servidor
  ops: { max: 50 },
  // Emparejamiento de bots por probabilidad de victoria estimada (no por "poder" lineal).
  matchmaking: { samples: 16, playerWr: { base: 0.66, from: 15, perLvl: 0.008, min: 0.52, early: [[2, 0.8], [4, 0.72]] }, skillSpread: 0.1, band: 0.06, scaleUp: 1.04, scaleDown: 0.98, scaleMin: 0.5, scaleMax: 2 },
  ui: { huntLoadingMs: 2000 }, // pantalla "cazando…" fija (decisión del dueño 20/10: no se puede saltar)
};

export const CONTRACTS = {
  hero: [
    { id: 'h1', name: 'Patrullar el barrio', min: 15 },
    { id: 'h2', name: 'Escoltar una caravana', min: 60 },
    { id: 'h3', name: 'Desarticular una banda', min: 120 },
    { id: 'h4', name: 'Rescate en la torre', min: 240 },
    { id: 'h5', name: 'Asedio a la guarida', min: 480 },
    { id: 'h6', name: 'Vigilia de la ciudad', min: 720 },
  ],
  villain: [
    { id: 'v1', name: 'Extorsionar comerciantes', min: 15 },
    { id: 'v2', name: 'Asaltar un blindado', min: 60 },
    { id: 'v3', name: 'Sabotear la central', min: 120 },
    { id: 'v4', name: 'Robar el banco', min: 240 },
    { id: 'v5', name: 'Golpe al ayuntamiento', min: 480 },
    { id: 'v6', name: 'Noche de saqueo', min: 720 },
  ],
};
