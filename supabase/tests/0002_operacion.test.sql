begin;
select plan(48);

-- Datos de prueba (como postgres; RLS no aplica)
insert into public.municipios (slug, nombre) values ('prueba', 'Prueba') on conflict do nothing;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@t.local'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@t.local'),
  ('cccccccc-0000-4000-8000-000000000003', 'c@t.local');
update public.perfiles set rol = 'coordinador' where id = 'cccccccc-0000-4000-8000-000000000003';
insert into public.negocios (id, perfil_id, nombre, tipo, municipio, cupo_diario, whatsapp) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Hostal A', 'hotel', 'prueba', 4, '573001111111'),
  ('b1000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'Hostal B', 'hotel', 'prueba', 10, '573002222222');

select is((select nombre from public.perfiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'a@t.local',
  'el trigger crea el perfil con el correo como nombre');
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.perfiles'::regclass, 'public.negocios'::regclass, 'public.cupo_dia'::regclass,
                'public.reservas'::regclass, 'public.ocupacion'::regclass)), 'RLS activado en todas las tablas nuevas');

-- Reservas como viajero anónimo. Con cupo 4: 3 pasan, luego 2 fallan.
-- (El `for update` sobre la fila del negocio serializa las llamadas concurrentes reales; aquí se simula en secuencia.)
set local role anon;
select is((select estado::text from public.crear_reserva('negocio:a1000000-0000-4000-8000-000000000001', 'hotel',
  public.hoy_bogota() + 5, null, 1, 3, 'Ana', '300 111 2222', null)), 'pendiente', 'reserva de 3 personas con cupo 4');
select throws_ok($$select * from public.crear_reserva('negocio:a1000000-0000-4000-8000-000000000001', 'hotel',
  public.hoy_bogota() + 5, null, 1, 2, 'Luis', '300 333 4444', null)$$, 'P0001', null, 'la segunda reserva (2) no cabe en el cupo restante (1)');
select is(public.cupo_libre('a1000000-0000-4000-8000-000000000001', public.hoy_bogota() + 5), 1, 'cupo_libre = 1');
select is((select personas from public.ocupacion where negocio_id = 'a1000000-0000-4000-8000-000000000001'
  and fecha = public.hoy_bogota() + 5), 3, 'ocupacion refleja las 3 personas y es pública');

-- Validaciones
select throws_ok($$select * from public.crear_reserva(null, 'hotel', public.hoy_bogota() - 1, null, 1, 2, 'X', '300', null)$$,
  'P0001', null, 'rechaza fecha pasada');
select throws_ok($$select * from public.crear_reserva(null, 'hotel', public.hoy_bogota(), null, 1, 31, 'X', '300', null)$$,
  'P0001', null, 'rechaza más de 30 personas');
select throws_ok($$select * from public.crear_reserva(null, 'hotel', public.hoy_bogota(), null, 1, 2, '  ', '300', null)$$,
  'P0001', null, 'rechaza nombre vacío');
select throws_ok($$select * from public.crear_reserva(null, 'hotel', public.hoy_bogota(), null, 1, 2, 'X', 'abc', null)$$,
  'P0001', null, 'rechaza contacto sin dígitos');
-- Sin negocio: queda pendiente con negocio_id null (demo)
select is((select estado::text from public.crear_reserva('lugar-sin-dueno', 'restaurante', public.hoy_bogota() + 1,
  '12:00', 1, 2, 'Eva', '3009990000', null)), 'pendiente', 'lugar sin dueño queda pendiente');
-- Límite de 5 por contacto por día (ya van 1 con este contacto; 4 más; la 6.ª falla)
select lives_ok($$select * from public.crear_reserva('x1', 'restaurante', public.hoy_bogota() + 2, null, 1, 1, 'E', '300-999-0000', null);
  select * from public.crear_reserva('x2', 'restaurante', public.hoy_bogota() + 2, null, 1, 1, 'E', '300 999 0000', null);
  select * from public.crear_reserva('x3', 'restaurante', public.hoy_bogota() + 2, null, 1, 1, 'E', '3009990000', null);
  select * from public.crear_reserva('x4', 'restaurante', public.hoy_bogota() + 2, null, 1, 1, 'E', '3009990000', null)$$,
  'hasta 5 reservas por contacto');
