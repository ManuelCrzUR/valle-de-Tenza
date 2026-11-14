-- Solicitudes de viaje que llegan al negocio dueño, con consentimiento del viajero.
-- Añade comparte_datos, request_businesses, notification_outbox, push_subscriptions,
-- mis_solicitudes() para el panel del dueño, helpers de aviso (solo service_role) y retención de 12 meses.

-- 1. Consentimiento del viajero para compartir sus datos de contacto con el negocio
alter table public.reservation_requests
  add column if not exists comparte_datos boolean not null default false;

create or replace function public.crear_solicitud(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existente public.reservation_requests%rowtype;
  it_id uuid;
  sol public.reservation_requests%rowtype;
  box public.email_outbox%rowtype;
begin
  select * into existente from public.reservation_requests where idempotency_key = payload->>'idempotency_key';
  if found then
    select * into box from public.email_outbox where reservation_request_id = existente.id;
    return jsonb_build_object(
      'id', existente.id,
      'idempotency_key', existente.idempotency_key,
      'nombre', existente.nombre,
      'correo', existente.correo,
      'telefono', existente.telefono,
      'fecha', existente.fecha,
      'personas', existente.personas,
      'nota', existente.nota,
      'comparte_datos', existente.comparte_datos,
      'itinerario', coalesce((select itinerario from public.itineraries where id = existente.itinerary_id), '{}'::jsonb),
      'outbox', jsonb_build_object(
        'id', box.id, 'idempotency_key', box.idempotency_key, 'estado', box.estado,
        'provider_id', box.provider_id, 'intentos', box.intentos, 'ultimo_error', box.ultimo_error,
        'destinatario', box.destinatario
      )
    );
  end if;

  insert into public.itineraries (fuente, modelo, municipio, plan, dias, avisos, itinerario)
  values (
    coalesce(payload->>'fuente', 'catalogo'),
    payload->>'modelo',
    payload->>'municipio',
    payload->>'plan',
    coalesce(payload#>'{itinerario,dias}', '[]'::jsonb),
    coalesce(payload->'avisos', '[]'::jsonb),
    payload->'itinerario'
  )
  returning id into it_id;

  insert into public.reservation_requests (idempotency_key, itinerary_id, nombre, correo, telefono, fecha, personas, nota, comparte_datos)
  values (
    payload->>'idempotency_key', it_id, payload->>'nombre', payload->>'correo',
    nullif(payload->>'telefono', ''), (payload->>'fecha')::date, (payload->>'personas')::int, nullif(payload->>'nota', ''),
    coalesce((payload->>'comparte_datos')::boolean, false)
  )
  returning * into sol;

  insert into public.email_outbox (reservation_request_id, idempotency_key, destinatario, estado)
  values (sol.id, 'recibo:' || sol.id::text, sol.correo, 'pendiente')
  returning * into box;

  return jsonb_build_object(
    'id', sol.id,
    'idempotency_key', sol.idempotency_key,
    'nombre', sol.nombre,
    'correo', sol.correo,
    'telefono', sol.telefono,
    'fecha', sol.fecha,
    'personas', sol.personas,
    'nota', sol.nota,
    'comparte_datos', sol.comparte_datos,
    'itinerario', payload->'itinerario',
    'outbox', jsonb_build_object(
      'id', box.id, 'idempotency_key', box.idempotency_key, 'estado', box.estado,
      'provider_id', box.provider_id, 'intentos', box.intentos, 'ultimo_error', box.ultimo_error,
      'destinatario', box.destinatario
    )
  );
exception when unique_violation then
  select * into existente from public.reservation_requests where idempotency_key = payload->>'idempotency_key';
  select * into box from public.email_outbox where reservation_request_id = existente.id;
  return jsonb_build_object(
    'id', existente.id,
    'idempotency_key', existente.idempotency_key,
    'nombre', existente.nombre,
    'correo', existente.correo,
    'telefono', existente.telefono,
    'fecha', existente.fecha,
    'personas', existente.personas,
    'nota', existente.nota,
      'comparte_datos', existente.comparte_datos,
    'itinerario', coalesce((select itinerario from public.itineraries where id = existente.itinerary_id), '{}'::jsonb),
    'outbox', jsonb_build_object(
      'id', box.id, 'idempotency_key', box.idempotency_key, 'estado', box.estado,
      'provider_id', box.provider_id, 'intentos', box.intentos, 'ultimo_error', box.ultimo_error,
      'destinatario', box.destinatario
    )
  );
end;
$$;

revoke all on function public.crear_solicitud(jsonb) from public, anon, authenticated;
grant execute on function public.crear_solicitud(jsonb) to service_role;


-- 2. Negocios a los que va dirigida cada solicitud (solo service_role escribe)
create table if not exists public.request_businesses (
  request_id uuid not null references public.reservation_requests (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, business_id)
);
create index if not exists request_businesses_business_idx on public.request_businesses (business_id);
alter table public.request_businesses enable row level security;
revoke all on table public.request_businesses from anon, authenticated;

-- 3. Cola de avisos al negocio (correo y push)
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.reservation_requests (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  canal text not null check (canal in ('correo', 'push')),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'fallido', 'omitido_sin_configuracion', 'bloqueado_dominio', 'sin_destino')),
  intentos integer not null default 0,
  ultimo_error text check (char_length(ultimo_error) <= 200),
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, business_id, canal)
);
alter table public.notification_outbox enable row level security;
revoke all on table public.notification_outbox from anon, authenticated;

