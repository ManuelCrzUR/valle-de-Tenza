begin;
select plan(44);

insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-000000000051', 'pa5@t.local'),
  ('33333333-0000-4000-8000-000000000052', 'pb5@t.local'),
  ('22222222-0000-4000-8000-000000000053', 'c5@t.local');
update public.perfiles set rol = 'coordinador' where id = '22222222-0000-4000-8000-000000000053';

insert into public.negocios (id, perfil_id, nombre, tipo, municipio, cupo_diario, cupo_actualizado) values
  ('a5000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000051', 'Hotel A5', 'hotel', 'tenza', 10,
   now() - interval '10 days'),
  ('a5000000-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000052', 'Hotel B5', 'hotel', 'tenza', 6, now());
insert into public.ocupacion (negocio_id, fecha, personas)
  values ('a5000000-0000-4000-8000-000000000001', current_date, 3);
insert into public.cupo_dia (negocio_id, fecha, cerrado)
  values ('a5000000-0000-4000-8000-000000000001', current_date + 1, true);
-- cupo_dia marca el negocio como actualizado: se devuelve a hace 10 días para probar «inactivos»
update public.negocios set cupo_actualizado = now() - interval '10 days' where id = 'a5000000-0000-4000-8000-000000000001';

select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.itinerarios_compartidos'::regclass, 'public.demanda'::regclass, 'public.limite_compartir'::regclass)),
  'RLS activado en las tablas nuevas');
select is((select count(*)::int from pg_extension where extname = 'pgcrypto'), 1, 'pgcrypto disponible');

-- Anónimo: sin lectura directa de nada
set local role anon;
set local request.headers = '{"x-forwarded-for":"203.0.113.5, 10.0.0.1"}';
select throws_ok($$select * from public.itinerarios_compartidos$$, '42501', null, 'anon no lista itinerarios_compartidos');
select throws_ok($$select * from public.demanda$$, '42501', null, 'anon no lee demanda');
select throws_ok($$select * from public.limite_compartir$$, '42501', null, 'anon no lee limite_compartir');
select throws_ok($$select * from public.ocupacion_diaria$$, '42501', null, 'anon no lee ocupacion_diaria');
select throws_ok($$select * from public.demanda_semanal$$, '42501', null, 'anon no lee demanda_semanal');
select throws_ok($$select * from public.brecha_hospedaje$$, '42501', null, 'anon no lee brecha_hospedaje');
select throws_ok($$select * from public.prestadores_inactivos$$, '42501', null, 'anon no lee prestadores_inactivos');
select throws_ok($$select * from public.metricas_prestador$$, '42501', null, 'anon no lee metricas_prestador');
select throws_ok($$insert into public.itinerarios_compartidos (id, eleccion) values ('AAAAAAAA', '{}')$$, '42501', null,
  'anon no inserta directo en itinerarios_compartidos');
select throws_ok($$insert into public.demanda (plan, dias, personas) values ('aventura', 1, 1)$$, '42501', null,
  'anon no inserta directo en demanda');
select throws_ok($$select public.consumir_limite('x', 1)$$, '42501', null, 'anon no llama al contador interno');

-- Compartir y ver
create temp table t_id (id text);
grant all on t_id to anon;
insert into t_id select public.compartir_itinerario('{"plan":"gastro","dias":2,"semilla":7}');
select matches((select id from t_id), '^[A-Za-z0-9]{8}$', 'el id tiene 8 caracteres alfanuméricos');
select is(public.ver_itinerario((select id from t_id)), '{"plan":"gastro","dias":2,"semilla":7}'::jsonb, 'ver devuelve la misma elección');
select is(public.ver_itinerario((select id from t_id)) ->> 'plan', 'gastro', 'segunda vista');
select is(public.ver_itinerario('NOEXISTE'), null, 'id inexistente devuelve null');
select throws_ok($$select public.compartir_itinerario('[1,2]')$$, 'P0001', null, 'rechaza elección que no es objeto');
select throws_ok($$select public.compartir_itinerario(jsonb_build_object('x', repeat('a', 9000)))$$, 'P0001', null,
  'rechaza elección demasiado grande');

-- Límite de 20 por día y por IP (ya van 1 exitosa; las 2 rechazadas no cuentan)
select is((select count(*)::int from (select public.compartir_itinerario('{"a":1}') from generate_series(1, 19)) s), 19,
  'hasta 19 más (20 en total) para la misma IP');
select throws_ok($$select public.compartir_itinerario('{"a":1}')$$, 'P0001', null, 'la creación 21 falla');
set local request.headers = '{"x-real-ip":"203.0.113.9"}';
select lives_ok($$select public.compartir_itinerario('{"a":2}')$$, 'otra IP (x-real-ip) tiene su propio contador');
reset role;
select is((select count(*)::int from public.limite_compartir where huella like '%203.0.113%'), 0, 'la IP no se guarda en claro');
select is((select vistas from public.itinerarios_compartidos where id = (select id from t_id)), 2, 'las vistas se suman');

