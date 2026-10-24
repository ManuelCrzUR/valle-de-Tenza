-- Datos de desarrollo (solo local, tras `supabase db reset`). Contraseña de ambos: clave-prueba-123
-- Los lugares se cargan con `npm run cargar`; los municipios se completan allí con upsert.

-- Salvaguarda: este archivo crea usuarios con contraseña conocida. Solo corre sobre una base vacía
-- (`supabase db reset` local). Si la base ya tiene usuarios reales, aborta.
do $$
begin
  if exists (select 1 from auth.users where email not like '%@prueba.local') then
    raise exception 'seed.sql abortado: auth.users contiene usuarios reales; el seed es solo para desarrollo local';
  end if;
end $$;

insert into public.municipios (slug, nombre) values
  ('guayata', 'Guayatá'), ('somondoco', 'Somondoco'), ('tenza', 'Tenza'), ('sutatenza', 'Sutatenza'),
  ('almeida', 'Almeida'), ('chivor', 'Chivor'), ('la-capilla', 'La Capilla')
on conflict do nothing;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'prestador@prueba.local', crypt('clave-prueba-123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"nombre":"Prestador de prueba"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'coordinador@prueba.local', crypt('clave-prueba-123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"nombre":"Coordinador de prueba"}', now(), now(), '', '', '', '')
on conflict do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u where u.email in ('prestador@prueba.local', 'coordinador@prueba.local')
on conflict do nothing;

update public.perfiles set rol = 'coordinador' where id = '22222222-2222-4222-8222-222222222222';

insert into public.negocios (id, perfil_id, lugar_id, nombre, tipo, municipio, cupo_diario, whatsapp)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', null,
        'Hostal de prueba', 'hotel', 'tenza', 4, '573000000000')
on conflict do nothing;

-- Fase 2: rutas de transporte Bogotá → Guateque. Sin horarios ni precios inventados:
-- se completan al confirmarlos con las empresas (fuente 'por confirmar', verificado_en null).
insert into public.rutas_transporte (origen, destino, empresa, modo, terminal, duracion_min, precio_desde_cop,
                                     notas, fuente, verificado_en, activa)
select 'bogota', 'guateque', e, 'bus', 'Terminal Salitre', null, null, null, 'por confirmar', null, true
from (values ('Flota Valle de Tenza'), ('Flota La Macarena')) v(e)
where not exists (select 1 from public.rutas_transporte r
                  where r.origen = 'bogota' and r.destino = 'guateque' and r.empresa = v.e);
