-- Métricas: itinerarios compartidos, demanda anónima y vistas del panel de operación.
-- Privacidad: ninguna tabla de esta migración guarda datos personales. Las IP no se guardan nunca:
-- solo una huella con hash para los límites diarios, que se purga a los pocos días.
-- Recordatorio (0002): todo lo nuevo en `public` nace SIN acceso para anon/authenticated; se otorga explícito.

-- ---------------------------------------------------------------------------
-- Límite por IP/día (interno: solo service_role y las funciones security definer)
-- ---------------------------------------------------------------------------
create table public.limite_compartir (
  huella text not null,
  dia    date not null,
  cuenta int  not null default 0,
  primary key (huella, dia)
);
create index limite_compartir_dia_idx on public.limite_compartir (dia);
alter table public.limite_compartir enable row level security;   -- sin políticas: nadie lee por la API
revoke all on public.limite_compartir from anon, authenticated;

-- Cuenta una acción de «ámbito» (compartir, demanda) para la IP de la petición y falla si pasa el máximo.
-- Huella = sha256(ámbito || ip || día || sal). La sal es FIJA y PÚBLICA a propósito (el repo es público):
-- no protege contra fuerza bruta (el espacio IPv4 es pequeño); la protección real es que la tabla no la
-- lee nadie salvo service_role y que las filas se borran tras 2 días (cron `purgar-limites`).
-- Sin IP (llamada local o sin cabeceras) se usa la IP 'sin-ip' con el mismo límite.
-- Nota: se toma el PRIMER valor de x-forwarded-for, como pide el plan; si el proxy no lo sobrescribe,
-- un cliente podría falsearlo para evadir el límite. Es un freno anti-abuso, no un control de seguridad.
create function public.consumir_limite(p_ambito text, p_max int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_sal constant text := 'valle-directo/limite/v1';
  v_cab json;
  v_ip text;
  v_dia date := public.hoy_bogota();
  v_huella text;
  v_cuenta int;
begin
  begin
    v_cab := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_cab := null;
  end;
  v_ip := left(coalesce(
    nullif(btrim(split_part(coalesce(v_cab ->> 'x-forwarded-for', ''), ',', 1)), ''),
    nullif(btrim(coalesce(v_cab ->> 'x-real-ip', '')), ''),
    'sin-ip'), 64);
  v_huella := encode(extensions.digest(p_ambito || '|' || v_ip || '|' || v_dia::text || '|' || c_sal, 'sha256'), 'hex');

  insert into public.limite_compartir as l (huella, dia, cuenta) values (v_huella, v_dia, 1)
  on conflict (huella, dia) do update set cuenta = l.cuenta + 1 where l.cuenta < p_max
  returning l.cuenta into v_cuenta;
  if v_cuenta is null then
    raise exception 'Llegaste al límite diario, intenta de nuevo mañana' using errcode = 'P0001';
  end if;
end;
$$;

create function public.purgar_limites() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  delete from public.limite_compartir where dia < public.hoy_bogota() - 1;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Itinerarios compartidos
-- ---------------------------------------------------------------------------
create table public.itinerarios_compartidos (
  id      text primary key check (id ~ '^[A-Za-z0-9]{8}$'),
  eleccion jsonb not null check (jsonb_typeof(eleccion) = 'object' and pg_column_size(eleccion) < 8192),
  creado  timestamptz not null default now(),
  vistas  int not null default 0 check (vistas >= 0)
);
alter table public.itinerarios_compartidos enable row level security;  -- sin políticas ni grants: solo por RPC
revoke all on public.itinerarios_compartidos from anon, authenticated;

create function public.compartir_itinerario(p_eleccion jsonb) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_alfabeto constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  v_id text;
  v_intentos int := 0;
  v_bytes bytea;
  v_b int;
  i int;
begin
  if p_eleccion is null or jsonb_typeof(p_eleccion) <> 'object' then
    raise exception 'La elección del itinerario no es válida' using errcode = 'P0001';
  end if;
  if octet_length(p_eleccion::text) >= 8000 then
    raise exception 'La elección del itinerario es demasiado grande' using errcode = 'P0001';
  end if;
  perform public.consumir_limite('compartir', 20);

  loop
    v_intentos := v_intentos + 1;
    v_id := '';
    -- Sin sesgo de módulo: se descartan los bytes >= 248 (62 * 4).
    while length(v_id) < 8 loop
      v_bytes := extensions.gen_random_bytes(16);
      for i in 0..15 loop
        v_b := get_byte(v_bytes, i);
        if v_b < 248 and length(v_id) < 8 then
          v_id := v_id || substr(v_alfabeto, 1 + (v_b % 62), 1);
        end if;
      end loop;
    end loop;
    begin
      insert into public.itinerarios_compartidos (id, eleccion) values (v_id, p_eleccion);
      return v_id;
    exception when unique_violation then
      if v_intentos >= 10 then
        raise exception 'No se pudo generar el enlace' using errcode = 'P0001';
      end if;
    end;
  end loop;
end;
$$;

-- Devuelve la elección (o null si no existe) y suma una vista.
create function public.ver_itinerario(p_id text) returns jsonb
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.itinerarios_compartidos set vistas = vistas + 1
  where id = p_id and p_id ~ '^[A-Za-z0-9]{8}$'
  returning eleccion;
$$;

-- ---------------------------------------------------------------------------
-- Demanda anónima
-- ---------------------------------------------------------------------------
create table public.demanda (
  id          bigint generated always as identity primary key,
  plan        text not null check (plan in ('aventura', 'gastro', 'cultura')),
  municipio   text references public.municipios (slug),
  dias        int  not null check (dias between 1 and 3),
  personas    int  not null check (personas between 1 and 12),
  fecha_viaje date,   -- el rango ±1 año depende de la fecha actual: se valida en registrar_demanda
  transporte  text check (transporte is null or transporte in ('carro', 'publico')),
  creado      timestamptz not null default now()
);
create index demanda_creado_idx on public.demanda (creado);
create index demanda_fecha_viaje_idx on public.demanda (fecha_viaje);
alter table public.demanda enable row level security;
revoke all on public.demanda from anon, authenticated;
grant select on public.demanda to authenticated;
create policy demanda_coordinador_select on public.demanda for select to authenticated
  using (public.es_coordinador());

create function public.registrar_demanda(
  p_plan text, p_municipio text, p_dias int, p_personas int, p_fecha_viaje date, p_transporte text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_plan is null or p_plan not in ('aventura', 'gastro', 'cultura') then
    raise exception 'Plan no válido' using errcode = 'P0001';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 3 then
    raise exception 'Los días deben estar entre 1 y 3' using errcode = 'P0001';
  end if;
  if p_personas is null or p_personas < 1 or p_personas > 12 then
    raise exception 'Las personas deben estar entre 1 y 12' using errcode = 'P0001';
  end if;
  if p_transporte is not null and p_transporte not in ('carro', 'publico') then
    raise exception 'Transporte no válido' using errcode = 'P0001';
  end if;
  if p_fecha_viaje is not null
     and p_fecha_viaje not between public.hoy_bogota() - 365 and public.hoy_bogota() + 365 then
    raise exception 'La fecha de viaje está fuera de rango' using errcode = 'P0001';
  end if;
  if p_municipio is not null and not exists (select 1 from public.municipios where slug = p_municipio) then
    raise exception 'Municipio no válido' using errcode = 'P0001';
  end if;
  perform public.consumir_limite('demanda', 200);
  insert into public.demanda (plan, municipio, dias, personas, fecha_viaje, transporte)
  values (p_plan, p_municipio, p_dias, p_personas, p_fecha_viaje, p_transporte);
end;
$$;

-- ---------------------------------------------------------------------------
-- Momento de respuesta de la reserva (para el tiempo medio de respuesta del prestador)
-- ---------------------------------------------------------------------------
alter table public.reservas add column respondida timestamptz;

-- OJO con el orden: los triggers BEFORE corren por orden alfabético. Este debe ir DESPUÉS de
-- `reservas_validar_cambio` (que rechaza al prestador si cambia otra columna que `estado`).
create function public.reservas_marcar_respuesta() returns trigger
language plpgsql as $$
begin
  if old.estado = 'pendiente' and new.estado in ('confirmada', 'rechazada') and new.respondida is null then
    new.respondida := now();
  end if;
  return new;
end;
$$;
create trigger reservas_zz_respuesta before update on public.reservas
  for each row execute function public.reservas_marcar_respuesta();

-- ---------------------------------------------------------------------------
-- Vistas del panel (security_invoker: mandan las RLS de quien consulta)
-- ---------------------------------------------------------------------------
-- Próximos 30 días por negocio activo. El prestador ve solo los suyos; el coordinador, todos.
create view public.ocupacion_diaria with (security_invoker = true) as
  select n.id as negocio_id, f.fecha::date as fecha,
         case when coalesce(d.cerrado, false) then 0 else coalesce(d.cupo, n.cupo_diario) end as cupo,
         coalesce(o.personas, 0) as ocupado,
         greatest(0, case when coalesce(d.cerrado, false) then 0 else coalesce(d.cupo, n.cupo_diario) end
                     - coalesce(o.personas, 0)) as libre
  from public.negocios n
  cross join generate_series(public.hoy_bogota(), public.hoy_bogota() + 29, interval '1 day') as f(fecha)
  left join public.cupo_dia d on d.negocio_id = n.id and d.fecha = f.fecha::date
  left join public.ocupacion o on o.negocio_id = n.id and o.fecha = f.fecha::date
  where n.activo;

create view public.demanda_semanal with (security_invoker = true) as
  select municipio, plan,
         date_trunc('week', creado at time zone 'America/Bogota')::date as semana,
         count(*)::int as itinerarios,
         sum(personas)::int as personas
  from public.demanda
  group by municipio, plan, date_trunc('week', creado at time zone 'America/Bogota')::date;

-- Personas que dicen viajar cada fecha vs. cupo libre de hoteles del municipio (próximos 30 días).
create view public.brecha_hospedaje with (security_invoker = true) as
  select dm.municipio, dm.fecha, dm.personas_demandadas, coalesce(cp.libre, 0)::int as cupo_disponible
  from (
    select municipio, fecha_viaje as fecha, sum(personas)::int as personas_demandadas
    from public.demanda
    where municipio is not null
      and fecha_viaje between public.hoy_bogota() and public.hoy_bogota() + 29
    group by municipio, fecha_viaje
  ) dm
  left join (
    select n.municipio, od.fecha, sum(od.libre) as libre
    from public.ocupacion_diaria od
    join public.negocios n on n.id = od.negocio_id and n.tipo = 'hotel'
    group by n.municipio, od.fecha
  ) cp on cp.municipio = dm.municipio and cp.fecha = dm.fecha;

-- Negocios activos sin actualizar cupo en 7 días (la RLS de negocios limita: coordinador todos, prestador los suyos).
create view public.prestadores_inactivos with (security_invoker = true) as
  select id as negocio_id, nombre, municipio, whatsapp, cupo_actualizado
  from public.negocios
  where activo and cupo_actualizado < now() - interval '7 days';

-- Solo agregados de reservas, sin datos del viajero. tasa_confirmacion = confirmadas / (confirmadas + rechazadas)
-- (las canceladas después de confirmar y las vencidas no cuentan en la tasa); null si aún no respondió ninguna.
create view public.metricas_prestador with (security_invoker = true) as
  select negocio_id,
         count(*)::int as total,
         (count(*) filter (where estado = 'confirmada'))::int as confirmadas,
         (count(*) filter (where estado = 'rechazada'))::int as rechazadas,
         round((count(*) filter (where estado = 'confirmada'))::numeric
               / nullif(count(*) filter (where estado in ('confirmada', 'rechazada')), 0), 3) as tasa_confirmacion,
         avg(respondida - creada) as respuesta_media
  from public.reservas
  where negocio_id is not null
  group by negocio_id;

revoke all on public.ocupacion_diaria, public.demanda_semanal, public.brecha_hospedaje,
  public.prestadores_inactivos, public.metricas_prestador from anon, authenticated;
grant select on public.ocupacion_diaria, public.demanda_semanal, public.brecha_hospedaje,
  public.prestadores_inactivos, public.metricas_prestador to authenticated;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución y cron
-- ---------------------------------------------------------------------------
revoke execute on function public.consumir_limite(text, int), public.purgar_limites(), public.reservas_marcar_respuesta(),
  public.compartir_itinerario(jsonb), public.ver_itinerario(text),
  public.registrar_demanda(text, text, int, int, date, text) from public, anon, authenticated;
grant execute on function public.compartir_itinerario(jsonb) to anon, authenticated;
grant execute on function public.ver_itinerario(text) to anon, authenticated;
grant execute on function public.registrar_demanda(text, text, int, int, date, text) to anon, authenticated;

select cron.schedule('purgar-limites', '40 5 * * *', $$select public.purgar_limites()$$);
