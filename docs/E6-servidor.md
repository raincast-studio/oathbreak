# E6: diseño del servidor autoritativo (pospuesto por decisión del dueño)

Hoy toda la lógica corre en el navegador con bots, así que no hay secretos: la semilla, el reloj y el guardado viven en el cliente. Este documento fija cómo pasar la lógica actual a un servidor **sin reescribirla**. El código ya está preparado para eso:
- `game.js` separa **consultas** (puras, sin escritura; hay un test que lo verifica) de **comandos**.
- La fachada recibe `playerId` y el mundo admite N jugadores (`addPlayer`), con bandeja por jugador.
- Las horas de los bots se procesan por índice de hora con semilla propia, así que el resultado es idéntico corra donde corra.
- `withOp` da idempotencia por clave.
- `telemetry.track` emite eventos de producto y acepta un *sink* externo.

## Qué pasa al servidor
| Hoy (cliente) | E6 (servidor) |
|---|---|
| `world.seed` y `world.seq` en localStorage | Semilla secreta por servidor. Cada combate usa `HMAC(secreto, idCombate)`; la semilla se revela en el informe después de resolverlo |
| `clock.now()` con desfase de debug | Solo el reloj del servidor. El cliente nunca envía timestamps y no existe `debug.*` |
| `createGame({ playerId })` | Un endpoint RPC por comando. `playerId` sale de la sesión autenticada. El cuerpo se valida con los validadores de `economy.js` y la fachada |
| `withOp(opId, …)` | El header `Idempotency-Key` se guarda en `ops (player_id, op_id) UNIQUE` con el resultado. Un reintento devuelve el mismo resultado |
| `tickBots` al consultar | Un cron por hora en punto (`hh:00`) procesa la hora `h` una sola vez. `settleShowcase` corre antes de procesar la primera hora de una semana nueva |
| `telemetry.track` → buffer | El sink envía a la cola de analítica. D1/D7/D30 se calculan con `signup` y `session_start` |

## Bots con N jugadores
- Los bots son **sombras**: rivales de relleno que garantizan objetivos en cualquier rango de nivel aunque haya pocos jugadores. Cada bot tiene un `anchor` (un jugador real), se reparten en ronda con `addPlayer` y se reasignan cuando un jugador queda inactivo 7 días.
- Emparejamiento: cada hora el bot estima con `winChance` (16 peleas de semilla fija) la probabilidad de que su ancla le gane, y ajusta su objetivo de poder hacia el winrate deseado (`matchmaking.playerWr`). Así ninguna build "se escapa" de la dificultad.
- **El oro de bots es una fuente del sistema, acotada y medida.**
  - El oro en mano de un bot es 0,3–2,5 h de misión. El resto queda en su banco, que no se puede robar.
  - El simulador reporta `botGoldShare` y el test exige que sea ≤ 20% del ingreso. Hoy está en 11–13%.
  - Con jugadores reales, el robo entre jugadores es una transferencia de suma cero.
  - La curva de progresión no depende del oro de bots: si se apagaran, el ingreso cae ~12% y el ritmo de nivel no cambia, porque la XP viene de misiones y del PvP contra cualquier rival.
