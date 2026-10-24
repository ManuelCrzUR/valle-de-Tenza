-- Logística: rutas de transporte, salidas, tramos precalculados, alertas de vía y clima.
-- Lectura pública (alertas solo vigentes); escritura solo del coordinador (service_role salta RLS).
-- Recordatorio: 0002 cerró los privilegios por defecto, así que todo lo nuevo necesita GRANT explícito.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.modo_transporte as enum ('bus', 'colectivo', 'taxi', 'carro_propio');
create type public.tipo_alerta as enum ('cierre', 'paso_restringido', 'derrumbe', 'obra', 'otro');

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
-- origen/destino: slug de municipio o 'bogota' (sin FK, Bogotá no es un municipio del catálogo).
create table public.rutas_transporte (
  id               uuid primary key default gen_random_uuid(),
  origen           text not null check (origen ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  destino          text not null check (destino ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  empresa          text not null check (length(btrim(empresa)) > 0),
  modo             public.modo_transporte not null,
  terminal         text,
  duracion_min     int check (duracion_min is null or duracion_min > 0),
  precio_desde_cop int check (precio_desde_cop is null or precio_desde_cop >= 0),
  notas            text,
  fuente           text,
  verificado_en    date,
  activa           boolean not null default true,
  check (origen <> destino)
);
create index rutas_transporte_destino_idx on public.rutas_transporte (destino, origen);

-- dias_semana: ISO, 1 = lunes … 7 = domingo.
create table public.salidas (
  id           uuid primary key default gen_random_uuid(),
  ruta_id      uuid not null references public.rutas_transporte (id) on delete cascade,
  hora         time not null,
  dias_semana  int[] not null default '{1,2,3,4,5,6,7}'
    check (cardinality(dias_semana) > 0 and dias_semana <@ array[1,2,3,4,5,6,7]),
  unique (ruta_id, hora)
);

-- origen/destino: id de lugar, `mun:<slug>` (centro de municipio) o `bogota`.
create table public.tramos (
  origen       text not null check (length(origen) between 1 and 100),
  destino      text not null check (length(destino) between 1 and 100),
  distancia_m  int not null check (distancia_m >= 0),
  duracion_s   int not null check (duracion_s >= 0),
  fuente       text not null default 'osrm',
  calculado_en timestamptz not null default now(),
  primary key (origen, destino)
);

create table public.alertas_via (
  id           uuid primary key default gen_random_uuid(),
  municipio    text references public.municipios (slug),
  tramo_desde  text check (tramo_desde is null or length(tramo_desde) <= 100),
  tramo_hasta  text check (tramo_hasta is null or length(tramo_hasta) <= 100),
  tipo         public.tipo_alerta not null,
  mensaje      text not null check (length(btrim(mensaje)) > 0 and length(mensaje) <= 500),
  desde        timestamptz not null default now(),
  hasta        timestamptz,
  fuente       text,
  creada_por   uuid references public.perfiles (id) default auth.uid(),
  check (hasta is null or hasta > desde)
);
create index alertas_via_vigencia_idx on public.alertas_via (desde, hasta);

create table public.clima (
  municipio       text not null references public.municipios (slug),
  fecha           date not null,
  prob_lluvia_max int check (prob_lluvia_max is null or prob_lluvia_max between 0 and 100),
  temp_min        numeric(4,1),
  temp_max        numeric(4,1),
  actualizado     timestamptz not null default now(),
  primary key (municipio, fecha)
);

alter table public.rutas_transporte enable row level security;
alter table public.salidas          enable row level security;
alter table public.tramos           enable row level security;
alter table public.alertas_via      enable row level security;
alter table public.clima            enable row level security;

-- ---------------------------------------------------------------------------
-- Privilegios y políticas
-- ---------------------------------------------------------------------------
revoke all on public.rutas_transporte, public.salidas, public.tramos, public.alertas_via, public.clima
  from anon, authenticated;

grant select on public.rutas_transporte, public.salidas, public.tramos, public.alertas_via, public.clima
  to anon, authenticated;
grant insert, update, delete on public.rutas_transporte, public.salidas, public.tramos,
  public.alertas_via, public.clima to authenticated;   -- las políticas limitan la escritura al coordinador

-- rutas: públicas las activas; el coordinador ve todas.
create policy rutas_lectura_publica on public.rutas_transporte for select to anon, authenticated
  using (activa);
create policy rutas_coordinador_select on public.rutas_transporte for select to authenticated
  using (public.es_coordinador());
create policy rutas_coordinador_insert on public.rutas_transporte for insert to authenticated
  with check (public.es_coordinador());
create policy rutas_coordinador_update on public.rutas_transporte for update to authenticated
  using (public.es_coordinador()) with check (public.es_coordinador());
create policy rutas_coordinador_delete on public.rutas_transporte for delete to authenticated
  using (public.es_coordinador());

-- salidas: públicas las de rutas activas; el coordinador ve todas.
create policy salidas_lectura_publica on public.salidas for select to anon, authenticated
  using (exists (select 1 from public.rutas_transporte r where r.id = ruta_id and r.activa));
create policy salidas_coordinador_select on public.salidas for select to authenticated
  using (public.es_coordinador());
create policy salidas_coordinador_insert on public.salidas for insert to authenticated
  with check (public.es_coordinador());
create policy salidas_coordinador_update on public.salidas for update to authenticated
  using (public.es_coordinador()) with check (public.es_coordinador());
create policy salidas_coordinador_delete on public.salidas for delete to authenticated
  using (public.es_coordinador());

-- tramos
create policy tramos_lectura_publica on public.tramos for select to anon, authenticated using (true);
create policy tramos_coordinador_insert on public.tramos for insert to authenticated
  with check (public.es_coordinador());
create policy tramos_coordinador_update on public.tramos for update to authenticated
  using (public.es_coordinador()) with check (public.es_coordinador());
create policy tramos_coordinador_delete on public.tramos for delete to authenticated
  using (public.es_coordinador());

-- alertas: el público solo ve las vigentes; el coordinador ve todas.
create policy alertas_lectura_vigentes on public.alertas_via for select to anon, authenticated
  using (desde <= now() and (hasta is null or hasta > now()));
create policy alertas_coordinador_select on public.alertas_via for select to authenticated
  using (public.es_coordinador());
create policy alertas_coordinador_insert on public.alertas_via for insert to authenticated
  with check (public.es_coordinador());
create policy alertas_coordinador_update on public.alertas_via for update to authenticated
  using (public.es_coordinador()) with check (public.es_coordinador());
create policy alertas_coordinador_delete on public.alertas_via for delete to authenticated
  using (public.es_coordinador());

-- clima
create policy clima_lectura_publica on public.clima for select to anon, authenticated using (true);
create policy clima_coordinador_insert on public.clima for insert to authenticated
  with check (public.es_coordinador());
create policy clima_coordinador_update on public.clima for update to authenticated
  using (public.es_coordinador()) with check (public.es_coordinador());
create policy clima_coordinador_delete on public.clima for delete to authenticated
  using (public.es_coordinador());

-- ---------------------------------------------------------------------------
-- Municipio nuevo (el scraper completa centro y caja)
-- ---------------------------------------------------------------------------
insert into public.municipios (slug, nombre, centro)
values ('guateque', 'Guateque', array[5.0067, -73.4717])
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Revisión de negocios por el coordinador (cierra el hallazgo de la Fase 1: un prestador puede
-- reclamar un lugar del mapa que no es suyo). Listar todos los negocios ya lo permite la política
-- `negocios_coordinador_select` de 0002; aquí solo se agregan las acciones.
-- ---------------------------------------------------------------------------
create function public.verificar_negocio(p_negocio uuid, p_verificado boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.es_coordinador() then
    raise exception 'Solo el coordinador puede verificar negocios' using errcode = '42501';
  end if;
  update public.negocios set verificado = coalesce(p_verificado, false) where id = p_negocio;
  if not found then
    raise exception 'Negocio no encontrado' using errcode = 'P0002';
  end if;
end;
$$;

create function public.liberar_lugar_negocio(p_negocio uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.es_coordinador() then
    raise exception 'Solo el coordinador puede liberar un lugar' using errcode = '42501';
  end if;
  update public.negocios set lugar_id = null, verificado = false where id = p_negocio;
  if not found then
    raise exception 'Negocio no encontrado' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.verificar_negocio(uuid, boolean), public.liberar_lugar_negocio(uuid) from public;
grant execute on function public.verificar_negocio(uuid, boolean), public.liberar_lugar_negocio(uuid) to authenticated;