-- 4. Suscripciones Web Push de los dueños
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_owner_idx on public.push_subscriptions (owner_id);
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant select, insert, delete on table public.push_subscriptions to authenticated;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated using (owner_id = auth.uid());

-- Máximo 10 suscripciones por usuario
create or replace function public.limitar_push_subscriptions()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.push_subscriptions where owner_id = new.owner_id) >= 10 then
    raise exception 'Máximo 10 suscripciones por usuario' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists push_subscriptions_limite on public.push_subscriptions;
create trigger push_subscriptions_limite before insert on public.push_subscriptions
  for each row execute function public.limitar_push_subscriptions();

-- 5. Solicitudes del dueño: solo las que el viajero acordó compartir
create or replace function public.mis_solicitudes()
returns table (request_id uuid, business_id uuid, business_name text, nombre text, correo text,
               telefono text, fecha date, personas int, nota text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, b.id, b.name, r.nombre, r.correo, r.telefono, r.fecha, r.personas, r.nota, r.created_at
  from public.request_businesses rb
  join public.reservation_requests r on r.id = rb.request_id
  join public.businesses b on b.id = rb.business_id
  where b.owner_id = auth.uid() and r.comparte_datos
  order by r.created_at desc
  limit 200;
$$;
revoke all on function public.mis_solicitudes() from public, anon, authenticated;
grant execute on function public.mis_solicitudes() to authenticated;

-- 6. Helpers de aviso: solo service_role
create or replace function public.destinatario_aviso(p_business uuid)
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce(nullif(b.notify_email, ''), u.email)
  from public.businesses b join auth.users u on u.id = b.owner_id
  where b.id = p_business;
$$;
revoke all on function public.destinatario_aviso(uuid) from public, anon, authenticated;
grant execute on function public.destinatario_aviso(uuid) to service_role;

create or replace function public.suscripciones_de_negocio(p_business uuid)
returns setof public.push_subscriptions
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.* from public.push_subscriptions s
  join public.businesses b on b.owner_id = s.owner_id
  where b.id = p_business;
$$;
revoke all on function public.suscripciones_de_negocio(uuid) from public, anon, authenticated;
grant execute on function public.suscripciones_de_negocio(uuid) to service_role;

-- 7. Retención (Ley 1581 de 2012): borrar solicitudes con más de 12 meses
create or replace function public.purgar_solicitudes()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  create temporary table if not exists _purga_ids (id uuid) on commit drop;
  insert into _purga_ids select id from public.reservation_requests where created_at < now() - interval '12 months';
  -- email_outbox y dossier_tokens no tienen cascade: se borran antes
  delete from public.email_outbox where reservation_request_id in (select id from _purga_ids);
  delete from public.dossier_tokens where reservation_request_id in (select id from _purga_ids);
  delete from public.reservation_requests where id in (select id from _purga_ids);
  get diagnostics n = row_count;
  -- itinerarios huérfanos
  delete from public.itineraries i
  where not exists (select 1 from public.reservation_requests r where r.itinerary_id = i.id);
  drop table if exists _purga_ids;
  return n;
end;
$$;
revoke all on function public.purgar_solicitudes() from public, anon, authenticated;
grant execute on function public.purgar_solicitudes() to service_role;

-- Programación diaria con pg_cron, si está disponible
do $$
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception when others then
    raise notice 'pg_cron no disponible: programar purgar_solicitudes() manualmente (%)', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'purgar-solicitudes') then
      perform cron.unschedule('purgar-solicitudes');
    end if;
    perform cron.schedule('purgar-solicitudes', '15 8 * * *', 'select public.purgar_solicitudes()');
  end if;
end;
$$;
