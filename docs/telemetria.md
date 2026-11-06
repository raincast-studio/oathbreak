# Telemetría de OATHBREAK (v17)

Plan de eventos, transporte y KPIs. Objetivo: medir D1/D7/D30, el embudo del onboarding y la primera hora, la
economía, lo social, la PWA, errores y rendimiento, **sin depender de un proveedor** (sink propio a Supabase,
intercambiable). Gates de la beta: **D1 ≥ 35 %**, **D7 ≥ 12 %**, **sesiones con error < 1 %**.

## Principios

- **Sin datos personales.** Ningún evento lleva nombre de héroe, email ni texto libre del jugador. La identidad es
  seudónima: `tid` (id aleatorio de instalación, en este navegador) y, en el servidor, `auth.uid()` (dueño de la fila).
  El sink borra además cualquier propiedad llamada `name`/`nombre`/`email`/`mail`/`nick` y tacha lo que parezca un
  email; el servidor repite el filtro.
- **Una sola regla por cosa.** Los eventos de juego salen de la fachada (`src/game.js` → `src/telemetry.js`), donde
  ya están los resultados; la interfaz solo emite lo que la fachada no ve (onboarding antes de crear el personaje,
  pantallas, PWA, errores, rendimiento). La economía se mide como cambio de patrimonio por comando (no se repiten
  los cálculos de cada sistema).
- **Nunca rompe el juego.** `track` atrapa todo; el envío es asíncrono, en lote, con tope y descarte.
- **Opt-out.** Personaje → Ajustes → "Compartir datos de uso" (encendido por defecto). Apagado: no se encola ni se
  envía nada y se vacía la cola.
- **Guardado.** Solo `e.tm` (bits de hitos, ≈ 6 B) y los eventos de siempre en el buffer circular del mundo
  (`CFG.telemetry.max` = 60, solo diagnóstico). El evento `gold` no entra al buffer. La cola de envío vive aparte
  (`localStorage['oathbreak.tm.q']`, ≤ 48 KB).

## Formato en el cable

```js
// Lote → RPC track_events(p_batch jsonb)
{ v: 'v17', tid: '9f2c…', ev: [
  { t: 'pvp', ts: 1793900000000, sid: 's-…', q: 12, scr: 'arena', p: { role: 'attacker', won: true, loot: 40, bounty: 0, foe: 'bot' } },
  { t: 'error', ts: …, sid: …, q: 13, scr: 'guarida', p: { sig: 'a1b2c3d4', kind: 'error', msg: '…', src: 'ui/tabs/guarida.js:120:7', stack: '…', n: 1 } },
] }
```

| Campo | Qué es |
|---|---|
| `v` | versión de la app (`APP_VERSION` en `ui/telemetry-sink.js`, igual a `VERSION` de `sw.js`; un test lo controla) |
| `tid` | id seudónimo de instalación (aleatorio, 16 hex, `localStorage['oathbreak.tm.id']`) |
| `t` | tipo de evento (`^[a-z][a-z0-9_]{1,39}$`) |
| `ts` | hora del cliente en ms (el servidor descarta lo de hace más de 30 días y lleva a "ahora" lo que venga más de 1 h en el futuro) |
| `sid` | sesión: cambia tras ≥ 30 min sin actividad; se conserva entre recargas (mismo corte que `session_start`) |
| `q` | número de evento dentro de la sesión (con `sid`, clave de idempotencia: un reenvío no duplica) |
| `scr` | pantalla actual: `onb`, `base`, `misiones`, `arena`, `guarida`, `social`, `personaje` (+ `:sheet`/`:caza`) |
| `p` | propiedades (≤ 1 KB) |

## Diccionario de eventos

Origen: **F** = fachada (`src/`), **UI** = interfaz (`ui/`). "min" = minutos desde el alta del personaje.

### Embudo de onboarding