-- Demanda anónima
set local role anon;
set local request.headers = '{"x-forwarded-for":"203.0.113.77"}';
select lives_ok($$select public.registrar_demanda('aventura', 'tenza', 2, 4, current_date + 9, 'carro')$$, 'registra demanda válida');
select throws_ok($$select public.registrar_demanda('otro', 'tenza', 2, 4, null, null)$$, 'P0001', null, 'plan fuera de dominio');
select throws_ok($$select public.registrar_demanda('gastro', 'tenza', 4, 4, null, null)$$, 'P0001', null, 'días fuera de dominio');
select throws_ok($$select public.registrar_demanda('gastro', 'tenza', 2, 13, null, null)$$, 'P0001', null, 'personas fuera de dominio');
select throws_ok($$select public.registrar_demanda('gastro', 'tenza', 2, 4, current_date + 400, null)$$, 'P0001', null, 'fecha fuera de ±1 año');
select throws_ok($$select public.registrar_demanda('gastro', 'tenza', 2, 4, null, 'avion')$$, 'P0001', null, 'transporte fuera de dominio');

-- Prestador A
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-4000-8000-000000000051","role":"authenticated"}';
select is((select count(distinct negocio_id)::int from public.ocupacion_diaria), 1, 'el prestador ve ocupacion_diaria solo de su negocio');
select is((select count(*)::int from public.ocupacion_diaria where negocio_id = 'a5000000-0000-4000-8000-000000000001'), 30,
  '30 días por negocio');
select is((select row(cupo, ocupado, libre)::text from public.ocupacion_diaria
  where negocio_id = 'a5000000-0000-4000-8000-000000000001' and fecha = public.hoy_bogota()), '(10,3,7)', 'cupo, ocupado y libre de hoy');
select is((select cupo from public.ocupacion_diaria
  where negocio_id = 'a5000000-0000-4000-8000-000000000001' and fecha = public.hoy_bogota() + 1), 0, 'día cerrado = cupo 0');
select is((select count(*)::int from public.demanda_semanal), 0, 'el prestador no ve la demanda');

-- Respuesta de reservas (como prestador: el trigger no choca con la validación de columnas)
reset role;
insert into public.reservas (id, codigo, negocio_id, tipo, fecha, personas, nombre, contacto, creada) values
  ('b5000000-0000-4000-8000-000000000001', 'T5AAAA', 'a5000000-0000-4000-8000-000000000001', 'hotel', current_date + 3, 2, 'x', '1', now() - interval '2 hours'),
  ('b5000000-0000-4000-8000-000000000002', 'T5BBBB', 'a5000000-0000-4000-8000-000000000001', 'hotel', current_date + 3, 2, 'x', '1', now() - interval '2 hours'),
  ('b5000000-0000-4000-8000-000000000003', 'T5CCCC', 'a5000000-0000-4000-8000-000000000001', 'hotel', current_date + 3, 2, 'x', '1', now());
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-4000-8000-000000000051","role":"authenticated"}';
select lives_ok($$update public.reservas set estado = 'confirmada' where id = 'b5000000-0000-4000-8000-000000000001';
  update public.reservas set estado = 'rechazada' where id = 'b5000000-0000-4000-8000-000000000002'$$,
  'el prestador responde reservas');
select is((select row(total, confirmadas, rechazadas, tasa_confirmacion)::text from public.metricas_prestador
  where negocio_id = 'a5000000-0000-4000-8000-000000000001'), '(3,1,1,0.500)', 'métricas del prestador');
select ok((select respuesta_media >= interval '2 hours' from public.metricas_prestador
  where negocio_id = 'a5000000-0000-4000-8000-000000000001'), 'respuesta media calculada con respondida');

-- Coordinador
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-0000-4000-8000-000000000053","role":"authenticated"}';
select cmp_ok((select count(*)::int from public.demanda_semanal where municipio = 'tenza' and plan = 'aventura'), '>=', 1,
  'el coordinador ve demanda_semanal');
select is((select personas_demandadas from public.brecha_hospedaje where municipio = 'tenza' and fecha = current_date + 9), 4,
  'brecha: personas demandadas');
select cmp_ok((select cupo_disponible from public.brecha_hospedaje where municipio = 'tenza' and fecha = current_date + 9), '>=', 16,
  'brecha: cupo libre de hoteles (A5 + B5)');
select is((select count(*)::int from public.ocupacion_diaria
  where negocio_id in ('a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002')
  and fecha = public.hoy_bogota()), 2, 'el coordinador ve ocupación de todos');
select is((select count(*)::int from public.prestadores_inactivos where negocio_id = 'a5000000-0000-4000-8000-000000000001'), 1,
  'inactivos: sin cupo hace 10 días');
select is((select count(*)::int from public.prestadores_inactivos where negocio_id = 'a5000000-0000-4000-8000-000000000002'), 0,
  'inactivos: el reciente no aparece');

select * from finish();
rollback;
