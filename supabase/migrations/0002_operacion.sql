-- Operación: perfiles, negocios, cupo por día, reservas y funciones de reserva.
-- Principios: RLS en todo; los viajeros (sin cuenta) solo operan por funciones `security definer`;
-- los datos personales (nombre, contacto) y el WhatsApp nunca salen en vistas ni tablas públicas.

create extension if not exists pg_cron with schema extensions;

-- Supabase otorga por defecto EXECUTE/ALL a anon y authenticated sobre todo lo nuevo en `public`.
-- Se invierte: lo que se cree después en este esquema (por el rol que corre las migraciones) no es
-- accesible por la API hasta que se otorgue de forma explícita.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Restos de la migración 0001: la secuencia de `eventos` y los privilegios references/trigger/maintain.
revoke all on sequence public.eventos_id_seq from anon, authenticated;
revoke references, trigger, maintain on public.municipios, public.lugares, public.eventos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.rol_usuario as enum ('prestador', 'coordinador', 'admin');
create type public.tipo_reserva as enum ('hotel', 'restaurante', 'caminata', 'actividad');
create type public.estado_reserva as enum ('pendiente', 'confirmada', 'rechazada', 'cancelada', 'vencida');

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.perfiles (
  id       uuid primary key references auth.users (id) on delete cascade,
  nombre   text not null default '',
  whatsapp text,
  rol      public.rol_usuario not null default 'prestador',
  creado   timestamptz not null default now()
);

create table public.negocios (
  id               uuid primary key default gen_random_uuid(),
  perfil_id        uuid not null references public.perfiles (id) on delete cascade,
  -- null = negocio nuevo que no está en el mapa (el front lo representa con el prefijo `negocio:`)
  lugar_id         text unique references public.lugares (id) on delete set null,
  nombre           text not null check (length(btrim(nombre)) > 0),
  tipo             public.tipo_reserva not null,
  municipio        text not null references public.municipios (slug),
  cupo_diario      int not null check (cupo_diario > 0),
  precio_desde_cop int check (precio_desde_cop is null or precio_desde_cop >= 0),
  descripcion      text not null default '',
  whatsapp         text,
  activo           boolean not null default true,
  verificado       boolean not null default false,
  cupo_actualizado timestamptz not null default now(),
  creado           timestamptz not null default now()
);
create index negocios_perfil_idx on public.negocios (perfil_id);

create table public.cupo_dia (
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  fecha      date not null,
  cupo       int check (cupo is null or cupo >= 0),   -- null = usar cupo_diario
  cerrado    boolean not null default false,
  primary key (negocio_id, fecha)
);

create table public.reservas (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  negocio_id uuid references public.negocios (id) on delete set null,  -- null = lugar sin dueño en la app
  lugar_id   text check (lugar_id is null or length(lugar_id) <= 100),  -- sin FK: puede ser un id del catálogo o `negocio:<uuid>`
  tipo       public.tipo_reserva not null,
  fecha      date not null,
  hora       text check (hora is null or length(hora) <= 20),
  noches     int not null default 1 check (noches between 1 and 30),
  personas   int not null check (personas between 1 and 30),
  nombre     text not null check (length(btrim(nombre)) > 0 and length(nombre) <= 120),
  contacto   text not null check (length(btrim(contacto)) > 0 and length(contacto) <= 40),
  nota       text check (nota is null or length(nota) <= 500),
  estado     public.estado_reserva not null default 'pendiente',
  creada     timestamptz not null default now(),
  actualizada timestamptz not null default now()
);
create index reservas_negocio_fecha_idx on public.reservas (negocio_id, fecha);

-- Personas reservadas por negocio y fecha (pendiente + confirmada). Sin datos personales:
-- lectura pública para que el front calcule el cupo libre y se suscriba por Realtime.
create table public.ocupacion (
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  fecha      date not null,
  personas   int not null default 0 check (personas >= 0),
  primary key (negocio_id, fecha)
);

alter table public.perfiles   enable row level security;
alter table public.negocios   enable row level security;
alter table public.cupo_dia   enable row level security;
alter table public.reservas   enable row level security;
alter table public.ocupacion  enable row level security;

