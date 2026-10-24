-- Contenido editable: ajustes, embajadores, eventos y mantenimiento de lugares por el coordinador.
-- Recordatorio: 0002 cerró por defecto lo nuevo a anon/authenticated; todo se otorga de forma explícita.

-- ---------------------------------------------------------------------------
-- ajustes: contacto, horario y redes que muestra el sitio
-- ---------------------------------------------------------------------------
-- Claves esperadas (NO se siembran: si falta el dato, el sitio oculta la línea correspondiente):
--   contacto            {"whatsapp": "573001234567", "correo": "hola@ejemplo.co"}
--   horario_embajadores {"texto": "Lunes a sábado, 8:00 a 17:00"}
--   redes               [{"nombre": "Instagram", "url": "https://instagram.com/..."}]
create table public.ajustes (
  clave       text primary key,
  valor       jsonb not null,
  actualizado timestamptz not null default now()
);
alter table public.ajustes enable row level security;
revoke all on public.ajustes from anon, authenticated;
grant select on public.ajustes to anon, authenticated;
grant insert, update, delete on public.ajustes to authenticated;
create policy ajustes_lectura_publica on public.ajustes for select to anon, authenticated using (true);
create policy ajustes_coordinador_insert on public.ajustes for insert to authenticated
  with check (public.es_coordinador());
create policy ajustes_coordinador_update on public.ajustes for update to authenticated
  using (public.es_coordinador()) with check (public.es_coordinador());
create policy ajustes_coordinador_delete on public.ajustes for delete to authenticated
  using (public.es_coordinador());

create function public.ajustes_marca_fecha() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  new.actualizado := now();
  return new;
end;
$$;
create trigger ajustes_marca_fecha before update on public.ajustes
  for each row execute function public.ajustes_marca_fecha();

-- ---------------------------------------------------------------------------
-- embajadores
-- ---------------------------------------------------------------------------
-- Decisión: los embajadores son voluntarios que publican su nombre y WhatsApp precisamente para atender
-- viajeros; por eso la lectura pública incluye el WhatsApp, pero SOLO de los activos. Un embajador
-- inactivo (o que pidió salir) deja de ser visible de inmediato. Solo el coordinador ve y edita todos.
-- `horario`: lista de franjas, p. ej. [{"dias":[1,2,3,4,5], "desde":"08:00", "hasta":"17:00"}]
-- (días ISO: 1 = lunes … 7 = domingo; hora de America/Bogota; `hasta` excluyente).
create table public.embajadores (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null check (length(btrim(nombre)) > 0),
  municipio text not null references public.municipios (slug),
  whatsapp  text not null check (length(btrim(whatsapp)) > 0),
  horario   jsonb not null default '[]' check (jsonb_typeof(horario) = 'array'),
  activo    boolean not null default true,
  creado    timestamptz not null default now()
);
create index embajadores_municipio_idx on public.embajadores (municipio);
alter table public.embajadores enable row level security;
revoke all on public.embajadores from anon, authenticated;
grant select on public.embajadores to anon, authenticated;
grant insert, update, delete on public.embajadores to authenticated;
create policy embajadores_lectura_publica on public.embajadores for select to anon, authenticated
  using (activo);
create policy embajadores_coordinador_select on public.embajadores for select to authenticated
  using (public.es_coordinador());
create policy embajadores_coordinador_insert on public.embajadores for insert to authenticated
  with check (public.es_coordinador());
create policy embajadores_coordinador_update on public.embajadores for update to authenticated
  using (public.es_coordinador()) with check (public.es_coordinador());
create policy embajadores_coordinador_delete on public.embajadores for delete to authenticated
  using (public.es_coordinador());

-- Activos cuya franja incluye la hora actual en Bogotá. Security invoker: respeta la RLS de quien llama.
create function public.embajadores_disponibles() returns setof public.embajadores
language sql stable security invoker set search_path = public, pg_temp as $$
  with ahora as (
    select extract(isodow from now() at time zone 'America/Bogota')::int as dia,
           (now() at time zone 'America/Bogota')::time as hora)
  select e.* from public.embajadores e, ahora a
  where e.activo
    and exists (
      select 1 from jsonb_array_elements(e.horario) f
      where f -> 'dias' @> to_jsonb(a.dia)
        and a.hora >= (f ->> 'desde')::time
        and a.hora <  (f ->> 'hasta')::time)
  order by e.nombre;
$$;
revoke execute on function public.ajustes_marca_fecha() from public, anon, authenticated;
revoke execute on function public.embajadores_disponibles() from public;
grant execute on function public.embajadores_disponibles() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- eventos: el coordinador escribe (la lectura pública ya existe desde 0001)
-- ---------------------------------------------------------------------------
grant insert, update, delete on public.eventos to authenticated;
grant usage on sequence public.eventos_id_seq to authenticated;
create policy eventos_coordinador_insert on public.eventos for insert to authenticated
  with check (public.es_coordinador());
create policy eventos_coordinador_update on public.eventos for update to authenticated
  using (public.es_coordinador()) with check (public.es_coordinador());
create policy eventos_coordinador_delete on public.eventos for delete to authenticated
  using (public.es_coordinador());

-- ---------------------------------------------------------------------------
-- lugares: el coordinador solo cambia acceso, verificado_en y visible, y puede leer los ocultos
-- ---------------------------------------------------------------------------
grant update (acceso, verificado_en, visible) on public.lugares to authenticated;
create policy lugares_coordinador_select on public.lugares for select to authenticated
  using (public.es_coordinador());
create policy lugares_coordinador_update on public.lugares for update to authenticated
  using (public.es_coordinador()) with check (public.es_coordinador());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.eventos;
