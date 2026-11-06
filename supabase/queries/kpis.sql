-- v17 · KPIs de telemetría. Consultas de solo lectura, listas para el SQL Editor de Supabase (rol postgres o
-- service role: los clientes no pueden leer el esquema analytics). Requieren 20261107_telemetry.sql aplicada.
-- Día de juego = día en Argentina (UTC−3, igual que CFG.dayOffsetMs). Eventos: docs/telemetria.md.
-- Gates de la beta: D1 ≥ 35 %, D7 ≥ 12 %, sesiones con error < 1 %.

-- ============================================================================================================
-- 1. Retención D1 / D7 / D30 por cohorte (día del alta = primer `signup`; activo = cualquier evento ese día).
--    Solo jugadores con `signup` registrado (los anteriores a la telemetría no tienen cohorte). NULL = cohorte
--    todavía muy nueva para medir ese día.
-- ============================================================================================================
with cohort as (
  select user_id, (min(ts) at time zone 'America/Argentina/Buenos_Aires')::date as d0
    from analytics.events
   where type = 'signup'
   group by user_id
), active as (
  select distinct user_id, (ts at time zone 'America/Argentina/Buenos_Aires')::date as d
    from analytics.events
   where ts >= now() - interval '120 days'
), ret as (
  select c.user_id, c.d0,
         coalesce(bool_or(a.d = c.d0 + 1), false)  as r1,
         coalesce(bool_or(a.d = c.d0 + 7), false)  as r7,
         coalesce(bool_or(a.d = c.d0 + 30), false) as r30
    from cohort c
    left join active a on a.user_id = c.user_id and a.d in (c.d0 + 1, c.d0 + 7, c.d0 + 30)
   where c.d0 >= current_date - 90
   group by c.user_id, c.d0
), hoy as (select (now() at time zone 'America/Argentina/Buenos_Aires')::date as d)
select r.d0 as cohorte, count(*) as jugadores,
       case when hoy.d > r.d0 + 1  then round(100.0 * count(*) filter (where r1)  / count(*), 1) end as d1_pct,
       case when hoy.d > r.d0 + 7  then round(100.0 * count(*) filter (where r7)  / count(*), 1) end as d7_pct,
       case when hoy.d > r.d0 + 30 then round(100.0 * count(*) filter (where r30) / count(*), 1) end as d30_pct
  from ret r cross join hoy
 group by r.d0, hoy.d
 order by r.d0 desc;

-- 1b. Gate de la beta: retención ponderada de las cohortes cerradas de los últimos 28 días.
with cohort as (
  select user_id, (min(ts) at time zone 'America/Argentina/Buenos_Aires')::date as d0
    from analytics.events where type = 'signup' group by user_id
), active as (
  select distinct user_id, (ts at time zone 'America/Argentina/Buenos_Aires')::date as d
    from analytics.events where ts >= now() - interval '40 days'
), hoy as (select (now() at time zone 'America/Argentina/Buenos_Aires')::date as d),
ret as (
  select c.user_id, c.d0, coalesce(bool_or(a.d = c.d0 + 1), false) as r1, coalesce(bool_or(a.d = c.d0 + 7), false) as r7
    from cohort c cross join hoy
    left join active a on a.user_id = c.user_id and a.d in (c.d0 + 1, c.d0 + 7)
   where c.d0 >= hoy.d - 28
   group by c.user_id, c.d0
)
select round(100.0 * count(*) filter (where r1 and d0 + 1 < hoy.d) / nullif(count(*) filter (where d0 + 1 < hoy.d), 0), 1) as d1_pct, -- gate ≥ 35
       round(100.0 * count(*) filter (where r7 and d0 + 7 < hoy.d) / nullif(count(*) filter (where d0 + 7 < hoy.d), 0), 1) as d7_pct, -- gate ≥ 12
       count(*) filter (where d0 + 1 < hoy.d) as n_d1, count(*) filter (where d0 + 7 < hoy.d) as n_d7
  from ret cross join hoy;

