-- Solicitudes al negocio: consentimiento, RLS de las tablas nuevas, mis_solicitudes(), push y retención.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@prueba.co'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@prueba.co');
insert into public.businesses (id, owner_id, name, category, municipality, description, lat, lng, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Negocio A', 'restaurante', 'tenza', 'Descripción de prueba', 5.07, -73.42, 'published'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'Negocio B', 'restaurante', 'tenza', 'Descripción de prueba', 5.07, -73.42, 'published');

-- Dos solicitudes vía crear_solicitud (como dueño de la base)
select is(
  (public.crear_solicitud('{"idempotency_key":"k-si","nombre":"Ana Viajera","correo":"ana@x.co","telefono":"3001234567","fecha":"2027-01-10","personas":2,"comparte_datos":true,"municipio":"tenza","plan":"p","itinerario":{"dias":[]}}'::jsonb))->>'comparte_datos',
  'true', 'crear_solicitud devuelve comparte_datos = true');
select is(
  (public.crear_solicitud('{"idempotency_key":"k-no","nombre":"Beto Privado","correo":"beto@x.co","telefono":"3009999999","fecha":"2027-01-11","personas":3,"municipio":"tenza","plan":"p","itinerario":{"dias":[]}}'::jsonb))->>'comparte_datos',
  'false', 'sin consentimiento comparte_datos = false por defecto');
select is(
  (public.crear_solicitud('{"idempotency_key":"k-si","nombre":"x","correo":"x@x.co","fecha":"2027-01-10","personas":1,"municipio":"tenza","plan":"p"}'::jsonb))->>'comparte_datos',
  'true', 'la rama idempotente también devuelve comparte_datos');

insert into public.request_businesses (request_id, business_id)
select id, '10000000-0000-0000-0000-000000000001' from public.reservation_requests;

-- anon
set local role anon;
select throws_ok('select * from public.request_businesses', '42501', null, 'anon no lee request_businesses');
select throws_ok('select * from public.notification_outbox', '42501', null, 'anon no lee notification_outbox');
select throws_ok('select * from public.push_subscriptions', '42501', null, 'anon no lee push_subscriptions');
select throws_ok('select * from public.mis_solicitudes()', '42501', null, 'anon no ejecuta mis_solicitudes');
select throws_ok($$select public.destinatario_aviso('10000000-0000-0000-0000-000000000001')$$, '42501', null, 'anon no ejecuta destinatario_aviso');
reset role;

-- Dueño A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select count(*)::int from public.mis_solicitudes()), 1, 'A ve solo la solicitud que comparte datos');
select is((select nombre || '/' || telefono from public.mis_solicitudes()), 'Ana Viajera/3001234567', 'A ve nombre y teléfono del viajero');
select lives_ok(
  $$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.ejemplo/a', 'p', 'a')$$,
  'A inserta su suscripción');
select throws_ok($$select public.destinatario_aviso('10000000-0000-0000-0000-000000000001')$$, '42501', null, 'authenticated no ejecuta destinatario_aviso');
select throws_ok($$select public.purgar_solicitudes()$$, '42501', null, 'authenticated no ejecuta purgar_solicitudes');
reset role;

-- Usuario B
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is((select count(*)::int from public.mis_solicitudes()), 0, 'B no ve solicitudes de A');
select is((select count(*)::int from public.push_subscriptions), 0, 'B no ve suscripciones de A');
select throws_ok(
  $$insert into public.push_subscriptions (owner_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-0000000000a1', 'https://push.ejemplo/b', 'p', 'a')$$,
  '42501', null, 'B no inserta suscripciones a nombre de A');
reset role;

-- Límite de 10 suscripciones
select throws_ok(
  $$insert into public.push_subscriptions (owner_id, endpoint, p256dh, auth)
    select '00000000-0000-0000-0000-0000000000a1', 'https://push.ejemplo/n' || g, 'p', 'a' from generate_series(1, 10) g$$,
  '23514', null, 'la suscripción 11 de un usuario falla');

-- Retención: solicitud de hace 13 meses
select public.crear_solicitud('{"idempotency_key":"k-vieja","nombre":"Vieja","correo":"v@x.co","fecha":"2026-01-10","personas":1,"municipio":"tenza","plan":"p","itinerario":{"dias":[]}}'::jsonb);
update public.reservation_requests set created_at = now() - interval '13 months' where idempotency_key = 'k-vieja';
select public.purgar_solicitudes();
select is((select count(*)::int from public.reservation_requests where idempotency_key = 'k-vieja'), 0, 'purgar_solicitudes borra la de 13 meses');
select is((select count(*)::int from public.reservation_requests where idempotency_key = 'k-si'), 1, 'purgar_solicitudes conserva las recientes');

select * from finish();
rollback;
