-- v17 · Confianza — "Borrar mi cuenta" (derecho de supresión: Ley 25.326 art. 16, LGPD art. 18, y equivalentes).
-- ESTADO: preparada, NO aplicada. Revisar y aplicar con `supabase db push` (o pegar en el SQL Editor).
-- Idempotente: create or replace + revoke/grant.
--
-- delete_my_account(): borra SOLO lo del usuario que llama (auth.uid()), nunca por parámetro:
--   1. su fila de public.saves (la partida);
--   2. su usuario de auth.users (email, identidades y sesiones se van en cascada dentro de auth).
--   Los reportes que hizo quedan anónimos (public.reports.reporter → on delete set null).
-- security definer con search_path vacío: todos los nombres van calificados con su esquema.
-- El cliente (ui/cloud.js) la llama al borrar; sin conexión, queda pendiente y se llama al reconectar.
--
-- Verificar al aplicar: el dueño de la función (rol postgres) tiene que poder borrar de auth.users. Si el proyecto
-- lo impide, alternativa: Edge Function con la service role que llame a auth.admin.deleteUser(uid).

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
  delete from auth.users where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.delete_my_account() is 'v17: borra la partida y el usuario de quien llama (auth.uid()). Sin parámetros a propósito.';

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