-- ============================================================================================================
-- 2. Embudo del onboarding (instalaciones nuevas de los últimos 14 días, por dispositivo = tid).
--    Abrió → vio bando → eligió bando → vio nombre → nombre válido → juró → alta → 1ª misión o caza en 1 h → D1.
-- ============================================================================================================
with nuevos as (
  select tid, min(ts) as t0
    from analytics.events
   where type = 'app_open' and (props ->> 'new')::boolean and ts >= now() - interval '14 days'
   group by tid
), f as (
  select n.tid,
         bool_or(e.type = 'onb_view' and e.props ->> 'step' = 'faction') as v_faction,
         bool_or(e.type = 'onb_faction')                                  as faction,
         bool_or(e.type = 'onb_view' and e.props ->> 'step' = 'name')     as v_name,
         bool_or(e.type = 'onb_name' and (e.props ->> 'ok')::boolean)     as name_ok,
         bool_or(e.type = 'onb_oath')                                     as oath,
         min(e.ts) filter (where e.type = 'signup')                       as signup_ts,
         min(e.ts) filter (where e.type = 'first' and e.props ->> 'k' in ('mission', 'hunt')) as first_play
    from nuevos n
    join analytics.events e on e.tid = n.tid and e.ts >= n.t0
   group by n.tid
), d1 as (
  select f.tid, exists (
           select 1 from analytics.events e
            where e.tid = f.tid
              and (e.ts at time zone 'America/Argentina/Buenos_Aires')::date = (f.signup_ts at time zone 'America/Argentina/Buenos_Aires')::date + 1) as back
    from f where f.signup_ts is not null
)
select count(*)                                                          as "1_abrio",
       count(*) filter (where v_faction)                                 as "2_vio_bando",
       count(*) filter (where faction)                                   as "3_eligio_bando",
       count(*) filter (where v_name)                                    as "4_vio_nombre",
       count(*) filter (where name_ok)                                   as "5_nombre_ok",
       count(*) filter (where oath)                                      as "6_juro",
       count(*) filter (where signup_ts is not null)                     as "7_alta",
       count(*) filter (where first_play <= signup_ts + interval '1 hour') as "8_jugo_1h",
       (select count(*) filter (where back) from d1)                     as "9_volvio_d1"
  from f;

-- 2b. Por qué se traba el nombre: rechazos por código y uso de "Al azar".
select props ->> 'err' as error, (props ->> 'rnd')::boolean as al_azar, count(*) as intentos
  from analytics.events
 where type = 'onb_name' and not (props ->> 'ok')::boolean and ts >= now() - interval '14 days'
 group by 1, 2 order by 3 desc;

-- ============================================================================================================
-- 3. Primera hora: % de altas que llega a cada hito y en cuántos minutos (mediana).
-- ============================================================================================================
with s as (
  select user_id, min(ts) as t0 from analytics.events
   where type = 'signup' and ts >= now() - interval '14 days' group by user_id
)
select e.props ->> 'k' as hito,
       round(100.0 * count(distinct e.user_id) filter (where (e.props ->> 'min')::int <= 60) / (select count(*) from s), 1) as pct_en_1h,
       percentile_cont(0.5) within group (order by (e.props ->> 'min')::int) as mediana_min
  from analytics.events e join s using (user_id)
 where e.type = 'first'
 group by 1 order by 2 desc;

-- 3b. Winrate de la primera hora (ataques del jugador en los 60 min desde el alta), contra bots y jugadores.
with s as (
  select user_id, min(ts) as t0 from analytics.events
   where type = 'signup' and ts >= now() - interval '14 days' group by user_id
)
select e.props ->> 'foe' as rival, count(*) as peleas, count(distinct e.user_id) as jugadores,
       round(100.0 * avg(((e.props ->> 'won')::boolean)::int), 1) as winrate_pct
  from analytics.events e join s using (user_id)
 where e.type = 'pvp' and e.props ->> 'role' = 'attacker' and e.ts between s.t0 and s.t0 + interval '1 hour'
 group by rollup (e.props ->> 'foe');

-- 3c. "Guardá tu héroe": mostrado → código enviado → vinculado (últimos 14 días, por usuario).
select count(distinct user_id) filter (where type = 'link_shown') as mostrado,
       count(distinct user_id) filter (where type = 'link_sent')  as codigo_enviado,
       count(distinct user_id) filter (where type = 'link_done')  as vinculado
  from analytics.events where type like 'link\_%' and ts >= now() - interval '14 days';

-- ============================================================================================================
-- 4. Sesiones: cantidad por día, jugadores activos y duración (último session_end de cada sesión).
-- ============================================================================================================
with ses as (
  select sid, user_id, (min(ts) at time zone 'America/Argentina/Buenos_Aires')::date as dia,
         max((props ->> 'fg')::int) filter (where type = 'session_end') as fg_s
    from analytics.events where ts >= now() - interval '14 days'
   group by sid, user_id
)
select dia, count(distinct user_id) as dau, count(*) as sesiones,
       round(count(*)::numeric / count(distinct user_id), 2) as sesiones_por_jugador,
       percentile_cont(0.5) within group (order by fg_s) as mediana_seg_primer_plano
  from ses group by dia order by dia desc;

