begin;
select plan(23);

insert into public.municipios (slug, nombre) values ('prueba', 'Prueba') on conflict do nothing;
insert into auth.users (id, email) values
  ('a6000000-0000-4000-8000-000000000001', 'ra@t.local'),
  ('b6000000-0000-4000-8000-000000000002', 'rb@t.local'),
  ('c6000000-0000-4000-8000-000000000003', 'rc@t.local');
update public.perfiles set rol = 'coordinador' where id = 'c6000000-0000-4000-8000-000000000003';
insert into public.negocios (id, perfil_id, nombre, tipo, municipio, cupo_diario) values
  ('a6100000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'Hostal RA', 'hotel', 'prueba', 10),
  ('b6100000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000002', 'Hostal RB', 'hotel', 'prueba', 10);
insert into public.reservas (id, codigo, negocio_id, tipo, fecha, noches, personas, nombre, contacto, estado) values
  ('a6200000-0000-4000-8000-000000000001', 'RSNA01', 'a6100000-0000-4000-8000-000000000001', 'hotel', public.hoy_bogota() - 3, 1, 2, 'Ana', '300 600 0001', 'confirmada'),
  ('a6200000-0000-4000-8000-000000000002', 'RSNA02', 'a6100000-0000-4000-8000-000000000001', 'hotel', public.hoy_bogota() - 3, 1, 2, 'Beto', '300 600 0002', 'pendiente'),
  ('a6200000-0000-4000-8000-000000000003', 'RSNA03', 'a6100000-0000-4000-8000-000000000001', 'hotel', public.hoy_bogota() + 3, 1, 2, 'Caro', '300 600 0003', 'confirmada'),
  ('a6200000-0000-4000-8000-000000000004', 'RSNA04', 'a6100000-0000-4000-8000-000000000001', 'hotel', public.hoy_bogota() - 1, 3, 2, 'Dani', '300 600 0004', 'confirmada'),
  ('a6200000-0000-4000-8000-000000000005', 'RSNA05', 'a6100000-0000-4000-8000-000000000001', 'hotel', public.hoy_bogota() - 5, 1, 2, 'Eli', '300 600 0005', 'confirmada');

select ok((select relrowsecurity from pg_class where oid = 'public.resenas'::regclass), 'RLS activado en resenas');

set local role anon;
select throws_ok($$select * from public.resenas$$, '42501', null, 'anon no lee resenas directo');
select is((select puede from public.resena_pendiente('rsna01', '3006000001')), true, 'resena_pendiente: puede en confirmada pasada');
select is((select puede from public.resena_pendiente('RSNA01', '3009999999')), false, 'resena_pendiente: contacto incorrecto no puede');
select throws_ok($$select public.dejar_resena('RSNA01', '3009999999', 5, 'x')$$, 'P0001', null, 'dejar_resena falla con contacto incorrecto');
select throws_ok($$select public.dejar_resena('RSNA02', '3006000002', 5, 'x')$$, 'P0001', null, 'falla con reserva pendiente');
select throws_ok($$select public.dejar_resena('RSNA03', '3006000003', 5, 'x')$$, 'P0001', null, 'falla con fecha futura');
select throws_ok($$select public.dejar_resena('RSNA04', '3006000004', 5, 'x')$$, 'P0001', null, 'falla si las noches aún no terminan');
select throws_ok($$select public.dejar_resena('RSNA01', '3006000001', 6, 'x')$$, 'P0001', null, 'falla con calificación fuera de 1-5');
select lives_ok($$select public.dejar_resena('rsna01', '300 600-0001', 5, '  Muy bueno  ')$$, 'funciona en confirmada pasada');
select throws_ok($$select public.dejar_resena('RSNA01', '3006000001', 4, 'otra')$$, 'P0001', 'Ya dejaste una reseña para esta reserva', 'la segunda vez falla');
select is((select puede from public.resena_pendiente('RSNA01', '3006000001')), false, 'resena_pendiente: ya no puede tras reseñar');
select is((select count(*)::int from public.resenas_publicas), 0, 'la reseña no es pública hasta moderarla');
select throws_ok($$select reserva_id from public.resenas_publicas$$, '42703', null, 'resenas_publicas no expone reserva_id');

reset role;
select is((select comentario from public.resenas where reserva_id = 'a6200000-0000-4000-8000-000000000001'), 'Muy bueno',
  'el comentario se guarda recortado y sin datos del viajero');

-- Resumen por lugar: solo cuentan las visibles
insert into public.resenas (lugar_id, calificacion, visible) values
  ('lugar-prueba-6', 5, true), ('lugar-prueba-6', 4, true), ('lugar-prueba-6', 1, false);
select is((select promedio::text || '/' || total from public.calificacion_lugares where lugar_id = 'lugar-prueba-6'), '4.5/2',
  'calificacion_lugares promedia solo las visibles');

-- Prestador dueño
set local role authenticated;
set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.resenas), 1, 'el prestador ve las reseñas de su negocio aunque no sean visibles');
update public.resenas set visible = true;
select is((select array_agg(codigo order by codigo) from public.reservas_para_resena), array['RSNA05'],
  'reservas_para_resena: solo confirmadas pasadas sin reseña');

reset role;
select is((select visible from public.resenas where reserva_id = 'a6200000-0000-4000-8000-000000000001'), false,
  'el prestador no puede cambiar visible');
set local role authenticated;

-- Otro prestador
set local request.jwt.claims = '{"sub":"b6000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.resenas) + (select count(*)::int from public.reservas_para_resena), 0,
  'otro prestador no ve reseñas ni reservas ajenas');

-- Coordinador
set local request.jwt.claims = '{"sub":"c6000000-0000-4000-8000-000000000003","role":"authenticated"}';
update public.resenas set visible = true where reserva_id = 'a6200000-0000-4000-8000-000000000001';

reset role;
select is((select visible from public.resenas where reserva_id = 'a6200000-0000-4000-8000-000000000001'), true,
  'el coordinador sí cambia visible');
set local role anon;
select is((select count(*)::int from public.resenas_publicas where negocio_id = 'a6100000-0000-4000-8000-000000000001'), 1,
  'tras moderar, la reseña aparece en resenas_publicas');

-- Purga de reservas: la reseña sobrevive anónima
reset role;
delete from public.reservas where id = 'a6200000-0000-4000-8000-000000000001';
select is((select reserva_id is null from public.resenas where negocio_id = 'a6100000-0000-4000-8000-000000000001'), true,
  'al purgar la reserva la reseña se conserva con reserva_id null');

select * from finish();
rollback;