- La proporción bots/jugadores por rango de nivel se mantiene en ~3:1 al principio y baja a medida que crece la base de jugadores (`bots.count` por *shard*).
- **v17: horario humano** (`src/bots.js`, `bots.human`). Perfil estable derivado de (semilla, id): huso LATAM, sueño, picos de tarde y noche, fines de semana distintos, ráfagas de 2–5 acciones, días sin entrar y pausas. No se guarda nada. El emparejamiento corre cada hora igual que antes; lo visible (visitas, ataques, duelos, regalos, solicitudes y respuestas) solo en las horas en línea del bot. Las reglas corren a la hora en punto y lo que se muestra lleva el minuto de la ráfaga (`opts.ts`). En E6 el cron de `hh:00` no cambia.
- **v17: retiro progresivo** (`rebalanceBots`, una vez por día, `bots.retire`, apagado en el cliente). Reancla los bots de jugadores inactivos. Retira de a poco (4 por día) según `plan` (70% → 50% → 30% → 10%) sin bajar de tres pisos: `minTargets` rivales y `minPeers` de tu facción en tu rango, y capacidad para recibir `huntsPerDay` ataques por cazador. Etapas: no es presa ni figura en escaparate o ranking → no manda solicitudes ni regalos → queda inactivo (fuera de la Arena; sigue en amigos y libros de visitas). Si falta un piso, vuelven bots.
- **El cupo de 5 ataques recibidos por día manda.** Un jugador activo caza unas 32–48 veces por día y cada objetivo recibe hasta 5. Con 21 jugadores y 40 bots, la mitad de las sesiones ya terminan sin objetivos (`sim/sim.js --only=bots`). Para bajar al 50% hace falta `bots.receiveFromPlayers ≈ 30`. Para el 10% también hay que subir `pvp.maxReceivedPerDay` (con 30/30 el plan del 10% queda en ~25% por los pisos).
- **v17 fix-mundo (B2): piso de rivales.** Los bots no pasan del techo de su ancla (nivel + desvío + 2, nunca fuera de rango) por la XP de duelos, defensas y visitas: antes, con el jugador ausente, al mes todos estaban en Nv 12–14 y un Nv 1 veía "No hay rivales". Si igual faltan `bots.floor.targets` (8) rivales en el rango de un jugador activo, un bot fuera del rango de todos y sin lazos (amistad, firmas, venganza, solicitudes, regalos) deja su lugar a uno nuevo de ese nivel (`relayBot`: id y nick nuevos, alta de 2–17 semanas, récord y reputación acordes, guarida con firmas, calibrado). Mismo cupo de entidades: el guardado no crece. Corre en `rebalanceBots` y al volver (`catchUp`, de a 2 por tramo). En E6: el mismo piso por *shard*; con muchos jugadores casi nunca hace falta.
- **Emparejamiento por ancla y B10.** Diagnóstico (`node sim/sim.js --only=bots`, 5 semillas, escenario 50%): el perfil activo caía a 30/18/5% de winrate (D7/D14/D30) contra 53% de los otros 20. Hay tres causas, en este orden:
  1. **Perfil de gasto del simulador.** El activo invierte en los 5 edificios (hasta 60% del oro por mejora) y ahorra el oro en mano para la próxima pieza de equipo; los 20 jugadores simulados (`sim/crowd.js`) ponen todo en equipo y atributos. Con jugadores reales que le roban el ahorro, el activo queda con 81 de poder contra 112 de los demás al mismo nivel. Prueba: sin edificios, el mismo activo gana 71/67% (D7/D14). Es una propiedad real del juego entre humanos: el PvP es de suma cero y el que construye pierde contra el que pelea.
  2. **Bots que se escapaban de su ancla** (B2, arreglado): subían por XP de duelos y quedaban más fuertes que cualquiera en su rango.
  3. **Bots calibrados contra su ancla, no contra quien los ataca** (arreglado en el cliente): un bot que defiende contra un jugador que no es su ancla pelea **espejado** a ese jugador (`mirrorK`: atributos × poder(atacante)/poder(ancla), acotado 0,5–2; la banda que se ve es la de la pelea). Con un solo jugador, k = 1: nada cambia.
  Resultado (5 semillas): 30/18/5% → 41/33/27% (mediana D30 5% → 16%). Lo que falta es de E6: **emparejar entre humanos** (banda de poder además del nivel, o botín menor contra el más débil), que los bots puedan **bajar** de poder después del Nv 15 (hoy solo frenan: si el ancla se estanca, sus bots quedan adelante), y un perfil de gasto realista para la multitud del simulador.
- **Transparencia:** `bots.label: 'eco'` marca los bots («Ecos», dato `eco` en la fachada) y los saca del ranking, del escaparate y de la guerra de facciones. Sin rivales reales no hay premio (`bots.eco`).
- **v17 fix-mundo (B9): guerra de facciones.** Los duelos de bots suman a su facción con probabilidad `faction.bots.share` (0,6) × (1 ± impulso semanal ±0,3 y diario ±0,08), en un contador por semana (`world.war`). Sin cazar, cada bando gana ~50% de las semanas; un activo inclina ~75% (24 semanas simuladas), un casual ~54%. En E6, con jugadores reales, bajar `share` a medida que suben los humanos (o contar solo humanos cuando haya `warMinReal` de cada lado).
- **v17 fix-mundo (B1): una pestaña a la vez.** Cada pestaña que abre el juego se anota en `oathbreak.save.tab`; la desactualizada rechaza toda escritura (`otra_pestana`) y ofrece "Jugar acá". En E6 lo reemplaza la revisión del guardado en el servidor (rechazar escrituras con `rev` vieja; ya existe en `saves.rev` de la nube).