-- ============================================================================================================
-- 5. Errores: % de sesiones con al menos un error, por versión (gate < 1 %), y los más frecuentes.
-- ============================================================================================================
with s as (
  select v, sid from analytics.events where ts >= now() - interval '7 days' group by v, sid
), e as (
  select distinct sid from analytics.client_errors where first_at >= now() - interval '7 days'
)
select s.v as version, count(*) as sesiones, count(e.sid) as con_error,
       round(100.0 * count(e.sid) / count(*), 2) as pct_con_error  -- gate < 1
  from s left join e using (sid)
 group by s.v order by s.v desc;

select sig, kind, min(msg) as mensaje, min(src) as origen, string_agg(distinct v, ', ') as versiones,
       string_agg(distinct split_part(scr, ':', 1), ', ') as pantallas,
       count(distinct sid) as sesiones, sum(n) as veces, max(last_at) as ultima
  from analytics.client_errors
 where first_at >= now() - interval '7 days'
 group by sig, kind order by sesiones desc limit 20;

-- ============================================================================================================
-- 6. Economía: oro por fuente (entra) y sumidero (sale) por día, y oro neto por jugador activo.
-- ============================================================================================================
select (ts at time zone 'America/Argentina/Buenos_Aires')::date as dia, props ->> 'src' as categoria,
       sum((props ->> 'd')::numeric) filter (where (props ->> 'd')::numeric > 0)  as entra,
       -sum((props ->> 'd')::numeric) filter (where (props ->> 'd')::numeric < 0) as sale,
       count(distinct user_id) as jugadores
  from analytics.events
 where type = 'gold' and ts >= now() - interval '14 days'
 group by 1, 2 order by 1 desc, 3 desc nulls last;

-- 6b. Balance diario por jugador (mediana de fuentes, sumideros y patrimonio al cierre del día).
with d as (
  select user_id, (ts at time zone 'America/Argentina/Buenos_Aires')::date as dia,
         sum(greatest((props ->> 'd')::numeric, 0)) as entra, sum(least((props ->> 'd')::numeric, 0)) as sale,
         (array_agg((props ->> 'bal')::numeric order by ts desc))[1] as patrimonio
    from analytics.events where type = 'gold' and ts >= now() - interval '14 days'
   group by 1, 2
)
select dia, count(*) as jugadores,
       percentile_cont(0.5) within group (order by entra) as mediana_entra,
       percentile_cont(0.5) within group (order by -sale) as mediana_sale,
       percentile_cont(0.5) within group (order by patrimonio) as mediana_patrimonio
  from d group by dia order by dia desc;

-- ============================================================================================================
-- 7. Social, invitaciones y PWA (últimos 14 días).
-- ============================================================================================================
select type, count(*) as eventos, count(distinct user_id) as jugadores
  from analytics.events
 where type in ('visit', 'gift_sent', 'gift_open', 'friend_request', 'friend_accept', 'invite_share', 'invite_open', 'referral',
                'pwa_prompt', 'install_tap', 'install_result', 'app_installed', 'notify_ask')
   and ts >= now() - interval '14 days'
 group by type order by type;

select props ->> 'outcome' as resultado, count(*) from analytics.events
 where type = 'install_result' and ts >= now() - interval '14 days' group by 1;
select props ->> 'result' as permiso, count(*) from analytics.events
 where type = 'notify_ask' and ts >= now() - interval '14 days' group by 1;

-- ============================================================================================================
-- 8. Rendimiento por versión: tiempo a interactivo y tareas largas (p50 / p75 / p95).
-- ============================================================================================================
select v as version, count(*) as cargas,
       percentile_cont(0.5)  within group (order by (props ->> 'tti')::numeric) as tti_p50,
       percentile_cont(0.75) within group (order by (props ->> 'tti')::numeric) as tti_p75,
       percentile_cont(0.95) within group (order by (props ->> 'tti')::numeric) as tti_p95,
       percentile_cont(0.75) within group (order by (props ->> 'lcp')::numeric) filter (where (props ->> 'lcp')::numeric >= 0) as lcp_p75,
       round(avg((props ->> 'lt_n')::numeric), 2) as tareas_largas_prom,
       round(100.0 * avg(((props ->> 'sw')::boolean)::int), 1) as pct_con_sw
  from analytics.events
 where type = 'perf' and (props ->> 'tti')::numeric >= 0 and ts >= now() - interval '7 days'
 group by v order by v desc;

-- Calidad del dato: eventos descartados en el cliente por cola llena.
select (ts at time zone 'America/Argentina/Buenos_Aires')::date as dia, sum((props ->> 'n')::int) as descartados
  from analytics.events where type = 'tm_dropped' and ts >= now() - interval '14 days' group by 1 order by 1 desc;
