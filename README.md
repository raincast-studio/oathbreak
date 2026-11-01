# OATHBREAK: esqueleto lógico

Lógica, reglas y balance del juego, sin estética. JavaScript con ES modules y sin dependencias.

## Cómo correrlo
| Qué | Comando |
|---|---|
| Tests (unitarios, robustez y asserts de balance a 60 días) | `node --test` |
| Reporte de balance | `node sim/sim.js` (`--days=90`, `--only=matrix`, `--only=prog`) |
| Página de prueba | servir la carpeta (`npx serve .`) y abrir `index.html` |

## Mapa de módulos
| Archivo | Responsabilidad |
|---|---|
| `src/config.js` | Todas las constantes de balance. Es el único lugar donde se tunea |
| `src/core.js` | RNG con semilla, reloj inyectable, día y semana en ART, lectura y escritura del guardado |
| `src/economy.js` | Fórmula de recompensa y validadores de entrada (sin dependencias) |
| `src/telemetry.js` | Eventos de producto (registro, sesión, gasto, caza, visita, regalo…) con sink externo opcional |
| `src/effects.js` | Estado inicial de la guarida, efectos de edificios, `grantItem` |
| `src/character.js` | Atributos, costo por total de puntos, vida, energía, XP, equipo |
| `src/combat.js` | Combate puro y determinista con triángulo de builds |
| `src/season.js` | Temporadas de 4 semanas y pase de Gloria |
| `src/objectives.js` | Objetivos diarios |
| `src/lair.js` | Edificios, Taller, salas, grilla, prestigio, tiendas, visitas, racha, escaparate por ligas, guerra de facciones |
| `src/social.js` | Amigos y regalos |
| `src/systems.js` | Misiones, banco, PvP, `winChance`, presa del día, recompensa de defensa, jugadores, bots y emparejamiento |
| `src/catalog.js` | Catálogo de decoración (más de 100 objetos, 7 sets) |
| `src/migrate.js` | Migraciones del guardado, versión por versión |
| `src/game.js` | Fachada: valida entradas; consultas puras y salidas clonadas; comandos; idempotencia; multijugador |
| `src/reports.js` | Texto del informe de combate |
| `sim/model.js` | Modelo de simulación. Solo usa la fachada pública |
| `docs/E6-servidor.md` | Diseño del servidor autoritativo |

## Reglas vigentes (resumen)
- **Energía:** es el único recurso que limita las sesiones. Cada combate arranca con la vida completa.
- **Combate (triángulo):**
  - Fue: golpes grandes que atraviesan la armadura plana.
  - Def: armadura plana por golpe, que anula los golpes chicos de los ágiles.
  - Agi: esquive y doble golpe relativos a la Agi rival, que evitan los golpes grandes.
  - Res: vida.
  - Ninguna build le gana a todas (está en los asserts).
- **Atributos:** el costo de un punto depende del total de puntos comprados, multiplicado por un factor por atributo.
- **Emparejamiento:** los bots ajustan su poder según la probabilidad estimada de que su jugador les gane. El objetivo es 66% al principio y baja hasta 52% después del nivel 15.
- **PvP:**
  - Rango simétrico y escudo de novato hasta el nivel 5.
  - Antes de atacar se ve la banda (débil, parejo, fuerte, muy fuerte) y el botín estimado.
  - La XP de victoria se multiplica por el riesgo: 1,6 menos la chance de ganar.
  - La presa del día paga el doble de XP más oro, y hay que elegirla: no sale en la caza al azar.
- **Recompensa de defensa:**
  - Solo si el atacante tenía al menos 20% de chance.
  - Solo si ganó al menos 25% de sus últimos 20 ataques.
  - Una vez por atacante por día.
- **Social:**
  - Visitas con tope.
  - Propina y renombre para el anfitrión.
  - Amigos (hasta 50) y regalos gratis (5 por día, uno por amigo; no se reciclan por oro).
  - La racha pide 3 visitas y 1 regalo.
- **Escaparate:**
  - Puntaje = prestigio + 2 × aplaudidores únicos.
  - El prestigio rinde menos con duplicados.
  - Hay ligas por nivel, y los lunes se premia al top 3 de cada facción y liga.
- **Guerra de facciones:** gana la facción con más victorias en la semana. Cobran los miembros que tengan al menos 5 victorias.
- **Temporadas:** 4 semanas y 30 escalones de Gloria, con cosméticos exclusivos en los escalones 10, 20 y 30.
- **Metas de largo plazo:**
  - Equipo hasta el tier 7 (nivel 75).
  - Edificios al 5.
  - Cuatro salas.
  - Tienda de renombre de hasta 800.

## Cambios del 20/10 (interfaz E7)
- **Misión en curso bloquea la caza** (`en_mision`), como en BiteFight. Cancelar la misión libera la Arena.
- **Venganza:** durante 24 h podés atacar una vez a quien te atacó, ignorando rango, cooldown y escudo de novato (`revenge()`).
- **Balance PvP > misiones:** XP de victoria = misión de 19 min × riesgo; bono de oro de victoria = misión de 20 min × riesgo (creado por el sistema); misiones `goldBase 2.0`, `xpBase 3.2`. Jugador activo a 30 días: PvP ≈ 52% de la XP y 48% del oro (asserts: ≥ 50% y ≥ 40%).
- **Equipo:** bonus ×0.4 (≈ 35–40% de los atributos efectivos) y precio proporcional; variantes por pieza (`buyGear(slot, tier, stat)`) y reforja al 50%.
- **Amistad por solicitud** (`addFriend` → `acceptFriend`/`rejectFriend`/`cancelRequest`); los bots contestan en 1–6 h (70% acepta) y a veces te mandan solicitudes.
- **Regalos chicos:** solo comunes de hasta 2 casillas, tope de 5 recibidos por día, vendibles a los 3 días por 15 de oro.
- **Tienda:** 4 fijos + 12 rotativos; cada casilla sortea rareza 45/37/15/3% y después el objeto.
- **Ranking** de la facción rival (`ranking()`).
- La interfaz es `index.html` + `ui/` (antes se llamaba `app.html`).

