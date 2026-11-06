-- v17 · Telemetría — eventos de juego y errores de cliente (sink propio, sin proveedor externo).
-- ESTADO: preparada, NO aplicada. Revisar y aplicar con `supabase db push` (o pegar en el SQL Editor).
-- Idempotente: se puede correr más de una vez. Requiere PostgreSQL 15+ (Supabase).
--
-- Modelo (ver docs/telemetria.md):
--   - El cliente (ui/telemetry-sink.js) manda lotes { v, tid, ev: [{ t, ts, sid, q, scr, p }] } a track_events().
--   - Las tablas viven en el esquema `analytics`, que PostgREST NO expone; además RLS activada sin políticas y sin
--     permisos para anon/authenticated (tampoco en las particiones). Solo la función (security definer) escribe.
--     El equipo lee desde el SQL Editor o con la service role (consultas listas en supabase/queries/kpis.sql).
--   - Dueño de cada fila: auth.uid() de quien llama (invitado o vinculado). Sin FK a auth.users a propósito:
--     "Borrar mi cuenta" borra sus filas (ver delete_my_account abajo); el purgado de invitados (30 días) deja las
--     filas con un uuid que ya no apunta a nadie (seudónimo → anónimo) para no romper la retención de cohortes viejas.
--   - Idempotencia: (sid, q) identifica el evento; un reenvío no duplica.

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

/* ---------- 1. Eventos: append-only, particionada por día (ts, UTC) ---------- */
create table if not exists analytics.events (
  ts          timestamptz not null,                 -- hora del evento según el cliente (acotada en track_events)
  received_at timestamptz not null default now(),
  user_id     uuid not null,                        -- auth.uid()
  tid         text not null check (tid ~ '^[0-9a-f]{16}$'),   -- id seudónimo de instalación
  sid         text not null check (sid ~ '^s[0-9a-f]{12}$'),  -- sesión
  q           int  not null check (q between 1 and 1000000),  -- número de evento en la sesión
  type        text not null check (type ~ '^[a-z][a-z0-9_]{1,39}$'),
  scr         text check (char_length(scr) <= 24),
  v           text check (char_length(v) <= 16),              -- versión de la app
  props       jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and octet_length(props::text) <= 1024),
  primary key (sid, q, ts)
) partition by range (ts);

comment on table analytics.events is 'v17: eventos de producto (docs/telemetria.md). Escritura solo por public.track_events(). Particiones diarias events_YYYYMMDD.';

create index if not exists events_type_ts_idx on analytics.events (type, ts);
create index if not exists events_user_ts_idx on analytics.events (user_id, ts);
create index if not exists events_tid_ts_idx  on analytics.events (tid, ts);

-- Atrapa lo que no tenga partición (días viejos dentro de la ventana de 30 días, o antes de crear la del día).
create table if not exists analytics.events_default partition of analytics.events default;

alter table analytics.events enable row level security;
alter table analytics.events_default enable row level security;
revoke all on table analytics.events, analytics.events_default from public, anon, authenticated;

-- Crea las particiones diarias de hoy a hoy + p_days (UTC). Cada partición: RLS y sin permisos para clientes
-- (las particiones no heredan la RLS del padre). Si el día ya tiene filas en events_default, se saltea y avisa.
create or replace function public.telemetry_partitions(p_days int default 14)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day  date;
  v_name text;
  v_n    int := 0;
begin
  for v_day in select generate_series((now() at time zone 'UTC')::date, (now() at time zone 'UTC')::date + least(greatest(p_days, 1), 60), interval '1 day')::date loop
    v_name := 'events_' || to_char(v_day, 'YYYYMMDD');
    continue when to_regclass('analytics.' || v_name) is not null;
    begin
      execute format('create table analytics.%I partition of analytics.events for values from (%L) to (%L)',
        v_name, (v_day::timestamp at time zone 'UTC'), ((v_day + 1)::timestamp at time zone 'UTC'));
      execute format('alter table analytics.%I enable row level security', v_name);
      execute format('revoke all on table analytics.%I from public, anon, authenticated', v_name);
      v_n := v_n + 1;
    exception when others then
      raise notice 'telemetry_partitions: % no se creó (%)', v_name, sqlerrm;
    end;
  end loop;
  return v_n;
end;
$$;

-- Conservación: borra particiones (y filas por defecto) de más de p_keep_days y errores de más de p_error_days.
-- Los plazos los decide el dueño (ver informe): por defecto 400 días de eventos y 90 de errores.
create or replace function public.telemetry_retention(p_keep_days int default 400, p_error_days int default 90)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rel  text;
  v_n    int := 0;
  v_keep int := greatest(p_keep_days, 35); -- nunca menos que la ventana de D30
