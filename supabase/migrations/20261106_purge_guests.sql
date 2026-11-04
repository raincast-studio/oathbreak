-- v17 · Confianza — Conservación: los invitados (cuentas anónimas sin email) se borran a los 30 días sin actividad.
-- Es lo que dicen la tarjeta de Cuenta y la Política de privacidad (docs/legal/privacidad.md).
-- ESTADO: preparada, NO aplicada. Idempotente.
--
-- "Sin actividad" = la partida no se guardó en 30 días (saves.updated_at) y no hubo inicio de sesión en 30 días.
-- Solo la puede ejecutar el equipo (service_role / postgres) o el programador de tareas; nadie desde el cliente.

create or replace function public.purge_inactive_guests(p_days int default 30)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  with gone as (
    delete from auth.users u
     where u.is_anonymous
       and coalesce(u.last_sign_in_at, u.created_at) < now() - make_interval(days => greatest(p_days, 30))
       and not exists (
         select 1 from public.saves s
          where s.player_id = u.id and s.updated_at >= now() - make_interval(days => greatest(p_days, 30)))
     returning u.id
  )
  select count(*) into v_n from gone;
  -- Por si saves.player_id no tiene "on delete cascade": se limpian las filas huérfanas.
  delete from public.saves s where not exists (select 1 from auth.users u where u.id = s.player_id);
  return v_n;
end;
$$;

comment on function public.purge_inactive_guests(int) is 'v17: borra invitados anónimos con 30+ días sin actividad (mínimo 30). Devuelve cuántos.';

revoke all on function public.purge_inactive_guests(int) from public, anon, authenticated;

-- Programarla (una vez por día, 06:17 UTC) requiere la extensión pg_cron. Descomentar al aplicar:
-- create extension if not exists pg_cron;
-- select cron.schedule('oathbreak-purge-guests', '17 6 * * *', $cron$select public.purge_inactive_guests(30)$cron$);