select throws_ok($$select * from public.crear_reserva('x5', 'restaurante', public.hoy_bogota() + 2, null, 1, 1, 'E', '300 999 0000', null)$$,
  'P0001', null, 'la 6.ª reserva del día con el mismo contacto falla');

-- Privacidad del anónimo
select throws_ok($$select * from public.reservas$$, '42501', null, 'anon no lee reservas');
select throws_ok($$insert into public.reservas (codigo, tipo, fecha, personas, nombre, contacto)
  values ('ZZZZZZ', 'hotel', current_date, 1, 'x', 'y')$$, '42501', null, 'anon no inserta en reservas');
select throws_ok($$select whatsapp from public.negocios_publicos$$, '42703', null, 'negocios_publicos no expone whatsapp');
select is((select count(*)::int from public.negocios_publicos where id = 'a1000000-0000-4000-8000-000000000001'), 1,
  'anon ve el negocio activo en la vista pública');

-- mi_reserva / cancelar
reset role;
insert into public.reservas (codigo, negocio_id, tipo, fecha, personas, nombre, contacto, estado, creada) values
  ('ABCDEF', 'a1000000-0000-4000-8000-000000000001', 'hotel', current_date + 20, 1, 'Zoe', '+57 311 000 0000', 'pendiente', now() - interval '3 days'),
  ('GHJKLM', 'b1000000-0000-4000-8000-000000000002', 'hotel', current_date + 20, 2, 'Bea', '3120000000', 'pendiente', now());
set local role anon;
select is((select count(*)::int from public.mi_reserva('ABCDEF', '999')), 0, 'mi_reserva con contacto equivocado no devuelve nada');
select is((select nombre from public.mi_reserva('abcdef', '57 (311) 000-0000')), 'Zoe', 'mi_reserva con contacto normalizado');

-- Prestador A
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.reservas where negocio_id = 'b1000000-0000-4000-8000-000000000002'), 0,
  'prestador A no ve reservas del negocio de B');
select throws_ok($$update public.reservas set personas = 9 where codigo = 'ABCDEF'$$, '42501', null,
  'prestador no puede cambiar personas');
select throws_ok($$update public.reservas set contacto = '1' where codigo = 'ABCDEF'$$, '42501', null,
  'prestador no puede cambiar contacto');
select lives_ok($$update public.reservas set estado = 'confirmada' where codigo = 'ABCDEF'$$, 'prestador confirma una pendiente');
select throws_ok($$update public.reservas set estado = 'pendiente' where codigo = 'ABCDEF'$$, 'P0001', null,
  'transición confirmada→pendiente no permitida');

-- cupo_libre con cupo_dia y cerrado (como postgres)
reset role;
insert into public.cupo_dia (negocio_id, fecha, cupo) values ('b1000000-0000-4000-8000-000000000002', current_date + 40, 6);
insert into public.cupo_dia (negocio_id, fecha, cerrado) values ('b1000000-0000-4000-8000-000000000002', current_date + 41, true);
select is(public.cupo_libre('b1000000-0000-4000-8000-000000000002', current_date + 40), 6, 'cupo_libre usa cupo_dia');
select is(public.cupo_libre('b1000000-0000-4000-8000-000000000002', current_date + 41), 0, 'cupo_libre respeta cerrado');

-- Vencimiento
insert into public.reservas (codigo, negocio_id, tipo, fecha, personas, nombre, contacto, creada) values
  ('VENCER', 'b1000000-0000-4000-8000-000000000002', 'hotel', current_date + 30, 1, 'Vi', '3130000000', now() - interval '3 days');