begin
  for v_rel in
    select c.relname from pg_catalog.pg_inherits i
      join pg_catalog.pg_class c on c.oid = i.inhrelid
      join pg_catalog.pg_class p on p.oid = i.inhparent
      join pg_catalog.pg_namespace n on n.oid = p.relnamespace
     where n.nspname = 'analytics' and p.relname = 'events' and c.relname ~ '^events_[0-9]{8}$'
  loop
    if to_date(substr(v_rel, 8), 'YYYYMMDD') < (now() at time zone 'UTC')::date - v_keep then
      execute format('drop table analytics.%I', v_rel);
      v_n := v_n + 1;
    end if;
  end loop;
  delete from analytics.events_default where ts < now() - make_interval(days => v_keep);
  delete from analytics.client_errors where last_at < now() - make_interval(days => greatest(p_error_days, 7));
  return v_n;
end;
$$;

/* ---------- 2. Errores de cliente: una fila por (sesión, firma) con el total de repeticiones ---------- */
-- Volumen bajo y con upsert del contador: tabla común (no particionada); la conservación la hace telemetry_retention.
create table if not exists analytics.client_errors (
  id        bigint generated always as identity primary key,
  user_id   uuid not null,
  tid       text not null check (tid ~ '^[0-9a-f]{16}$'),
  sid       text not null check (sid ~ '^s[0-9a-f]{12}$'),
  sig       text not null check (sig ~ '^[0-9a-f]{8}$'),
  kind      text not null check (kind in ('error', 'rejection')),
  msg       text check (char_length(msg) <= 200),
  src       text check (char_length(src) <= 200),
  stack     text check (char_length(stack) <= 1200),
  scr       text check (char_length(scr) <= 24),
  v         text check (char_length(v) <= 16),
  n         int not null default 1 check (n between 1 and 1000000),
  first_at  timestamptz not null,
  last_at   timestamptz not null default now(),
  unique (sid, sig)
);

comment on table analytics.client_errors is 'v17: errores de JavaScript del cliente, deduplicados por (sesión, firma). Escritura solo por public.track_events().';

create index if not exists client_errors_sig_idx  on analytics.client_errors (sig, first_at desc);
create index if not exists client_errors_v_idx    on analytics.client_errors (v, first_at desc);
create index if not exists client_errors_user_idx on analytics.client_errors (user_id);

alter table analytics.client_errors enable row level security;
revoke all on table analytics.client_errors from public, anon, authenticated;

/* ---------- 3. Límite simple por usuario: ventana fija de 10 minutos ---------- */
create table if not exists analytics.telemetry_rate (
  user_id      uuid primary key,
  window_start timestamptz not null,
  n            int not null
);
alter table analytics.telemetry_rate enable row level security;
revoke all on table analytics.telemetry_rate from public, anon, authenticated;

