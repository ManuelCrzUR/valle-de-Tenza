-- Cuentas de prestadores. No modifica 001 ni 002, salvo el conjunto de estados del outbox
-- para poder registrar un envío bloqueado por el remitente de prueba de Resend.
-- La aplica quien opera el proyecto. Este archivo no se ejecuta desde la app.

alter table public.email_outbox drop constraint if exists email_outbox_estado_check;
alter table public.email_outbox add constraint email_outbox_estado_check
  check (estado in ('pendiente', 'enviado', 'fallido', 'omitido_sin_configuracion', 'bloqueado_dominio'));

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  bio text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_len check (name is null or char_length(name) <= 80),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 400)
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null,
  municipality text not null,
  description text not null,
  contact text,
  lat double precision,
  lng double precision,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_name_len check (char_length(name) between 2 and 120),
  constraint businesses_category check (category in ('alojamiento', 'restaurante', 'comercio', 'atraccion', 'monumento', 'naturaleza', 'operador')),
  constraint businesses_municipality check (municipality in ('guayata', 'somondoco', 'tenza', 'sutatenza', 'almeida', 'chivor', 'la-capilla')),
  constraint businesses_description_len check (char_length(description) between 10 and 800),
  constraint businesses_contact_len check (contact is null or char_length(contact) <= 160),
  constraint businesses_status check (status in ('draft', 'published')),
  constraint businesses_published_point check (status = 'draft' or (lat is not null and lng is not null))
);

create table if not exists public.business_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  storage_path text not null,
  alt text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  constraint business_photos_alt_len check (alt is null or char_length(alt) <= 160)
);

create index if not exists businesses_owner_idx on public.businesses (owner_id);
create index if not exists businesses_published_idx on public.businesses (status) where status = 'published';
create index if not exists business_photos_business_idx on public.business_photos (business_id, sort_order);

create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_tocar on public.profiles;
create trigger profiles_tocar before update on public.profiles
  for each row execute function public.tocar_updated_at();

drop trigger if exists businesses_tocar on public.businesses;
create trigger businesses_tocar before update on public.businesses
  for each row execute function public.tocar_updated_at();

create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists crear_perfil_al_registrarse on auth.users;
create trigger crear_perfil_al_registrarse
  after insert on auth.users
  for each row execute function public.crear_perfil();

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_photos enable row level security;

grant select on public.profiles to anon;
grant select, insert, update on public.profiles to authenticated;
grant select on public.businesses to anon;
grant select, insert, update, delete on public.businesses to authenticated;
grant select on public.business_photos to anon;
grant select, insert, update, delete on public.business_photos to authenticated;

drop policy if exists perfiles_lectura on public.profiles;
create policy perfiles_lectura on public.profiles
  for select using (true);

drop policy if exists perfiles_alta on public.profiles;
create policy perfiles_alta on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists perfiles_edicion on public.profiles;
create policy perfiles_edicion on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists empresas_lectura on public.businesses;
create policy empresas_lectura on public.businesses
  for select using (status = 'published' or auth.uid() = owner_id);

drop policy if exists empresas_alta on public.businesses;
create policy empresas_alta on public.businesses
  for insert with check (auth.uid() = owner_id);

drop policy if exists empresas_edicion on public.businesses;
create policy empresas_edicion on public.businesses
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists empresas_baja on public.businesses;
create policy empresas_baja on public.businesses
  for delete using (auth.uid() = owner_id);

drop policy if exists fotos_lectura on public.business_photos;
create policy fotos_lectura on public.business_photos
  for select using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and (b.status = 'published' or b.owner_id = auth.uid())
    )
  );

drop policy if exists fotos_alta on public.business_photos;
create policy fotos_alta on public.business_photos
  for insert with check (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

drop policy if exists fotos_edicion on public.business_photos;
create policy fotos_edicion on public.business_photos
  for update using (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

drop policy if exists fotos_baja on public.business_photos;
create policy fotos_baja on public.business_photos
  for delete using (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

insert into storage.buckets (id, name, public)
values ('business-photos', 'business-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists fotos_publicas_lectura on storage.objects;
create policy fotos_publicas_lectura on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'business-photos');

drop policy if exists fotos_dueno_inserta on storage.objects;
create policy fotos_dueno_inserta on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists fotos_dueno_actualiza on storage.objects;
create policy fotos_dueno_actualiza on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'business-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists fotos_dueno_borra on storage.objects;
create policy fotos_dueno_borra on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
