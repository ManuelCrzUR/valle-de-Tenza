-- Línea base de las migraciones 001–003: RLS activo, solicitudes cerradas al público
-- y negocios visibles solo si están publicados (o para su dueño).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- RLS en todas las tablas del MVP
select ok(bool_and(c.relrowsecurity), 'RLS activo en todas las tablas del MVP')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('itineraries', 'reservation_requests', 'email_outbox', 'dossier_tokens',
                    'profiles', 'businesses', 'business_photos');

-- Datos de prueba (como dueño de la base)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@prueba.co'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@prueba.co');
insert into public.businesses (id, owner_id, name, category, municipality, description, lat, lng, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Publicado', 'restaurante', 'tenza', 'Descripción de prueba', 5.07, -73.42, 'published'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'Borrador', 'restaurante', 'tenza', 'Descripción de prueba', null, null, 'draft');

-- anon
set local role anon;
select throws_ok('select * from public.reservation_requests', '42501', null, 'anon no lee solicitudes');
select throws_ok('select * from public.email_outbox', '42501', null, 'anon no lee el outbox');
select throws_ok('select * from public.dossier_tokens', '42501', null, 'anon no lee tokens del dossier');
select throws_ok($$select public.crear_solicitud('{}'::jsonb)$$, '42501', null, 'anon no ejecuta crear_solicitud');
select is((select count(*)::int from public.businesses_public), 1, 'anon ve solo el negocio publicado (vía businesses_public)');
reset role;

-- Dueño A y usuario B
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select count(*)::int from public.businesses), 2, 'el dueño ve también su borrador');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is((select count(*)::int from public.businesses), 0, 'otro usuario no ve negocios ajenos (solo los propios)');
update public.businesses set name = 'Hackeado' where id = '10000000-0000-0000-0000-000000000001';
select throws_ok(
  $$insert into public.businesses (owner_id, name, category, municipality, description)
    values ('00000000-0000-0000-0000-0000000000a1', 'Ajeno', 'restaurante', 'tenza', 'Descripción de prueba')$$,
  '42501', null, 'no se crea un negocio a nombre de otro');
reset role;
select is((select name from public.businesses where id = '10000000-0000-0000-0000-000000000001'), 'Publicado',
  'otro usuario no edita un negocio ajeno');

select * from finish();
rollback;