## 1b: guardado en la nube provisional (30/10)
- Supabase `oathbreak` (`sa-east-1`). Tabla `saves` (partida en JSON por jugador) con RLS de solo lectura; se escribe únicamente con `save_game(data, rev)` (dueño, tope 256 KB, versión optimista).
- `ui/cloud.js` envuelve el storage: localStorage sigue siendo el guardado principal; sube 10 s después de cada cambio, cada 60 s y al minimizar. Al entrar, si la nube tiene una versión más nueva, la usa.
- Sesión anónima de invitado; vincular con email + código de 6 dígitos (mismo `playerId`). "Ya tengo un héroe" para entrar desde otro dispositivo.
- `ui/account.js`: hoja "Guardá tu héroe" (primera caza ganada o nivel 3; vuelve a las 24 h), sección Cuenta en Personaje y aviso a los 7 días. `pg_cron` purga invitados sin vincular con 30 días sin actividad.
- La lógica (`src/`) no cambió. En E6 esto se reemplaza por los comandos del servidor.

## Plan de la revisión experta (31/10)
- **Primera hora:** al crear el jugador, los bots que lo orbitan se calibran al instante (`calibrateBots`); winrate objetivo 80% en Nv 1–2 y 72% en Nv 3–4 (`matchmaking.playerWr.early`). Primera pelea ganada ~80% (antes 37%). Presa del día de tu nivel o menor, fijada en el día (`fixPrey`). 250 de oro inicial. Objetivos del día solo si se pueden cumplir (sin Taller no hay "Cobrá el Taller"; sin 2 amigos no hay regalos).
- **Atributos:** multiplicador de arranque `statCostMulEarly` (Fue 1,6 · Def 0,6 · Agi 1 · Res 0,5) que se mezcla con el normal entre 20 y 28 puntos. Con 600 de oro las builds razonables van de 43% a 67% (antes 37–75%); los asserts a 4.000/15.000/60.000 siguen pasando.
- **Guardado:** ~95 KB el día 1 y ~140 KB el día 30 (antes 168 y 354). Informes: 25, con rondas solo los 5 más nuevos; telemetría 60 eventos; firmas de bots 3; potenciadores vencidos se descartan. `compactWorld` achica guardados viejos al cargar. La nube avisa si falla.
- **Escudo de novato:** visible en Inicio; se retira de a poco (Nv 5/6/7: máx 1/2/3 ataques recibidos por día). La venganza ignora el tope diario.
- **Interfaz:** "Próximo paso" y Primeros pasos arriba en Inicio; "Mientras no estabas" al volver (≥ 30 min); ceremonia "¡Evolucionaste!"; golpes animados en "Cazando…"; textos ≥ 11 px (10 px en fichas a ≤ 380 px) y botones de 44 px; Arena con disponibles primero; "Aceptar todas" en solicitudes; avisos abajo; depósito validado.
- **PWA:** `manifest.webmanifest`, `sw.js` e íconos; avisos de misión, energía llena y ataques mientras la app sigue viva en segundo plano (el push con la app cerrada necesita el servidor, E6).
- **Crecimiento:** invitar por WhatsApp/compartir con `?ref=CODIGO` (+300 de oro al invitado en v13, +100 y un objeto exclusivo desde v14; el premio del que invita llega con E6). Evento "Fin de semana de caza" (sábado y domingo: +25% XP por ganar, Gloria ×2). Pase: 160 de Gloria por escalón.

## v14 (01/11): acciones 1–4 de la revisión de la v13
- **Calibración que dura (R1):** `calibrateBot` deja la escala de poder del bot en lo calibrado y, hasta el Nv 15, hace un ajuste fino después de cada compra del bot. Winrate por sesión de 12 ataques (80 semillas, gastando en atributos, misión de 4 h): 79% / 68% / 72% / 63% / 66% (v13: 79% / 34% / 51%). Test nuevo de las sesiones 2–4.
- **Próximo paso que empuja a gastar (N11):** después de la primera pelea, sugiere equipo si alcanza o atributos si alcanza para 2 puntos ("el oro en mano se puede robar"). Sin botón "Distribuir" (decisión del dueño del 20/10).
- **Bono de bienvenida seguro (R2):** +100 de oro y el Farol de la amistad (exclusivo). Código con el mismo formato que las invitaciones, solo personajes de menos de 1 día y con fecha de creación, una vez.
- **Textos honestos:** escudo gradual (1 vez hoy, +1 por nivel hasta quedar sin escudo en el Nv 8), triángulo ("ninguna combinación le gana a todas"; el triángulo no se cumple en todas las etapas), avisos (solo con el juego abierto o instalado en segundo plano).
- Test de 90 días: tope de winrate semanal del activo 0,60 → 0,62 (igual que el casual; ruido de ±2,7 pp).
