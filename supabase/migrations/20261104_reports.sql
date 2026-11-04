-- v17 · Confianza — Reportes de jugadores.
-- ESTADO: preparada, NO aplicada. Revisar y aplicar con `supabase db push` (o pegar en el SQL Editor).
-- Idempotente: se puede correr más de una vez.
--
-- Modelo: el cliente encola reportes (≤ 20 y ≤ 2 KB, ver src/moderation.js) y los manda en lote a submit_report().
-- Nadie lee ni escribe la tabla directo: RLS activada SIN políticas para anon/authenticated. Solo la función
-- (security definer) inserta; el equipo modera desde el panel de Supabase o con la service role.
-- Los invitados (sesión anónima) también tienen el rol `authenticated`, así que pueden reportar.

create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  -- quién reporta: si borra su cuenta, el reporte queda (evidencia de moderación) pero anónimo
  reporter    uuid references auth.users (id) on delete set null,
  target_id   text not null check (char_length(target_id) between 1 and 64),  -- id del jugador en el juego
  target_name text check (char_length(target_name) <= 32),                     -- nombre tal como se veía al reportar
  reason      text not null check (reason in ('nombre', 'trampa', 'otro')),
  note        text check (char_length(note) <= 200),
  context     text not null default 'otro' check (context in ('guarida', 'arena', 'combate', 'social', 'otro')),
  ref         text check (ref ~ '^[A-Za-z0-9_:.-]{1,40}$'),                  -- id del informe de combate, si aplica
  client_ts   timestamptz,
  -- moderación
  status      text not null default 'nuevo' check (status in ('nuevo', 'revisando', 'resuelto', 'descartado')),
  handled_by  uuid references auth.users (id) on delete set null,
  handled_at  timestamptz,
  resolution  text check (char_length(resolution) <= 500)
);

comment on table public.reports is 'v17: reportes de jugadores (nombre ofensivo, posible trampa, otro). Escritura solo por submit_report().';

create index if not exists reports_status_idx   on public.reports (status, created_at desc);
create index if not exists reports_target_idx   on public.reports (target_id, created_at desc);
create index if not exists reports_reporter_idx on public.reports (reporter, created_at desc);

alter table public.reports enable row level security;
-- Sin políticas a propósito: anon y authenticated no pueden select/insert/update/delete.
revoke all on table public.reports from anon, authenticated;

-- submit_report(p_reports jsonb): lote de reportes compactos del cliente:
--   [{ "t": id, "n": nombre, "r": "nombre|trampa|otro", "x": nota?, "w": dónde, "ref": informe?, "ts": ms }]
-- Reglas: sesión obligatoria; lote ≤ 20 y ≤ 4 KB; tope 30 reportes por día por jugador; un mismo
-- (jugador, motivo) cuenta una vez por día; lo inválido se ignora sin cortar el lote.
-- Devuelve { ok: true, accepted: n } o { ok: false, error }.
create or replace function public.submit_report(p_reports jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_item   jsonb;
  v_recent int;
  v_count  int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin_sesion');
  end if;
  if p_reports is null or jsonb_typeof(p_reports) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'formato');
  end if;
  if jsonb_array_length(p_reports) > 20 or octet_length(p_reports::text) > 4096 then
    return jsonb_build_object('ok', false, 'error', 'muy_grande');
  end if;

  select count(*) into v_recent
    from public.reports
   where reporter = v_uid and created_at > now() - interval '1 day';

  for v_item in select value from jsonb_array_elements(p_reports) loop
    exit when v_recent + v_count >= 30;
    continue when jsonb_typeof(v_item) <> 'object';
    continue when coalesce(v_item ->> 'r', '') not in ('nombre', 'trampa', 'otro');
    continue when coalesce(char_length(v_item ->> 't'), 0) not between 1 and 64;
    continue when exists (
      select 1 from public.reports
       where reporter = v_uid and target_id = v_item ->> 't' and reason = v_item ->> 'r'
         and created_at > now() - interval '1 day');

    insert into public.reports (reporter, target_id, target_name, reason, note, context, ref, client_ts)
    values (
      v_uid,
      v_item ->> 't',
      left(v_item ->> 'n', 32),
      v_item ->> 'r',
      nullif(left(v_item ->> 'x', 200), ''),
      case when v_item ->> 'w' in ('guarida', 'arena', 'combate', 'social', 'otro') then v_item ->> 'w' else 'otro' end,
      case when v_item ->> 'ref' ~ '^[A-Za-z0-9_:.-]{1,40}$' then v_item ->> 'ref' end,
      case when jsonb_typeof(v_item -> 'ts') = 'number'
           then to_timestamp(least(greatest((v_item ->> 'ts')::numeric, 0), 32503680000000) / 1000) end
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'accepted', v_count);
end;
$$;

comment on function public.submit_report(jsonb) is 'v17: recibe la cola de reportes del cliente (auth.uid() es quien reporta).';

revoke all on function public.submit_report(jsonb) from public, anon;
grant execute on function public.submit_report(jsonb) to authenticated;
