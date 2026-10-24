begin;
select plan(23);

insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-000000000041', 'p4@t.local'),
  ('22222222-0000-4000-8000-000000000042', 'c4@t.local');
update public.perfiles set rol = 'coordinador' where id = '22222222-0000-4000-8000-000000000042';

insert into public.ajustes (clave, valor) values ('prueba_4', '{"texto":"hola"}');
insert into public.embajadores (id, nombre, municipio, whatsapp, horario, activo) values
  ('f4000000-0000-4000-8000-000000000001', 'Todo el día', 'guateque', '573000000001',
   '[{"dias":[1,2,3,4,5,6,7],"desde":"00:00","hasta":"23:59"}]', true),
  ('f4000000-0000-4000-8000-000000000002', 'Sin franja', 'guateque', '573000000002', '[]', true),
  ('f4000000-0000-4000-8000-000000000003', 'Inactivo', 'guateque', '573000000003',
   '[{"dias":[1,2,3,4,5,6,7],"desde":"00:00","hasta":"23:59"}]', false);
insert into public.eventos (id, municipio, nombre, desde) overriding system value
  values (900000001, 'tenza', 'Fiesta de prueba', date '2030-01-01');
insert into public.lugares (id, nombre, categoria, municipio) values ('prueba4:lugar', 'Lugar de prueba', 'atraccion', 'tenza');
insert into public.lugares (id, nombre, categoria, municipio, visible) values ('prueba4:oculto', 'Oculto de prueba', 'atraccion', 'tenza', false);

select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.ajustes'::regclass, 'public.embajadores'::regclass)), 'RLS activado en las tablas nuevas');

-- Anónimo
set local role anon;
select is((select count(*)::int from public.ajustes where clave = 'prueba_4'), 1, 'anon lee ajustes');
select is((select count(*)::int from public.embajadores where id::text like 'f4000000%'), 2, 'anon ve solo embajadores activos');
select is((select count(*)::int from public.eventos where id = 900000001), 1, 'anon lee eventos');
select is((select count(*)::int from public.lugares where id like 'prueba4:%'), 1, 'anon no ve lugares ocultos');
select is((select count(*)::int from public.embajadores_disponibles() where id::text like 'f4000000%'), 1,
  'disponibles: solo el activo cuya franja cubre la hora');
select throws_ok($$insert into public.ajustes (clave, valor) values ('x', '1')$$, '42501', null, 'anon no escribe ajustes');
select throws_ok($$insert into public.embajadores (nombre, municipio, whatsapp) values ('x', 'tenza', '1')$$, '42501', null, 'anon no inserta embajadores');
select throws_ok($$insert into public.eventos (municipio, nombre, desde) values ('tenza', 'x', current_date)$$, '42501', null, 'anon no inserta eventos');
select throws_ok($$update public.lugares set acceso = 'x'$$, '42501', null, 'anon no actualiza lugares');

-- Prestador
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-4000-8000-000000000041","role":"authenticated"}';
select throws_ok($$insert into public.eventos (municipio, nombre, desde) values ('tenza', 'x', current_date)$$, '42501', null, 'el prestador no inserta eventos');
select throws_ok($$insert into public.ajustes (clave, valor) values ('x', '1')$$, '42501', null, 'el prestador no escribe ajustes');
select throws_ok($$insert into public.embajadores (nombre, municipio, whatsapp) values ('x', 'tenza', '1')$$, '42501', null, 'el prestador no inserta embajadores');
with u as (update public.lugares set acceso = 'hackeado' where id = 'prueba4:lugar' returning 1)
select is((select count(*)::int from u), 0, 'el prestador no actualiza acceso (la política no deja filas)');
select is((select count(*)::int from public.lugares where id = 'prueba4:oculto'), 0, 'el prestador no ve ocultos');

-- Coordinador
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-0000-4000-8000-000000000042","role":"authenticated"}';
select lives_ok($$insert into public.eventos (municipio, nombre, desde) values ('tenza', 'Mercado de prueba', date '2030-02-02')$$, 'el coordinador inserta eventos');
select lives_ok($$insert into public.ajustes (clave, valor) values ('prueba_4b', '[]')$$, 'el coordinador escribe ajustes');
select lives_ok($$insert into public.embajadores (nombre, municipio, whatsapp) values ('Nuevo', 'tenza', '573000000009')$$, 'el coordinador inserta embajadores');
select is((select count(*)::int from public.embajadores where id::text like 'f4000000%'), 3, 'el coordinador ve también los inactivos');
select is((select count(*)::int from public.lugares where id = 'prueba4:oculto'), 1, 'el coordinador ve lugares ocultos');
with u as (update public.lugares set acceso = 'Sendero corto', verificado_en = current_date, visible = false
           where id = 'prueba4:lugar' returning 1)
select is((select count(*)::int from u), 1, 'el coordinador actualiza acceso, verificado_en y visible');
select throws_ok($$update public.lugares set nombre = 'Otro' where id = 'prueba4:lugar'$$, '42501', null,
  'el coordinador no cambia el nombre');

-- Franja que no cubre la hora actual
reset role;
update public.embajadores set horario = '[{"dias":[1,2,3,4,5,6,7],"desde":"00:00","hasta":"00:00"}]'
  where id = 'f4000000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.embajadores_disponibles() where id::text like 'f4000000%'), 0,
  'una franja que no cubre la hora no aparece');

select * from finish();
rollback;
