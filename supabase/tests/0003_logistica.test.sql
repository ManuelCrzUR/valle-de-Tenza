begin;
select plan(30);

-- Datos de prueba (como postgres; RLS no aplica)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000011', 'p@t.local'),
  ('cccccccc-0000-4000-8000-000000000013', 'c@t.local');
update public.perfiles set rol = 'coordinador' where id = 'cccccccc-0000-4000-8000-000000000013';
insert into public.negocios (id, perfil_id, nombre, tipo, municipio, cupo_diario, whatsapp, verificado) values
  ('a2000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000011', 'Hostal P', 'hotel', 'guateque', 4, '573001111111', true);
insert into public.rutas_transporte (id, origen, destino, empresa, modo) values
  ('d0000000-0000-4000-8000-000000000001', 'bogota', 'guateque', 'Flota Activa', 'bus');
insert into public.rutas_transporte (id, origen, destino, empresa, modo, activa) values
  ('d0000000-0000-4000-8000-000000000002', 'bogota', 'tenza', 'Flota Inactiva', 'bus', false);
insert into public.salidas (ruta_id, hora) values ('d0000000-0000-4000-8000-000000000001', '06:00');
insert into public.salidas (ruta_id, hora) values ('d0000000-0000-4000-8000-000000000002', '07:00');
insert into public.tramos (origen, destino, distancia_m, duracion_s) values ('mun:tenza', 'bogota', 1000, 60);
insert into public.clima (municipio, fecha, prob_lluvia_max) values ('tenza', current_date, 40);
insert into public.alertas_via (id, tipo, mensaje, desde, hasta) values
  ('e0000000-0000-4000-8000-000000000001', 'derrumbe', 'vigente', now() - interval '1 hour', now() + interval '1 hour'),
  ('e0000000-0000-4000-8000-000000000002', 'obra',     'vencida', now() - interval '2 days', now() - interval '1 day'),
  ('e0000000-0000-4000-8000-000000000003', 'cierre',   'futura',  now() + interval '1 day',  null),
  ('e0000000-0000-4000-8000-000000000004', 'otro',     'sin fin', now() - interval '1 day',  null);

select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.rutas_transporte'::regclass, 'public.salidas'::regclass, 'public.tramos'::regclass,
                'public.alertas_via'::regclass, 'public.clima'::regclass)), 'RLS activado en las tablas nuevas');
select ok(exists (select 1 from public.municipios where slug = 'guateque'), 'guateque existe en municipios');

-- Anónimo: lectura
set local role anon;
select is((select count(*)::int from public.rutas_transporte where id in
  ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002')), 1, 'anon lee solo rutas activas');
select is((select count(*)::int from public.salidas), 1, 'anon lee solo salidas de rutas activas');
select is((select count(*)::int from public.tramos where origen = 'mun:tenza'), 1, 'anon lee tramos');
select is((select count(*)::int from public.clima where municipio = 'tenza'), 1, 'anon lee clima');
select is((select count(*)::int from public.alertas_via where id::text like 'e0000000%'), 2, 'anon ve las alertas vigentes (con y sin fin)');
select is((select count(*)::int from public.alertas_via where mensaje = 'vencida'), 0, 'anon no ve alertas vencidas');
select is((select count(*)::int from public.alertas_via where mensaje = 'futura'), 0, 'anon no ve alertas futuras');

-- Anónimo: escritura
select throws_ok($$insert into public.alertas_via (tipo, mensaje) values ('otro', 'x')$$, '42501', null, 'anon no inserta alertas');
select throws_ok($$insert into public.rutas_transporte (origen, destino, empresa, modo) values ('bogota', 'tenza', 'X', 'bus')$$,
  '42501', null, 'anon no inserta rutas');
select throws_ok($$update public.rutas_transporte set activa = false$$, '42501', null, 'anon no actualiza rutas');
select throws_ok($$insert into public.salidas (ruta_id, hora) values ('d0000000-0000-4000-8000-000000000001', '08:00')$$,
  '42501', null, 'anon no inserta salidas');
select throws_ok($$insert into public.tramos (origen, destino, distancia_m, duracion_s) values ('a', 'b', 1, 1)$$,
  '42501', null, 'anon no inserta tramos');
select throws_ok($$insert into public.clima (municipio, fecha) values ('tenza', current_date + 1)$$,
  '42501', null, 'anon no inserta clima');
select throws_ok($$delete from public.alertas_via$$, '42501', null, 'anon no borra alertas');

-- Prestador
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000011","role":"authenticated"}';
select throws_ok($$insert into public.alertas_via (tipo, mensaje) values ('otro', 'x')$$, '42501', null,
  'el prestador no inserta alertas');
select throws_ok($$insert into public.rutas_transporte (origen, destino, empresa, modo) values ('bogota', 'tenza', 'X', 'bus')$$,
  '42501', null, 'el prestador no inserta rutas');
select is((select count(*)::int from public.alertas_via where id::text like 'e0000000%'), 2, 'el prestador solo ve alertas vigentes');
select throws_ok($$select public.verificar_negocio('a2000000-0000-4000-8000-000000000001', true)$$, '42501', null,
  'verificar_negocio falla para el prestador');
select throws_ok($$select public.liberar_lugar_negocio('a2000000-0000-4000-8000-000000000001')$$, '42501', null,
  'liberar_lugar_negocio falla para el prestador');

-- Coordinador
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000013","role":"authenticated"}';
select lives_ok($$insert into public.alertas_via (tipo, mensaje) values ('cierre', 'Cierre de prueba')$$,
  'el coordinador inserta una alerta');
select is((select creada_por from public.alertas_via where mensaje = 'Cierre de prueba'),
  'cccccccc-0000-4000-8000-000000000013'::uuid, 'creada_por toma auth.uid()');
select lives_ok($$insert into public.rutas_transporte (origen, destino, empresa, modo) values ('bogota', 'tenza', 'Nueva', 'bus')$$,
  'el coordinador inserta una ruta');
select ok((select count(*) from public.alertas_via where mensaje in ('vencida', 'futura')) = 2, 'el coordinador ve todas las alertas');
select is((select count(*)::int from public.rutas_transporte where activa = false), 1, 'el coordinador ve rutas inactivas');
select lives_ok($$select public.verificar_negocio('a2000000-0000-4000-8000-000000000001', false)$$,
  'verificar_negocio funciona para el coordinador');
select is((select verificado from public.negocios where id = 'a2000000-0000-4000-8000-000000000001'), false,
  'el negocio quedó sin verificar');
reset role;
update public.negocios set verificado = true where id = 'a2000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000013","role":"authenticated"}';
select lives_ok($$select public.liberar_lugar_negocio('a2000000-0000-4000-8000-000000000001')$$,
  'liberar_lugar_negocio funciona para el coordinador');
select is((select verificado from public.negocios where id = 'a2000000-0000-4000-8000-000000000001'), false,
  'liberar quita la verificación');

select * from finish();
rollback;
