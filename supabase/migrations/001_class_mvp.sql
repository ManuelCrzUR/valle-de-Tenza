-- Valle Directo, MVP de clase.
-- Ejecutar en el SQL editor de Supabase con un rol de administrador del proyecto.
-- La clave anónima no puede leer ni escribir estas tablas. El servidor usa solo la service role.

create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  fuente text not null check (fuente in ('openai', 'demo', 'ajuste', 'catalogo')),
  modelo text,
  municipio text not null,
  plan text not null,
  dias jsonb not null,
  avisos jsonb not null default '[]'::jsonb,
  itinerario jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reservation_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  itinerary_id uuid references public.itineraries (id),
  nombre text not null,
  correo text not null,
  telefono text,
  fecha date not null,
  personas integer not null check (personas between 1 and 20),
  nota text,
  estado text not null default 'recibida' check (estado = 'recibida'),
  created_at timestamptz not null default now()
);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  reservation_request_id uuid not null unique references public.reservation_requests (id),
  idempotency_key text not null unique,
  destinatario text not null,
  estado text not null check (estado in ('pendiente', 'enviado', 'fallido', 'omitido_sin_configuracion')),
  provider_id text,
  intentos integer not null default 0,
  ultimo_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.itineraries enable row level security;
alter table public.reservation_requests enable row level security;
alter table public.email_outbox enable row level security;

revoke all on table public.itineraries from anon, authenticated;
revoke all on table public.reservation_requests from anon, authenticated;
revoke all on table public.email_outbox from anon, authenticated;

create or replace function public.crear_solicitud(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  insert into public.reservation_requests (idempotency_key, itinerary_id, nombre, correo, telefono, fecha, personas, nota)
  values (
    payload->>'idempotency_key', it_id, payload->>'nombre', payload->>'correo',
    nullif(payload->>'telefono', ''), (payload->>'fecha')::date, (payload->>'personas')::int, nullif(payload->>'nota', '')
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