/* ---------- 4. RPC ---------- */
-- track_events(p_batch jsonb): { "v": "v17", "tid": "16 hex", "ev": [{ "t", "ts" (ms), "sid", "q", "scr", "p": {} }] }
-- Reglas: sesión obligatoria; lote ≤ 100 eventos y ≤ 64 KB; ≤ 1500 eventos cada 10 min por usuario (si no: 'limite',
-- el cliente reintenta con backoff); cada evento se valida (tipo, sid, q entero, ts dentro de los últimos 30 días;
-- futuro > 1 h → ahora; p objeto ≤ 1 KB); se quitan claves personales y se descarta lo que traiga un email.
-- Lo inválido se saltea sin cortar el lote. t = 'error' va a client_errors (upsert del contador).
-- Devuelve { ok: true, accepted, skipped } o { ok: false, error }.
create or replace function public.track_events(p_batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_tid   text;
  v_v     text;
  v_cnt   int;
  v_rate  int;
  v_ev    jsonb;
  v_p     jsonb;
  v_ms    numeric;
  v_q     numeric;
  v_ts    timestamptz;
  v_rc    int;
  v_ok    int := 0;
  v_skip  int := 0;
  c_email constant text := '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}([^A-Za-z0-9_:/-]|$)';
  c_pii   constant text[] := array['name', 'nombre', 'email', 'mail', 'nick', 'nickname', 'pid'];
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin_sesion');
  end if;
  if p_batch is null or jsonb_typeof(p_batch) <> 'object' or coalesce(jsonb_typeof(p_batch -> 'ev'), '') <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'formato');
  end if;
  v_cnt := jsonb_array_length(p_batch -> 'ev');
  if v_cnt > 100 or octet_length(p_batch::text) > 65536 then
    return jsonb_build_object('ok', false, 'error', 'muy_grande');
  end if;
  v_tid := p_batch ->> 'tid';
  if v_tid is null or v_tid !~ '^[0-9a-f]{16}$' then
    return jsonb_build_object('ok', false, 'error', 'formato');
  end if;
  v_v := left(coalesce(p_batch ->> 'v', ''), 16);
  if v_cnt = 0 then
    return jsonb_build_object('ok', true, 'accepted', 0, 'skipped', 0);
  end if;

  insert into analytics.telemetry_rate as r (user_id, window_start, n) values (v_uid, now(), v_cnt)
  on conflict (user_id) do update
     set window_start = case when r.window_start < now() - interval '10 minutes' then now() else r.window_start end,
         n            = case when r.window_start < now() - interval '10 minutes' then excluded.n else r.n + excluded.n end
  returning n into v_rate;
  if v_rate > 1500 then
    return jsonb_build_object('ok', false, 'error', 'limite');
  end if;

  for v_ev in select value from jsonb_array_elements(p_batch -> 'ev') loop
    if jsonb_typeof(v_ev) <> 'object'
       or coalesce(v_ev ->> 't', '') !~ '^[a-z][a-z0-9_]{1,39}$'
       or coalesce(v_ev ->> 'sid', '') !~ '^s[0-9a-f]{12}$'
       or coalesce(jsonb_typeof(v_ev -> 'q'), '') <> 'number'
       or coalesce(jsonb_typeof(v_ev -> 'ts'), '') <> 'number'
       or coalesce(jsonb_typeof(coalesce(v_ev -> 'p', '{}'::jsonb)), '') <> 'object' then
      v_skip := v_skip + 1;
      continue;
    end if;
    v_q  := (v_ev ->> 'q')::numeric;
    v_ms := (v_ev ->> 'ts')::numeric;
    if v_q <> trunc(v_q) or v_q < 1 or v_q > 1000000
       or v_ms < extract(epoch from now() - interval '30 days') * 1000 or v_ms > 4102444800000 then
      v_skip := v_skip + 1;
      continue;
    end if;
    v_ts := to_timestamp(v_ms / 1000);
    if v_ts > now() + interval '1 hour' then v_ts := now(); end if;
    v_p := coalesce(v_ev -> 'p', '{}'::jsonb) - c_pii;
    if octet_length(v_p::text) > 1024 or v_p::text ~ c_email then
      v_skip := v_skip + 1;
      continue;
    end if;

    if v_ev ->> 't' = 'error' then
      if coalesce(v_p ->> 'sig', '') !~ '^[0-9a-f]{8}$' or coalesce(v_p ->> 'kind', '') not in ('error', 'rejection') then
        v_skip := v_skip + 1;
        continue;
      end if;
      insert into analytics.client_errors as ce (user_id, tid, sid, sig, kind, msg, src, stack, scr, v, n, first_at, last_at)
      values (v_uid, v_tid, v_ev ->> 'sid', v_p ->> 'sig', v_p ->> 'kind', left(v_p ->> 'msg', 200), left(v_p ->> 'src', 200),
              left(v_p ->> 'stack', 1200), left(v_ev ->> 'scr', 24), v_v,
              least(greatest(coalesce((case when jsonb_typeof(v_p -> 'n') = 'number' then (v_p ->> 'n')::numeric end), 1), 1), 1000000)::int,
              v_ts, now())
      on conflict (sid, sig) do update
         set n = greatest(ce.n, excluded.n), last_at = now(), stack = coalesce(ce.stack, excluded.stack)
       where ce.user_id = excluded.user_id;
    else
      insert into analytics.events (ts, user_id, tid, sid, q, type, scr, v, props)
      values (v_ts, v_uid, v_tid, v_ev ->> 'sid', v_q::int, v_ev ->> 't', left(v_ev ->> 'scr', 24), v_v, v_p)
      on conflict do nothing;
    end if;
    get diagnostics v_rc = row_count;
    v_ok := v_ok + v_rc;
  end loop;

  return jsonb_build_object('ok', true, 'accepted', v_ok, 'skipped', v_skip);
end;
$$;

comment on function public.track_events(jsonb) is 'v17: recibe lotes de telemetría del cliente (eventos y errores). Dueño = auth.uid(). Ver docs/telemetria.md.';

revoke all on function public.track_events(jsonb) from public, anon;
grant execute on function public.track_events(jsonb) to authenticated;
revoke all on function public.telemetry_partitions(int) from public, anon, authenticated;
revoke all on function public.telemetry_retention(int, int) from public, anon, authenticated;

/* ---------- 5. "Borrar mi cuenta" también borra la telemetría (derecho de supresión) ---------- */
-- Reemplaza la de 20261105_delete_my_account.sql (mismo cuerpo + las tres tablas de analytics).
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin_sesion');
  end if;

  delete from public.saves where player_id = v_uid;
  delete from analytics.events where user_id = v_uid;
  delete from analytics.client_errors where user_id = v_uid;
  delete from analytics.telemetry_rate where user_id = v_uid;
  delete from auth.users where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.delete_my_account() is 'v17: borra la partida, la telemetría y el usuario de quien llama (auth.uid()). Sin parámetros a propósito.';

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

/* ---------- 6. Particiones iniciales y tareas programadas ---------- */
select public.telemetry_partitions(14);

-- Con pg_cron (descomentar al aplicar): particiones de las próximas 2 semanas cada día y conservación semanal.
-- create extension if not exists pg_cron;
-- select cron.schedule('oathbreak-telemetry-partitions', '7 3 * * *', $cron$select public.telemetry_partitions(14)$cron$);
-- select cron.schedule('oathbreak-telemetry-retention', '23 4 * * 1', $cron$select public.telemetry_retention(400, 90)$cron$);
