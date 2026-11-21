-- Endurecimiento según los avisos de seguridad de Supabase (database linter). No cambia datos ni esquema de tablas.
-- 1. search_path fijo en funciones sin security definer (lint 0011): evita que un search_path ajeno cambie a qué objeto apuntan.
alter function public.tocar_updated_at() set search_path = public, pg_temp;
alter function public.tocar_info_ficha() set search_path = public, pg_temp;
alter function public.limitar_precios() set search_path = public, pg_temp;
alter function public.limitar_push_subscriptions() set search_path = public, pg_temp;
alter function public.servicios_validos(text[]) set search_path = public, pg_temp;

-- 2. crear_perfil() es la función del trigger de auth.users: nadie debe llamarla por /rest/v1/rpc (lints 0028 y 0029).
--    Un trigger no necesita EXECUTE del rol que inserta, así que el alta de usuarios sigue funcionando.
alter function public.crear_perfil() set search_path = public, pg_temp;
revoke execute on function public.crear_perfil() from public, anon, authenticated;

-- Se mantienen a propósito (documentado en docs/configuracion-mvp.md):
--   businesses_public (vista security definer): expone solo columnas públicas y el contacto con permiso del negocio;
--     con security_invoker, anon necesitaría leer la tabla businesses completa.
--   negocio_visible() y mis_solicitudes(): security definer con search_path fijo; filtran por publicación y por auth.uid().
