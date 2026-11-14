-- Ficha completa del negocio: contacto, precios, horarios, servicios, carta en PDF.
-- Privacidad: anon ya no lee la tabla businesses; solo la vista businesses_public,
-- que oculta owner_id, notify_email y los teléfonos que el dueño no quiso publicar.
-- No modifica 001-003 (ya aplicadas).

-- Validación de la lista de servicios (máx. 20 elementos, cada uno de 1 a 40 caracteres).
create or replace function public.servicios_validos(p_servicios text[])
returns boolean
language sql
immutable
as $$
  select coalesce(cardinality(p_servicios), 0) <= 20
    and not exists (
      select 1 from unnest(p_servicios) s
      where s is null or char_length(s) not between 1 and 40
    );
$$;

alter table public.businesses
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists show_phone boolean not null default false,
  add column if not exists show_whatsapp boolean not null default false,
  add column if not exists website text,
  add column if not exists instagram text,
  add column if not exists facebook text,
  add column if not exists price_from_cop integer,
  add column if not exists price_note text,
  add column if not exists hours jsonb,
  add column if not exists hours_note text,
  add column if not exists services text[] not null default '{}',
  add column if not exists menu_path text,
  add column if not exists notify_email text,
  add column if not exists info_updated_at timestamptz not null default now();

alter table public.businesses
  add constraint businesses_phone_fmt check (phone is null or (char_length(phone) <= 20 and phone ~ '^[0-9 +()-]+$')),
  add constraint businesses_whatsapp_fmt check (whatsapp is null or (char_length(whatsapp) <= 20 and whatsapp ~ '^[0-9 +()-]+$')),
  add constraint businesses_website_fmt check (website is null or (char_length(website) <= 200 and website like 'https://%')),
  add constraint businesses_instagram_len check (instagram is null or char_length(instagram) <= 60),
  add constraint businesses_facebook_len check (facebook is null or char_length(facebook) <= 200),
  add constraint businesses_price_from check (price_from_cop is null or price_from_cop between 0 and 50000000),
  add constraint businesses_price_note_len check (price_note is null or char_length(price_note) <= 200),
  add constraint businesses_hours_obj check (hours is null or jsonb_typeof(hours) = 'object'),
  add constraint businesses_hours_note_len check (hours_note is null or char_length(hours_note) <= 200),
  add constraint businesses_services_ok check (public.servicios_validos(services)),
  add constraint businesses_menu_path_fmt check (
    menu_path is null or (
      char_length(menu_path) <= 200
      and menu_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-zA-Z0-9._-]+\.pdf$'
    )
  ),
  add constraint businesses_notify_email_fmt check (
    notify_email is null or (char_length(notify_email) <= 160 and notify_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  );

comment on column public.businesses.hours is
  'Horario semanal. Formato: {"lun":{"abre":"08:00","cierra":"18:00"},"dom":{"cerrado":true}, ...} con claves lun,mar,mie,jue,vie,sab,dom.';
comment on column public.businesses.menu_path is
  'Ruta en el bucket business-menus: <owner_id>/<business_id>/<archivo>.pdf';
comment on column public.businesses.notify_email is
  'Correo privado para avisos al dueño. Nunca se expone en businesses_public.';

-- info_updated_at cambia solo cuando cambia algún dato de la ficha (no el estado).
create or replace function public.tocar_info_ficha()
returns trigger
language plpgsql
as $$
begin
  if (new.name, new.category, new.municipality, new.description, new.contact, new.lat, new.lng,
      new.phone, new.whatsapp, new.show_phone, new.show_whatsapp, new.website, new.instagram,
      new.facebook, new.price_from_cop, new.price_note, new.hours, new.hours_note,
      new.services, new.menu_path, new.notify_email)
     is distinct from
     (old.name, old.category, old.municipality, old.description, old.contact, old.lat, old.lng,
      old.phone, old.whatsapp, old.show_phone, old.show_whatsapp, old.website, old.instagram,
      old.facebook, old.price_from_cop, old.price_note, old.hours, old.hours_note,
      old.services, old.menu_path, old.notify_email) then
    new.info_updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_info_tocar on public.businesses;
create trigger businesses_info_tocar before update on public.businesses
  for each row execute function public.tocar_info_ficha();

-- Lista de precios por negocio
create table if not exists public.business_prices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  item text not null,
  price_cop integer,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint business_prices_item_len check (char_length(item) between 1 and 120),
  constraint business_prices_price check (price_cop is null or price_cop between 0 and 50000000),
  constraint business_prices_note_len check (note is null or char_length(note) <= 160)
);

create index if not exists business_prices_business_idx on public.business_prices (business_id, sort_order);

-- Máximo 40 filas por negocio
create or replace function public.limitar_precios()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.business_prices where business_id = new.business_id) >= 40 then
    raise exception 'Un negocio admite máximo 40 precios' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists business_prices_limite on public.business_prices;
create trigger business_prices_limite before insert on public.business_prices
  for each row execute function public.limitar_precios();

-- Privacidad: anon deja de leer businesses directamente
revoke all on public.businesses from anon;
revoke all on public.businesses from authenticated;
grant select, insert, update, delete on public.businesses to authenticated;

drop policy if exists empresas_lectura on public.businesses;
create policy empresas_lectura on public.businesses
  for select using (auth.uid() = owner_id);

-- Vista pública (security definer a propósito: corre con los permisos de su dueño,
-- por eso solo expone columnas seguras y filas publicadas).
create or replace view public.businesses_public as
select
  id, name, category, municipality, description, contact, lat, lng,
  website, instagram, facebook, price_from_cop, price_note,
  hours, hours_note, services, menu_path, info_updated_at,
  case when show_phone then phone end as phone,
  case when show_whatsapp then whatsapp end as whatsapp
from public.businesses
where status = 'published';

revoke all on public.businesses_public from anon, authenticated;
grant select on public.businesses_public to anon, authenticated;

-- Visibilidad de un negocio sin exigir lectura directa de la tabla
create or replace function public.negocio_visible(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_id and (b.status = 'published' or b.owner_id = auth.uid())
  );
$$;

revoke all on function public.negocio_visible(uuid) from public;
grant execute on function public.negocio_visible(uuid) to anon, authenticated;

drop policy if exists fotos_lectura on public.business_photos;
create policy fotos_lectura on public.business_photos
  for select using (public.negocio_visible(business_id));

-- RLS de precios
alter table public.business_prices enable row level security;

revoke all on public.business_prices from anon, authenticated;
grant select on public.business_prices to anon;
grant select, insert, update, delete on public.business_prices to authenticated;

drop policy if exists precios_lectura on public.business_prices;
create policy precios_lectura on public.business_prices
  for select using (public.negocio_visible(business_id));

drop policy if exists precios_alta on public.business_prices;
create policy precios_alta on public.business_prices
  for insert with check (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

drop policy if exists precios_edicion on public.business_prices;
create policy precios_edicion on public.business_prices
  for update using (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

drop policy if exists precios_baja on public.business_prices;
create policy precios_baja on public.business_prices
  for delete using (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

-- Bucket de cartas en PDF (público, 5 MB, solo PDF)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-menus', 'business-menus', true, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists menus_publicos_lectura on storage.objects;
create policy menus_publicos_lectura on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'business-menus');

drop policy if exists menus_dueno_inserta on storage.objects;
create policy menus_dueno_inserta on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-menus'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists menus_dueno_actualiza on storage.objects;
create policy menus_dueno_actualiza on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-menus'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'business-menus'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists menus_dueno_borra on storage.objects;
create policy menus_dueno_borra on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-menus'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