select is(public.vencer_reservas(), 1, 'vencer_reservas vence la pendiente de hace 3 días');
-- Privilegios de ejecución: nada de lo interno queda abierto a anon/authenticated por el PUBLIC por defecto
select ok(not has_function_privilege('anon', 'public.vencer_reservas()', 'execute'), 'anon no ejecuta vencer_reservas');
select ok(not has_function_privilege('authenticated', 'public.vencer_reservas()', 'execute'), 'authenticated no ejecuta vencer_reservas');
select ok(not has_function_privilege('anon', 'public.purgar_reservas()', 'execute'), 'anon no ejecuta purgar_reservas');
select ok(not has_function_privilege('anon', 'public.normalizar_contacto(text)', 'execute'), 'anon no ejecuta normalizar_contacto');
select ok(not has_function_privilege('anon', 'public.ajustar_ocupacion(uuid, date, int)', 'execute'), 'anon no ejecuta ajustar_ocupacion');
select ok(not has_sequence_privilege('anon', 'public.eventos_id_seq', 'usage'), 'anon no usa la secuencia de eventos');
select ok(not exists (
  select 1 from pg_proc p, unnest(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.pronamespace = 'public'::regnamespace and a::text like '=%'), 'ninguna función de public es ejecutable por PUBLIC');

-- Ocupación incremental: rechazar o cancelar libera personas; confirmar no las duplica
select is((select personas from public.ocupacion where negocio_id = 'a1000000-0000-4000-8000-000000000001' and fecha = current_date + 20),
  1, 'ocupación cuenta la reserva pendiente/confirmada insertada directamente');
update public.reservas set estado = 'cancelada' where codigo = 'ABCDEF';
select is((select personas from public.ocupacion where negocio_id = 'a1000000-0000-4000-8000-000000000001' and fecha = current_date + 20),
  0, 'cancelar libera la ocupación');

-- Validaciones nuevas
set local role anon;
select throws_ok($$select * from public.crear_reserva(null, 'hotel', public.hoy_bogota() + 400, null, 1, 2, 'X', '3140000001', null)$$,
  'P0001', null, 'rechaza fechas a más de un año');
select throws_ok($$select * from public.crear_reserva(null, 'hotel', public.hoy_bogota() + 3, null, 1, 2, repeat('x', 500), '3140000002', null)$$,
  'P0001', null, 'rechaza nombre demasiado largo');
select throws_ok($$select * from public.crear_reserva(null, 'hotel', public.hoy_bogota() + 3, null, 1, 2, 'X', '3140000003', repeat('x', 5000))$$,
  'P0001', null, 'rechaza nota demasiado larga');
select throws_ok($$select * from public.crear_reserva('negocio:00000000-0000-4000-8000-00000000dead', 'hotel', public.hoy_bogota() + 3, null, 1, 2, 'X', '3140000004', null)$$,
  'P0001', null, 'rechaza un negocio: inexistente en vez de crear una reserva huérfana');
select throws_ok($$select * from public.crear_reserva('negocio:no-es-uuid', 'hotel', public.hoy_bogota() + 3, null, 1, 2, 'X', '3140000005', null)$$,
  'P0001', null, 'rechaza un negocio: mal formado');
select throws_ok($$select public.vencer_reservas()$$, '42501', null, 'anon no puede vencer reservas');

-- Prestador B no escala privilegios
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$update public.perfiles set rol = 'admin' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$, '42501', null, 'no puede cambiar su rol');
select throws_ok($$update public.negocios set verificado = true where id = 'b1000000-0000-4000-8000-000000000002'$$, '42501', null, 'no puede marcarse verificado');
select throws_ok($$update public.negocios set perfil_id = 'aaaaaaaa-0000-4000-8000-000000000001' where id = 'b1000000-0000-4000-8000-000000000002'$$, '42501', null, 'no puede mover su negocio a otro perfil');
select throws_ok($$insert into public.negocios (perfil_id, nombre, tipo, municipio, cupo_diario)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'Intruso', 'hotel', 'prueba', 1)$$, '42501', null, 'no puede crear negocios a nombre de otro');
select throws_ok($$delete from public.ocupacion$$, '42501', null, 'no puede escribir en ocupacion');

-- Borrado a los 12 meses
reset role;
insert into public.reservas (codigo, tipo, fecha, personas, nombre, contacto, creada) values
  ('VIEJA1', 'hotel', current_date - 400, 1, 'Old', '3150000000', now() - interval '13 months'),
  ('NUEVA1', 'hotel', current_date + 3, 1, 'New', '3150000001', now());
select is(public.purgar_reservas(), 1, 'purgar_reservas borra solo lo de más de 12 meses');
select * from finish();
rollback;