| Evento | Origen | Propiedades | Pregunta de negocio |
|---|---|---|---|
| `app_open` | UI | `pwa` (abierta instalada), `ref` (llegó con `?ref`), `vw` (ancho: 360/414/768/1024/1440), `new` (instalación nueva) | ¿Cuántos abren por primera vez? Base del embudo y de la tasa de instalación. |
| `onb_view` | UI | `step`: `faction` \| `name` | ¿Cuántos ven cada paso? (caída entre la portada y el nombre) |
| `onb_faction` | UI | `faction` | ¿Qué bando eligen? ¿Cambian de bando? (balance de facciones desde el día 0) |
| `onb_name` | UI | `ok`, `err` (código: `nombre_corto`, `nombre_no_permitido`…), `rnd` (usó "Al azar") | ¿El nombre frena? ¿Cuánto rechaza la moderación? ¿Sirve "Al azar"? |
| `onb_oath` | UI | `faction`, `ms` (tiempo en el onboarding) | Conversión final del onboarding y su duración. |
| `onb_signin` | UI | — | ¿Cuántos llegan con un héroe existente ("Ya tengo un héroe")? |
| `signup` | F | `faction`, `terms` (versión aceptada) | Alta real del personaje (fuente de verdad de la cohorte). |

### Primera hora

| Evento | Origen | Propiedades | Pregunta de negocio |
|---|---|---|---|
| `first` | F | `k`: `mission` \| `hunt` \| `win` \| `stat` \| `gear` \| `building` \| `visit` \| `gift` \| `friend`; `min` | ¿Qué % hace cada cosa y cuánto tarda? ¿Qué hito predice D1? |
| `mission_start` | F | `id`, `min` (duración) | ¿Qué contratos eligen? |
| `mission_claim` | F | `min`, `gold`, `xp` | ¿Vuelven a cobrar? (misión larga = gancho de regreso) |
| `mission_cancel` | F | `id`, `left` (min que faltaban) | ¿La misión choca con la caza? |
| `pvp` | F | `role`, `won`, `loot`, `bounty`, `foe` (`bot`/`player`) | Winrate de la primera hora y de cada nivel; peleas por sesión. |
| `level_up` | F | `level` | Ritmo de progresión. |
| `link_shown` | UI | `nag` (aviso automático o desde Personaje) | ¿Cuántos ven "Guardá tu héroe"? |
| `link_sent` / `link_done` | UI | — | ¿Cuántos vinculan email? (protege D7/D30 ante borrado del navegador) |

### Sesiones y retención

| Evento | Origen | Propiedades | Pregunta de negocio |
|---|---|---|---|
| `session_start` | F | `level` | Sesiones por día; D1/D7/D30 (día con actividad respecto del día del alta). |
| `session_end` | UI | `dur` (s desde el inicio), `fg` (s en primer plano), `hides` | Duración de sesión. Se repite en cada ocultamiento: vale el último por `sid`. |

**Retención:** cohorte = día (UTC−3) del primer `signup` (o primer evento) del usuario; retenido en Dn si tiene algún
evento el día `cohorte + n`. Consultas en `supabase/queries/kpis.sql`.

### Economía (oro)

| Evento | Origen | Propiedades | Pregunta de negocio |
|---|---|---|---|
| `gold` | F | `src`, `d` (cambio con signo de oro + banco), `bal` (patrimonio después) | Fuentes (`d > 0`) y sumideros (`d < 0`) por categoría; inflación; oro acumulado sin gastar. |
| `spend` | F | `what` (`stat`/`gear`/`building`), `gold`, extras | En qué se gasta (detalle de compras). |
| `daily_claim` / `daily_bonus` | F | `id` | ¿Se usan los objetivos del día? |
| `season_claim` | F | `tier` | Avance del pase de temporada. |

Categorías de `src`: `mission`, `pvp`, `visit`, `workshop`, `daily`, `season`, `referral`, `gift`, `recycle`, `stat`,
`gear`, `building`, `room`, `decor`, `bank` (comisión), `world` (asaltos de bots y premios mientras no estabas; neto).
Comando sin categoría propia → su nombre. El buffer del guardado no guarda `gold`.

### Social

| Evento | Origen | Propiedades | Pregunta de negocio |
|---|---|---|---|
| `visit` | F | `host` (`bot`/`player`), `gold`, `renown`, `streak` | ¿Se visita? ¿Rinde? |
| `gift_sent` / `gift_open` | F | `to` / `n` | Loop de regalos. |
| `friend_request` / `friend_accept` | F | `to` / `from` (`bot`/`player`) | ¿Se arma la red social? |
| `invite_share` | UI | `via` (`whatsapp`/`share`/`evolution`) | ¿Cuántos invitan? |
| `invite_open` | UI | `code` (código aleatorio de invitación, no identifica a nadie fuera del juego) | ¿Cuántos llegan por invitación? (k-factor) |
| `referral` | F | `code` | ¿Cuántos invitados crean personaje? |
| `report` | F | `reason`, `where` | Volumen de moderación. |