## Datos (Postgres / Supabase)
- `players`: atributos, equipo, oro, banco, energía con su timestamp, nivel, XP, temporada (JSONB), `recent` (últimos 20 ataques). Columnas de dinero enteras con `CHECK (gold >= 0)`.
- `lairs`: edificios, salas, colocados e inventario (JSONB); renombre, racha, propinas, aplausos (`voters` por semana).
- `friends (player_id, friend_id)` y `gifts (from, to, day) UNIQUE` (un regalo por par por día). El tope diario se cumple con un `COUNT` dentro de la transacción.
- `reports`: una fila por combate con índice por cada participante. Se purgan a los 50 por jugador.
- `visits (visitor, host, day) UNIQUE`: hace cumplir "una recompensa por anfitrión por día".
- `bounty_claims (defender, attacker, day) UNIQUE`: tope por par.
- `received_attacks`: contadores diarios por defensor, separados para ataques de jugadores y de bots (los bots no consumen el cupo humano).
- Los duelos entre bots no suman a la guerra de facciones: solo cuentan victorias en las que participa un jugador real.
- `events`: telemetría, *append-only*, particionada por día.
- `config_versions`: cada cambio de `config.js` es una versión con fecha. Los informes guardan la versión con la que se resolvieron, y eso permite balance en vivo con rollback.

## Concurrencia
- `pvp` toma `SELECT … FOR UPDATE` sobre las dos filas de jugador, siempre en orden de id para evitar *deadlocks*. El tope de 5 defensas se cumple con `UPDATE … SET n = n + 1 WHERE n < 5 RETURNING`; si no devuelve fila, se rechaza el ataque.
- `visit` bloquea solo al anfitrión para la propina, el potenciador y el aplauso. El cupo del visitante lo garantiza la clave única de `visits`.
- `sendGift` bloquea al emisor para el tope diario. El regalo se inserta en la bandeja del receptor sin bloquearlo.
- Las consultas son de solo lectura. Lo que "pasa con el tiempo" (energía, horas de bots, cierre semanal) lo materializan los comandos y los cron.

## Antiabuso
| Abuso | Defensa en el código | Defensa adicional en E6 |
|---|---|---|
| Cuenta secundaria que se deja ganar para cobrar recompensa de defensa | Paga solo si el atacante tenía ≥ 20% de chance estimada (`winChance`). Una cuenta pura Def sin daño no califica. Además exige ≥ 25% de victorias en sus últimos 20 ataques y una vez por par por día | Marcar pares que se repiten. Cruce de dispositivo e IP |
| Transferencia de oro por robo | El oro en el banco no se puede robar; la Bóveda protege una parte | Marcar pares donde uno pierde siempre con mucho oro en mano |
| Multicuentas que inflan propinas, renombre o aplausos | Las visitas de cuentas de nivel < 5 no generan propina, renombre ni aplauso. Topes diarios (10 propinas, 20 de renombre) y un aplauso por visitante por semana | Antigüedad mínima de 3 días para contar en el escaparate. Detección de grupos que solo se visitan entre sí |
| Farmeo de regalos | Gratis pero con tope (5 por día, 1 por amigo). Lo regalado no se recicla por oro | Rate limit por cuenta |
| Reintentos o duplicados por red | `withOp` | `Idempotency-Key` obligatorio en comandos que gastan |

## Escala
- `targets`: índice por (facción, nivel). `winChance` (16 peleas) cuesta ~0,1 ms por par; con 40 candidatos son ~4 ms por consulta. Se cachea 5 minutos por par.
- `showcase`: el prestigio ya tiene caché por guarida y se invalida al cambiar la decoración. En E6 se materializa al colocar o quitar, y el ranking sale de una vista materializada por hora, particionada por facción y liga.

## Migración de guardados locales
Al registrarse, el cliente sube el JSON de localStorage. El servidor lo migra con `migrate.js` y conserva solo nivel, inventario y decoración. El oro se recalcula con un tope para evitar importar progreso editado a mano.