-- Se parte de cero privilegios y se otorga solo lo necesario.
revoke all on public.perfiles, public.negocios, public.cupo_dia, public.reservas, public.ocupacion
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------
create function public.es_coordinador() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol in ('coordinador', 'admin'));
$$;

create function public.hoy_bogota() returns date
language sql stable set search_path = pg_catalog as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

-- Solo dígitos, para comparar teléfonos escritos de distinta forma.
create function public.normalizar_contacto(p text) returns text
language sql immutable set search_path = pg_catalog as $$
  select regexp_replace(coalesce(p, ''), '\D', '', 'g');
$$;

-- Índice para el límite diario y la búsqueda por contacto (la expresión debe ser la misma llamada).
create index reservas_contacto_idx on public.reservas (public.normalizar_contacto(contacto), creada);

-- Perfil automático al registrarse. El rol nunca se toma de los metadatos (los edita el usuario).
create function public.crear_perfil_al_registrarse() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), new.email, ''));
  return new;
end;
$$;

create trigger crear_perfil after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();

-- ---------------------------------------------------------------------------
-- Triggers de negocios / cupo / ocupación / reservas
-- ---------------------------------------------------------------------------
-- Guardar cupo actualiza la marca de verificación.
create function public.negocio_marca_cupo() returns trigger
language plpgsql as $$
begin
  if new.cupo_diario is distinct from old.cupo_diario then
    new.cupo_actualizado := now();
  end if;
  return new;
end;
$$;
create trigger negocio_marca_cupo before update on public.negocios
  for each row execute function public.negocio_marca_cupo();

create function public.cupo_dia_marca_negocio() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.negocios set cupo_actualizado = now()
  where id = coalesce(new.negocio_id, old.negocio_id);
  return null;
end;
$$;
create trigger cupo_dia_marca_negocio after insert or update or delete on public.cupo_dia
  for each row execute function public.cupo_dia_marca_negocio();

