-- Catálogo público: municipios, lugares y eventos.
-- Lectura pública (anon/authenticated); escritura solo con service_role (salta RLS).
-- Sin teléfonos ni correos: el catálogo es público.

create type public.precision_ubicacion as enum ('exacta', 'direccion', 'vereda', 'cabecera');

create table public.municipios (
  slug   text primary key,
  nombre text not null,
  centro double precision[] check (centro is null or array_length(centro, 1) = 2),       -- [lat, lon]
  caja   double precision[] check (caja is null or array_length(caja, 1) = 4)            -- [sur, oeste, norte, este]
);

create table public.lugares (
  id            text primary key,
  nombre        text not null,
  categoria     text not null check (categoria in (
    'alojamiento', 'restaurante', 'comercio', 'atraccion', 'monumento', 'naturaleza',
    'operador', 'cajero', 'gasolinera', 'salud', 'servicio')),
  subtipo       text not null default '',
  municipio     text not null references public.municipios (slug),
  lat           double precision,
  lon           double precision,
  precision     public.precision_ubicacion,
  direccion     text not null default '',
  vereda        text,
  plan          text check (plan in ('aventura', 'gastro', 'cultura')),
  es_servicio   boolean not null default false,
  con_registro  boolean not null default false,
  fuentes       text[] not null default '{}',
  extra         jsonb,
  acceso        text,
  verificado_en date,
  visible       boolean not null default true,
  actualizado   timestamptz not null default now()
);

create table public.eventos (
  id          bigint generated always as identity primary key,
  municipio   text not null references public.municipios (slug),
  nombre      text not null,
  descripcion text,
  desde       date not null,
  hasta       date,
  fuente      text,
  verificado_en date,
  check (hasta is null or hasta >= desde)
);

create index lugares_municipio_idx on public.lugares (municipio);
create index lugares_categoria_idx on public.lugares (categoria);
create index eventos_municipio_idx on public.eventos (municipio);
create index eventos_desde_idx on public.eventos (desde);

alter table public.municipios enable row level security;
alter table public.lugares    enable row level security;
alter table public.eventos    enable row level security;

create policy municipios_lectura_publica on public.municipios
  for select to anon, authenticated using (true);
create policy lugares_lectura_publica on public.lugares
  for select to anon, authenticated using (visible);
create policy eventos_lectura_publica on public.eventos
  for select to anon, authenticated using (true);

-- Sin políticas de escritura; además se revocan los privilegios.
revoke insert, update, delete, truncate on public.municipios, public.lugares, public.eventos from anon, authenticated;
grant select on public.municipios, public.lugares, public.eventos to anon, authenticated;
