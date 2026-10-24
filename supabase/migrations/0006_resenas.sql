-- Reseñas post-viaje (Fase 5).
-- Privacidad: la tabla NO guarda nombre ni contacto del viajero; se vincula a la reserva solo por `reserva_id`.
-- Decisión sobre la purga de 12 meses (`purgar_reservas`, 0002): `reserva_id` es `on delete set null`, así que al
-- borrar la reserva (datos personales) la reseña sobrevive ya anónima y conserva negocio_id, lugar_id,
-- calificación y comentario. La unicidad «una por reserva» sigue valiendo mientras la reserva exista (varios
-- NULL no chocan en un índice único). Riesgo residual: el comentario es texto libre; por eso nace `visible = false`
-- y el coordinador la modera antes de publicarla.
-- Recordatorio (0002): todo lo nuevo en `public` nace SIN acceso para anon/authenticated; se otorga explícito.

create table public.resenas (
  id           uuid primary key default gen_random_uuid(),
  reserva_id   uuid unique references public.reservas (id) on delete set null,
  negocio_id   uuid references public.negocios (id) on delete set null,
  lugar_id     text check (lugar_id is null or length(lugar_id) <= 100),
  calificacion int not null check (calificacion between 1 and 5),
  comentario   text check (comentario is null or length(comentario) <= 1000),
  creada       timestamptz not null default now(),
  visible      boolean not null default false
);
create index resenas_negocio_idx on public.resenas (negocio_id);
create index resenas_lugar_visible_idx on public.resenas (lugar_id) where visible;

alter table public.resenas enable row level security;
revoke all on public.resenas from anon, authenticated;

-- Lectura: prestador (las de sus negocios, visibles o no) y coordinador (todas).
-- Escritura: nadie inserta directo (solo `dejar_resena`); el coordinador cambia ÚNICAMENTE `visible`.
grant select on public.resenas to authenticated;
grant update (visible) on public.resenas to authenticated;
create policy resenas_prestador_select on public.resenas for select to authenticated
  using (exists (select 1 from public.negocios n where n.id = negocio_id and n.perfil_id = auth.uid()));
create policy resenas_coordinador_select on public.resenas for select to authenticated
  using (public.es_coordinador());
create policy resenas_coordinador_update on public.resenas for update to authenticated
  using (public.es_coordinador()) with check (public.es_coordinador());

-- ---------------------------------------------------------------------------
-- Funciones para el viajero (sin cuenta): código + contacto normalizado
-- ---------------------------------------------------------------------------
create function public.dejar_resena(p_codigo text, p_contacto text, p_calificacion int, p_comentario text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_res public.reservas%rowtype;
  v_lugar text;
begin
  if p_calificacion is null or p_calificacion < 1 or p_calificacion > 5 then
    raise exception 'La calificación debe estar entre 1 y 5' using errcode = 'P0001';
  end if;
  if length(p_comentario) > 1000 then
    raise exception 'El comentario es demasiado largo (máximo 1000 caracteres)' using errcode = 'P0001';
  end if;

  select * into v_res from public.reservas r
  where r.codigo = upper(btrim(p_codigo))
    and public.normalizar_contacto(r.contacto) = public.normalizar_contacto(p_contacto)
    and public.normalizar_contacto(p_contacto) <> ''
  for update;
  if not found then
    raise exception 'No encontramos una reserva con ese código y teléfono' using errcode = 'P0001';
  end if;
  if v_res.estado <> 'confirmada' then
    raise exception 'Solo se pueden reseñar reservas confirmadas' using errcode = 'P0001';
  end if;
  if public.hoy_bogota() < v_res.fecha + v_res.noches then
    raise exception 'Podrás dejar tu reseña cuando termine tu visita' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.resenas where reserva_id = v_res.id) then
    raise exception 'Ya dejaste una reseña para esta reserva' using errcode = 'P0001';
  end if;

  select coalesce(n.lugar_id, v_res.lugar_id) into v_lugar
  from (select 1) uno left join public.negocios n on n.id = v_res.negocio_id;

  insert into public.resenas (reserva_id, negocio_id, lugar_id, calificacion, comentario)
  values (v_res.id, v_res.negocio_id, v_lugar, p_calificacion, nullif(btrim(coalesce(p_comentario, '')), ''));
exception when unique_violation then
  raise exception 'Ya dejaste una reseña para esta reserva' using errcode = 'P0001';
end;
$$;

-- Siempre devuelve una fila: `puede` + `motivo` (null si puede) para decidir si mostrar el formulario.
create function public.resena_pendiente(p_codigo text, p_contacto text)
returns table (puede boolean, motivo text, negocio_nombre text, fecha date)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_res public.reservas%rowtype;
  v_nombre text;
begin
  select * into v_res from public.reservas r
  where r.codigo = upper(btrim(p_codigo))
    and public.normalizar_contacto(r.contacto) = public.normalizar_contacto(p_contacto)
    and public.normalizar_contacto(p_contacto) <> '';
  if not found then
    return query select false, 'No encontramos una reserva con ese código y teléfono'::text, null::text, null::date;
    return;
  end if;
  select n.nombre into v_nombre from public.negocios n where n.id = v_res.negocio_id;
  if v_res.estado <> 'confirmada' then
    return query select false, 'Solo se pueden reseñar reservas confirmadas'::text, v_nombre, v_res.fecha;
  elsif public.hoy_bogota() < v_res.fecha + v_res.noches then
    return query select false, 'Podrás dejar tu reseña cuando termine tu visita'::text, v_nombre, v_res.fecha;
  elsif exists (select 1 from public.resenas where reserva_id = v_res.id) then
    return query select false, 'Ya dejaste una reseña para esta reserva'::text, v_nombre, v_res.fecha;
  else
    return query select true, null::text, v_nombre, v_res.fecha;
  end if;
end;
$$;

revoke execute on function public.dejar_resena(text, text, int, text), public.resena_pendiente(text, text)
  from public, anon, authenticated;
grant execute on function public.dejar_resena(text, text, int, text) to anon, authenticated;
grant execute on function public.resena_pendiente(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vistas públicas (solo reseñas visibles, sin reserva_id) y resumen por lugar
-- ---------------------------------------------------------------------------
-- security_invoker = false: anon no tiene acceso a `resenas`; la vista filtra `visible` y lista columnas.
create view public.resenas_publicas with (security_invoker = false) as
  select id, negocio_id, lugar_id, calificacion, comentario, creada
  from public.resenas
  where visible;

create view public.calificacion_lugares with (security_invoker = false) as
  select lugar_id, round(avg(calificacion), 1)::numeric(2,1) as promedio, count(*)::int as total
  from public.resenas
  where visible and lugar_id is not null
  group by lugar_id;

grant select on public.resenas_publicas, public.calificacion_lugares to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Para el botón del prestador «Pedir reseña por WhatsApp»
-- ---------------------------------------------------------------------------
-- security_invoker: la RLS de `reservas` limita al prestador a las suyas (y el coordinador ve todas).
-- Incluye nombre y contacto del viajero: solo los ve el dueño del negocio, como en `reservas`.
create view public.reservas_para_resena with (security_invoker = true) as
  select r.id as reserva_id, r.codigo, r.negocio_id, r.nombre, r.contacto, r.fecha
  from public.reservas r
  where r.estado = 'confirmada'
    and public.hoy_bogota() >= r.fecha + r.noches
    and not exists (select 1 from public.resenas s where s.reserva_id = r.id);

grant select on public.reservas_para_resena to authenticated;
