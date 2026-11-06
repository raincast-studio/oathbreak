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
- **Emparejamiento por ancla.** Cada bot se calibra contra su ancla, no contra quien lo ataca. Con muchos jugadores, uno más débil que el promedio ya no tiene la red de los bots y su winrate cae (sim: el perfil activo, que invierte en edificios, baja a 5–35%). Para E6 conviene calibrar la banda de poder contra el atacante (`winChance` por par) o anclar varios bots por jugador.
- **Transparencia:** `bots.label: 'eco'` marca los bots («Ecos», dato `eco` en la fachada) y los saca del ranking, del escaparate y de la guerra de facciones. Sin rivales reales no hay premio (`bots.eco`).

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