-- Ajuste incremental (suma/resta): es conmutativo, así que dos transacciones concurrentes no se pisan
-- (recalcular con un SUM desde cero perdería cambios aún no confirmados de la otra transacción).
create function public.ajustar_ocupacion(p_negocio uuid, p_fecha date, p_delta int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_negocio is null or p_fecha is null or coalesce(p_delta, 0) = 0 then return; end if;
  insert into public.ocupacion (negocio_id, fecha, personas)
  select n.id, p_fecha, greatest(p_delta, 0) from public.negocios n where n.id = p_negocio
  on conflict (negocio_id, fecha) do update set personas = greatest(0, ocupacion.personas + p_delta);
end;
$$;

create function public.reservas_mantener_ocupacion() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.estado in ('pendiente', 'confirmada') then
    perform public.ajustar_ocupacion(old.negocio_id, old.fecha, -old.personas);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.estado in ('pendiente', 'confirmada') then
    perform public.ajustar_ocupacion(new.negocio_id, new.fecha, new.personas);
  end if;
  return null;
end;
$$;
create trigger reservas_ocupacion after insert or update or delete on public.reservas
  for each row execute function public.reservas_mantener_ocupacion();

-- El prestador (rol authenticated) solo puede cambiar `estado`, y solo en transiciones válidas.
-- Las funciones security definer y el cron corren como dueño y no pasan por esta restricción.
create function public.reservas_validar_cambio() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated') then
    if (to_jsonb(new) - 'estado' - 'actualizada') is distinct from (to_jsonb(old) - 'estado' - 'actualizada') then
      raise exception 'Solo se puede cambiar el estado de la reserva' using errcode = '42501';
    end if;
    if new.estado is distinct from old.estado and not (
         (old.estado = 'pendiente'  and new.estado in ('confirmada', 'rechazada'))
      or (old.estado = 'confirmada' and new.estado = 'cancelada')) then
      raise exception 'Transición de estado no permitida: % a %', old.estado, new.estado using errcode = 'P0001';
    end if;
  end if;
  new.actualizada := now();
  return new;
end;
$$;
create trigger reservas_validar_cambio before update on public.reservas
  for each row execute function public.reservas_validar_cambio();

-- ---------------------------------------------------------------------------
-- Vista pública de negocios (sin whatsapp ni perfil_id)
-- ---------------------------------------------------------------------------
-- Decisión: security_invoker = false (la vista corre con los permisos de su dueño) porque anon no
-- tiene ningún acceso a `negocios`. Es segura porque (1) filtra `activo`, (2) lista columnas
-- explícitas sin whatsapp ni perfil_id. Si se agregan columnas a negocios NO aparecen aquí solas.
create view public.negocios_publicos with (security_invoker = false) as
  select id, lugar_id, nombre, tipo, municipio, cupo_diario, precio_desde_cop, descripcion,
         verificado, cupo_actualizado
  from public.negocios
  where activo;
revoke all on public.negocios_publicos from anon, authenticated;
grant select on public.negocios_publicos to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cupo y reservas
-- ---------------------------------------------------------------------------
create function public.cupo_libre(negocio uuid, fecha date) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when n.id is null or coalesce(d.cerrado, false) then 0
    else greatest(0, coalesce(d.cupo, n.cupo_diario) - coalesce((
      select sum(r.personas)::int from public.reservas r
      where r.negocio_id = n.id and r.fecha = cupo_libre.fecha and r.estado in ('pendiente', 'confirmada')), 0))
  end
  from (select 1) uno
  left join public.negocios n on n.id = negocio and n.activo
  left join public.cupo_dia d on d.negocio_id = n.id and d.fecha = cupo_libre.fecha;
$$;

create function public.crear_reserva(
  p_lugar_id text, p_tipo public.tipo_reserva, p_fecha date, p_hora text, p_noches int,
  p_personas int, p_nombre text, p_contacto text, p_nota text, p_negocio_id uuid default null)
returns table (codigo text, estado public.estado_reserva)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_negocio public.negocios%rowtype;
  v_contacto text := public.normalizar_contacto(p_contacto);
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- sin 0, O, 1, I
  v_codigo text;
  v_intentos int := 0;
  v_id uuid;
begin
  if p_fecha is null or p_fecha < public.hoy_bogota() then
    raise exception 'La fecha de la reserva ya pasó' using errcode = 'P0001';
  end if;
  if p_fecha > public.hoy_bogota() + 365 then
    raise exception 'La fecha de la reserva es demasiado lejana' using errcode = 'P0001';
  end if;
  if length(p_nombre) > 120 or length(p_contacto) > 40 or length(p_nota) > 500 or length(p_hora) > 20
     or length(p_lugar_id) > 100 then
    raise exception 'Algún dato es demasiado largo' using errcode = 'P0001';
  end if;
  if p_personas is null or p_personas < 1 or p_personas > 30 then
    raise exception 'El número de personas debe estar entre 1 y 30' using errcode = 'P0001';
  end if;
  if p_noches is null or p_noches < 1 or p_noches > 30 then
    raise exception 'El número de noches debe estar entre 1 y 30' using errcode = 'P0001';
  end if;
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'Falta el nombre' using errcode = 'P0001';
  end if;
  if p_contacto is null or btrim(p_contacto) = '' or v_contacto = '' then
    raise exception 'Falta un teléfono de contacto válido' using errcode = 'P0001';
  end if;
  -- Serializa las reservas del mismo contacto para que el tope de 5/día no se supere en paralelo.
  perform pg_advisory_xact_lock(hashtextextended('contacto:' || v_contacto, 0));
  if (select count(*) from public.reservas r
      where public.normalizar_contacto(r.contacto) = v_contacto
        and r.creada >= (public.hoy_bogota()::timestamp at time zone 'America/Bogota')) >= 5 then
    raise exception 'Demasiadas reservas con este contacto hoy (máximo 5)' using errcode = 'P0001';
  end if;

  -- Negocio: por id explícito, por `negocio:<uuid>` o por lugar_id. Se bloquea la fila.
  if p_negocio_id is not null then
    select * into v_negocio from public.negocios where id = p_negocio_id and activo for update;
    if not found then
      raise exception 'El negocio no está disponible' using errcode = 'P0001';
    end if;
  elsif p_lugar_id like 'negocio:%' then
    begin
      select * into v_negocio from public.negocios
      where id = substr(p_lugar_id, 9)::uuid and activo for update;
    exception when invalid_text_representation then
      v_negocio := null;
    end;
    if v_negocio.id is null then
      raise exception 'El negocio no está disponible' using errcode = 'P0001';
    end if;
  elsif p_lugar_id is not null then
    select * into v_negocio from public.negocios where lugar_id = p_lugar_id and activo for update;
  end if;

  if v_negocio.id is not null then
    if public.cupo_libre(v_negocio.id, p_fecha) < p_personas then
      raise exception 'Sin cupo para esa fecha: quedan % lugares', public.cupo_libre(v_negocio.id, p_fecha)
        using errcode = 'P0001';
    end if;
  end if;

  loop
    v_intentos := v_intentos + 1;
    v_codigo := (select string_agg(substr(v_alfabeto, 1 + floor(random() * 32)::int, 1), '')
                 from generate_series(1, 6));
    begin
      insert into public.reservas (codigo, negocio_id, lugar_id, tipo, fecha, hora, noches, personas,
                                   nombre, contacto, nota)
      values (v_codigo, v_negocio.id, p_lugar_id, p_tipo, p_fecha, nullif(btrim(p_hora), ''), p_noches,
              p_personas, btrim(p_nombre), btrim(p_contacto), nullif(btrim(coalesce(p_nota, '')), ''))
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_intentos >= 10 then
        raise exception 'No se pudo generar un código de reserva' using errcode = 'P0001';
      end if;
    end;
  end loop;

  return query select r.codigo, r.estado from public.reservas r where r.id = v_id;
end;
$$;

create function public.mi_reserva(p_codigo text, p_contacto text)
returns table (
  codigo text, estado public.estado_reserva, negocio_id uuid, negocio_nombre text, lugar_id text,
  tipo public.tipo_reserva, fecha date, hora text, noches int, personas int, nombre text, nota text,
  creada timestamptz, actualizada timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.codigo, r.estado, r.negocio_id, n.nombre, r.lugar_id, r.tipo, r.fecha, r.hora, r.noches,
         r.personas, r.nombre, r.nota, r.creada, r.actualizada
  from public.reservas r
  left join public.negocios n on n.id = r.negocio_id
  where r.codigo = upper(btrim(p_codigo))
    and public.normalizar_contacto(r.contacto) = public.normalizar_contacto(p_contacto)
    and public.normalizar_contacto(p_contacto) <> '';
$$;

create function public.cancelar_mi_reserva(p_codigo text, p_contacto text)
returns table (codigo text, estado public.estado_reserva)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_res public.reservas%rowtype;
begin
  select * into v_res from public.reservas r
  where r.codigo = upper(btrim(p_codigo))
    and public.normalizar_contacto(r.contacto) = public.normalizar_contacto(p_contacto)
    and public.normalizar_contacto(p_contacto) <> ''
  for update;
  if not found then
    raise exception 'No encontramos una reserva con ese código y teléfono' using errcode = 'P0001';
  end if;
  if v_res.estado not in ('pendiente', 'confirmada') then
    raise exception 'La reserva ya está % y no se puede cancelar', v_res.estado using errcode = 'P0001';
  end if;
  if v_res.fecha < public.hoy_bogota() then
    raise exception 'La fecha de la reserva ya pasó' using errcode = 'P0001';
  end if;
  update public.reservas set estado = 'cancelada' where id = v_res.id;
  return query select v_res.codigo, 'cancelada'::public.estado_reserva;
end;
$$;

-- Número del negocio activo, para el botón «Avisar al negocio por WhatsApp».
create function public.whatsapp_negocio(p_negocio uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select whatsapp from public.negocios where id = p_negocio and activo;
$$;

create function public.vencer_reservas() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update public.reservas set estado = 'vencida'
  where estado = 'pendiente' and creada < now() - interval '48 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Ley 1581 de 2012 / aviso de privacidad: los datos personales de las reservas se borran a los 12 meses.
create function public.purgar_reservas() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  delete from public.reservas where creada < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Permisos de ejecución: nada por defecto; solo lo que necesita cada rol.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.es_coordinador() to anon, authenticated;
grant execute on function public.hoy_bogota() to anon, authenticated;
grant execute on function public.cupo_libre(uuid, date) to anon, authenticated;
grant execute on function public.crear_reserva(text, public.tipo_reserva, date, text, int, int, text, text, text, uuid)
  to anon, authenticated;
grant execute on function public.mi_reserva(text, text) to anon, authenticated;
grant execute on function public.cancelar_mi_reserva(text, text) to anon, authenticated;
grant execute on function public.whatsapp_negocio(uuid) to anon, authenticated;

select cron.schedule('vencer-reservas', '0 * * * *', $$select public.vencer_reservas()$$);
select cron.schedule('purgar-reservas', '30 5 * * *', $$select public.purgar_reservas()$$);

-- ---------------------------------------------------------------------------
-- Privilegios y políticas RLS
-- ---------------------------------------------------------------------------
-- perfiles: cada uno lee/edita el suyo (sin tocar `rol`); el coordinador lee todos.
grant select on public.perfiles to authenticated;
grant update (nombre, whatsapp) on public.perfiles to authenticated;
create policy perfiles_propio_select on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_coordinador());
create policy perfiles_propio_update on public.perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- negocios: el prestador gestiona los suyos (no puede marcar `verificado` ni cambiar el dueño).
grant select, delete on public.negocios to authenticated;
grant insert (perfil_id, lugar_id, nombre, tipo, municipio, cupo_diario, precio_desde_cop, descripcion,
              whatsapp, activo) on public.negocios to authenticated;
grant update (lugar_id, nombre, tipo, municipio, cupo_diario, precio_desde_cop, descripcion,
              whatsapp, activo) on public.negocios to authenticated;
create policy negocios_propios on public.negocios for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
create policy negocios_coordinador_select on public.negocios for select to authenticated
  using (public.es_coordinador());

-- cupo_dia: lectura pública; el prestador escribe en sus negocios.
grant select on public.cupo_dia to anon, authenticated;
grant insert, update, delete on public.cupo_dia to authenticated;
create policy cupo_dia_lectura_publica on public.cupo_dia for select to anon, authenticated using (true);
create policy cupo_dia_propio_insert on public.cupo_dia for insert to authenticated
  with check (exists (select 1 from public.negocios n where n.id = negocio_id and n.perfil_id = auth.uid()));
create policy cupo_dia_propio_update on public.cupo_dia for update to authenticated
  using (exists (select 1 from public.negocios n where n.id = negocio_id and n.perfil_id = auth.uid()))
  with check (exists (select 1 from public.negocios n where n.id = negocio_id and n.perfil_id = auth.uid()));
create policy cupo_dia_propio_delete on public.cupo_dia for delete to authenticated
  using (exists (select 1 from public.negocios n where n.id = negocio_id and n.perfil_id = auth.uid()));

-- ocupacion: lectura pública, escritura solo por trigger.
grant select on public.ocupacion to anon, authenticated;
create policy ocupacion_lectura_publica on public.ocupacion for select to anon, authenticated using (true);

-- reservas: nadie inserta directo; el prestador lee las de sus negocios y solo cambia `estado`.
grant select on public.reservas to authenticated;
grant update (estado, actualizada) on public.reservas to authenticated;
create policy reservas_prestador_select on public.reservas for select to authenticated
  using (exists (select 1 from public.negocios n where n.id = negocio_id and n.perfil_id = auth.uid()));
create policy reservas_coordinador_select on public.reservas for select to authenticated
  using (public.es_coordinador());
create policy reservas_prestador_update on public.reservas for update to authenticated
  using (exists (select 1 from public.negocios n where n.id = negocio_id and n.perfil_id = auth.uid()))
  with check (exists (select 1 from public.negocios n where n.id = negocio_id and n.perfil_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime (respeta RLS: el prestador solo recibe sus reservas)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.ocupacion, public.cupo_dia, public.negocios, public.reservas;