### PWA y avisos

| Evento | Origen | Propiedades | Pregunta de negocio |
|---|---|---|---|
| `pwa_prompt` | UI | — | ¿A cuántos les ofrece instalar el navegador? |
| `install_tap` | UI | `mode` (`prompt`/`ios`/`manual`) | ¿Tocan "Instalar"? |
| `install_result` | UI | `outcome` (`accepted`/`dismissed`) | Tasa de aceptación del diálogo nativo. |
| `app_installed` | UI | — | Instalaciones efectivas. |
| `notify_ask` | UI | `result` (`granted`/`denied`/`default`) | ¿Activan los avisos? (palanca de D1) |

### Errores y rendimiento

| Evento | Origen | Propiedades | Pregunta de negocio |
|---|---|---|---|
| `error` | UI | `sig` (firma), `kind` (`error`/`rejection`), `msg` (≤ 200), `src` (archivo:línea:col), `stack` (≤ 6 líneas, sin query strings), `n` (veces en la sesión) | % de sesiones con error (gate < 1 %); qué rompe y en qué versión/pantalla. Va a `client_errors`. |
| `perf` | UI | `tti`, `fcp`, `lcp`, `dcl`, `load` (ms), `lt_n`/`lt_ms`/`lt_max` (tareas largas hasta el envío), `sw` (con service worker), `nav` | ¿Abre rápido en celulares medios? ¿Hay congelamientos? |
| `tm_dropped` | UI | `n` | Eventos descartados por cola llena (calidad del dato). |

Errores: se deduplican por firma (mensaje sin números + primer cuadro de la pila); como máximo 10 firmas por sesión;
las repeticiones se suman en `n` y se reenvían al ocultar la pestaña (el servidor guarda el máximo).

## Transporte (`ui/telemetry-sink.js`)

- Cola en memoria + `localStorage` (≤ 300 eventos y ≤ 48 KB). Llena: se descarta el evento más viejo que no sea de
  embudo (`signup`, `onb_*`, `first`, `app_open`); si todos lo son, el nuevo. Lo descartado se informa en `tm_dropped`.
- Envío cada 30 s y al ocultar la pestaña (`visibilitychange`/`pagehide`) con `fetch(..., { keepalive: true })` a
  `POST {SUPABASE}/rest/v1/rpc/track_events` (`sendBeacon` no sirve: no manda el token de sesión). Lotes ≤ 50
  eventos y ≤ 32 KB.
- Reintento con backoff exponencial (30 s → 30 min, con variación); 400 = lote inválido (se descarta); 401/403/404/5xx o
  sin red = se reintenta. Un reenvío no duplica: el servidor ignora `(sid, q)` repetidos.
- Solo envía con sesión de Supabase (invitado o vinculada). Sin sesión, la cola espera.
- CSP: `connect-src` ya permite `https://*.supabase.co`.

### Cambiar de destino

`TM.dest` en `ui/telemetry-sink.js`: `'supabase'` (por defecto) o `'none'` (no envía; la cola y el panel siguen).
Para agregar **PostHog**:

1. Sumar un transporte en `TRANSPORTS`:
   ```js
   posthog: async (batch) => {
     const r = await fetch('https://us.i.posthog.com/batch/', { method: 'POST', keepalive: true,
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ api_key: 'phc_…', batch: batch.ev.map((e) => ({ event: e.t, distinct_id: batch.tid,
         timestamp: new Date(e.ts).toISOString(), properties: { ...e.p, $session_id: e.sid, scr: e.scr, v: batch.v } })) }) });
     return { status: r.status };
   },
   ```
2. Agregar `https://us.i.posthog.com` a `connect-src` en `index.html`.
3. `TM.dest = 'posthog'` (o ambos: un transporte que llame a los dos).
4. Para errores, Sentry: mismo patrón con su endpoint `envelope`, o dejar `client_errors` en Supabase.

## Panel de diagnóstico

Herramientas de prueba (5 toques al nombre) → **Telemetría**: últimos 20 eventos, cola pendiente, destino, último
envío, backoff y descartes. Botones "Enviar ahora" y "Vaciar cola".

## Servidor (preparado, sin aplicar)

`supabase/migrations/20261107_telemetry.sql` (tablas `events` particionada por día y `client_errors`, RPC
`track_events`, límite por usuario, RLS sin lectura) y `supabase/queries/kpis.sql` (retención, embudo, errores,
economía, winrate de la primera hora).
