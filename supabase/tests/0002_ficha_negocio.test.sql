-- Ficha del negocio: privacidad de contacto vía businesses_public, precios y fotos con RLS,
-- límite de precios, sello info_updated_at y formatos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@prueba.co'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@prueba.co');
insert into public.businesses (id, owner_id, name, category, municipality, description, lat, lng, status,
                               phone, whatsapp, show_phone, show_whatsapp, notify_email) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Publicado', 'restaurante', 'tenza',
   'Descripción de prueba', 5.07, -73.42, 'published', '3101112233', '3204445566', false, true, 'dueno@prueba.co'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'Borrador', 'restaurante', 'tenza',
   'Descripción de prueba', null, null, 'draft', null, null, false, false, null);
insert into public.business_photos (business_id, storage_path) values
  ('10000000-0000-0000-0000-000000000001', 'a/pub.jpg'),
  ('10000000-0000-0000-0000-000000000002', 'a/borrador.jpg');
insert into public.business_prices (business_id, item, price_cop) values
  ('10000000-0000-0000-0000-000000000001', 'Almuerzo', 15000),
  ('10000000-0000-0000-0000-000000000002', 'Plato borrador', 9000);

-- anon
set local role anon;
select throws_ok('select * from public.businesses', '42501', null, 'anon no lee la tabla businesses');
select is((select count(*)::int from public.businesses_public), 1, 'anon ve 1 negocio en la vista pública');
select ok((select phone is null from public.businesses_public), 'teléfono oculto (show_phone = false)');
select ok((select whatsapp is not null from public.businesses_public), 'whatsapp visible (show_whatsapp = true)');
select is((select count(*)::int from public.business_photos), 1, 'anon ve solo fotos del publicado');
select is((select count(*)::int from public.business_prices), 1, 'anon ve solo precios del publicado');
reset role;

select hasnt_column('public', 'businesses_public', 'owner_id', 'la vista no expone owner_id');
select hasnt_column('public', 'businesses_public', 'notify_email', 'la vista no expone notify_email');

-- Usuario B
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select throws_ok(
  $$insert into public.business_prices (business_id, item) values ('10000000-0000-0000-0000-000000000001', 'Ajeno')$$,
  '42501', null, 'B no inserta precios en el negocio de A');
update public.business_prices set item = 'Hackeado' where business_id = '10000000-0000-0000-0000-000000000001';
reset role;
select is((select count(*)::int from public.business_prices where item = 'Hackeado'), 0, 'B no edita precios de A');

-- Dueño A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$insert into public.business_prices (business_id, item, price_cop)
    select '10000000-0000-0000-0000-000000000001', 'Item ' || g, 1000 from generate_series(1, 39) g$$,
  'A inserta hasta completar 40 precios');
select throws_ok(
  $$insert into public.business_prices (business_id, item) values ('10000000-0000-0000-0000-000000000001', 'Item 41')$$,
  '23514', null, 'el precio 41 falla');
reset role;

-- info_updated_at
update public.businesses set info_updated_at = '2020-01-01' where id = '10000000-0000-0000-0000-000000000001';
update public.businesses set status = 'draft' where id = '10000000-0000-0000-0000-000000000001';
select ok((select info_updated_at < '2021-01-01' from public.businesses where id = '10000000-0000-0000-0000-000000000001'),
  'cambiar solo el estado no toca info_updated_at');
update public.businesses set price_note = 'Desde el almuerzo' where id = '10000000-0000-0000-0000-000000000001';
select ok((select info_updated_at > '2021-01-01' from public.businesses where id = '10000000-0000-0000-0000-000000000001'),
  'info_updated_at cambia al editar price_note');

select throws_ok(
  $$update public.businesses set website = 'http://x' where id = '10000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'website debe empezar por https://');

select * from finish();
rollback;
