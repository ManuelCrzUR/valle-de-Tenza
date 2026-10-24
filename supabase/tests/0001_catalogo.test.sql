begin;
select plan(9);

-- Datos de prueba (se ejecuta como postgres; RLS no aplica)
insert into public.municipios (slug, nombre) values ('prueba', 'Prueba');
insert into public.lugares (id, nombre, categoria, municipio, visible) values
  ('t-visible', 'Visible', 'atraccion', 'prueba', true),
  ('t-oculto',  'Oculto',  'atraccion', 'prueba', false);
insert into public.eventos (municipio, nombre, desde) values ('prueba', 'Fiesta', '2026-12-01');

select ok((select relrowsecurity from pg_class where oid = 'public.municipios'::regclass), 'RLS activado en municipios');
select ok((select relrowsecurity from pg_class where oid = 'public.lugares'::regclass), 'RLS activado en lugares');
select ok((select relrowsecurity from pg_class where oid = 'public.eventos'::regclass), 'RLS activado en eventos');

set local role anon;

select is((select count(*)::int from public.lugares where id = 't-visible'), 1, 'anon lee lugares visibles');
select is((select count(*)::int from public.lugares where id = 't-oculto'), 0, 'anon no ve lugares ocultos');
select is((select count(*)::int from public.municipios where slug = 'prueba'), 1, 'anon lee municipios');
select is((select count(*)::int from public.eventos where municipio = 'prueba'), 1, 'anon lee eventos');
select throws_ok(
  $$insert into public.lugares (id, nombre, categoria, municipio) values ('t-x', 'X', 'atraccion', 'prueba')$$,
  '42501', null, 'anon no puede insertar lugares');
select throws_ok(
  $$update public.lugares set nombre = 'Hack' where id = 't-visible'$$,
  '42501', null, 'anon no puede actualizar lugares');

reset role;
select * from finish();
rollback;
