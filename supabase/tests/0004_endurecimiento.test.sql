-- Endurecimiento: search_path fijo y crear_perfil() fuera de la API, sin romper el alta de usuarios.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select ok(
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = f and p.proconfig::text like '%search_path=public, pg_temp%'),
  f || ' tiene search_path fijo')
from unnest(array['tocar_updated_at', 'tocar_info_ficha', 'limitar_precios', 'limitar_push_subscriptions', 'servicios_validos', 'crear_perfil']) as f;

select ok(not has_function_privilege('anon', 'public.crear_perfil()', 'execute'), 'anon no ejecuta crear_perfil()');
select ok(not has_function_privilege('authenticated', 'public.crear_perfil()', 'execute'), 'authenticated no ejecuta crear_perfil()');

-- El trigger sigue creando el perfil al dar de alta un usuario
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c3', 'c@prueba.co');
select ok(exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000c3'), 'el alta de usuario sigue creando su perfil');

select * from finish();
rollback;
