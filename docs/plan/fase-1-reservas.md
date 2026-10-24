# Fase 1 — Reservas y cupo real

**Objetivo:** reemplazar `src/state/demo.ts` por Supabase para cuentas de prestadores, negocios, cupos y reservas,
de modo que lo que marca un prestador lo vea cualquier viajero en cualquier dispositivo, en vivo. Es la fase que
vuelve cierta la promesa «Cupo verificado hoy».

**Rama:** `fase-1-reservas` · **Depende de:** Fase 0

## Esquema (`supabase/migrations/0002_operacion.sql`)

- `perfiles(id uuid pk references auth.users, nombre, whatsapp, rol rol_usuario default 'prestador', creado)`.
  Trigger que crea el perfil al registrarse.
- Enum `rol_usuario`: `prestador`, `coordinador`, `admin`. Función `es_coordinador()` para usar en políticas.
- `negocios(id uuid, perfil_id, lugar_id text null references lugares, nombre, tipo tipo_reserva, municipio,
  cupo_diario int check > 0, precio_desde_cop int null, descripcion, whatsapp, activo bool, verificado bool,
  cupo_actualizado timestamptz)`, `unique(lugar_id)`.
  Si `lugar_id` es null es un negocio nuevo que no está en el mapa (hoy se representa con el prefijo `negocio:`).
- Vista `negocios_publicos` sin `whatsapp` ni `perfil_id`.
- `cupo_dia(negocio_id, fecha, cupo int null, cerrado bool, pk(negocio_id, fecha))`.
- Enum `estado_reserva`: `pendiente`, `confirmada`, `rechazada`, `cancelada`, `vencida`.
- `reservas(id uuid, codigo text unique, negocio_id null, lugar_id, tipo, fecha, hora, noches, personas, nombre,
  contacto, nota, estado, creada, actualizada)`. `codigo` = 6 caracteres sin ambiguos (sin 0/O/1/I).
- Funciones `security definer`, con `search_path` fijo:
  - `cupo_libre(negocio uuid, fecha date) returns int` — `coalesce(cupo_dia.cupo, cupo_diario)` menos personas en
    `pendiente` y `confirmada`; 0 si `cerrado`.
  - `crear_reserva(...) returns (codigo, estado)` — bloquea la fila del negocio (`for update`), valida cupo y crea.
    Rechaza fechas pasadas, `personas` fuera de 1..30, nombre o contacto vacíos. Límite: 5 reservas por contacto por día.
  - `mi_reserva(codigo, contacto)` y `cancelar_mi_reserva(codigo, contacto)` para el viajero sin cuenta.
- RLS: el prestador lee y edita sus `negocios`, `cupo_dia` y las `reservas` de sus negocios (solo puede cambiar `estado`);
  nadie inserta en `reservas` directo; el coordinador lee todo.
- Trabajo programado (`pg_cron` si está disponible en el proyecto; si no, un workflow de Actions cada hora) que pasa a
  `vencida` las pendientes con más de 48 h.
- `supabase/tests/0002_operacion.test.sql`: dos reservas simultáneas por el último cupo → una falla; un prestador no
  ve reservas de otro; anon no ve contactos; `cupo_libre` respeta `cerrado` y `cupo_dia`.

## Front

- [ ] `src/state/reservas.ts` reemplaza `demo.ts` **conservando los nombres exportados** que usan las páginas
  (`useUsuario`, `salir`, `guardarNegocio`, `quitarNegocio`, `negocioDeLugar`, `cupoLibre`, `crearReserva`,
  `cambiarEstado`, `useMisReservas`, `hoy`, `LUGAR_NEGOCIO`, tipos `Negocio`, `Reserva`, `EstadoReserva`).
  Diferencia clave: las mutaciones pasan a ser `async` y devuelven `Promise<Resultado>`; actualizar cada llamada en
  `Reservar.tsx`, `MisReservas.tsx`, `PrestadorPanel.tsx`, `PrestadorAcceso.tsx`, `Itinerario.tsx`, `Lugares.tsx`,
  `LugarDetalle.tsx`, `Layout.tsx`, `Chat.tsx`, `Prestadores.tsx` y `src/data/asistente.ts`. Estados de carga y error visibles.
  `useDemo()` se reemplaza por `useOperacion()` (negocios públicos + cupos de los próximos 30 días), suscrito a Realtime.
- [ ] **Acceso de prestadores:** `PrestadorAcceso.tsx` con enlace mágico por correo (Supabase Auth). Quitar el aviso de
  «Modo demostración» y el campo de contraseña.
- [ ] **Panel del prestador** (`PrestadorPanel.tsx`): cupo diario por defecto, calendario de 30 días para cerrar o
  cambiar el cupo de una fecha, lista de solicitudes por estado con Confirmar / Rechazar, aviso en vivo de solicitudes
  nuevas (Realtime sobre `reservas` filtrado por sus negocios). Cada vez que guarda cupo se actualiza `cupo_actualizado`.
- [ ] **WhatsApp sin API:** al crear una reserva, botón «Avisar al negocio por WhatsApp» (`https://wa.me/<num>?text=`)
  con el mensaje armado (lugar, fecha, personas, código). En el panel, al confirmar o rechazar, botón «Avisar al
  viajero». El número del negocio solo lo arma una función de servidor (`rpc`) para no exponerlo en vistas públicas.
- [ ] **Mis reservas:** `/reservas` muestra las de este navegador (códigos guardados en `localStorage`) y un formulario
  «Buscar mi reserva» con código + teléfono.
- [ ] **Etiqueta de cupo honesta:** «Cupo verificado hoy» solo si `cupo_actualizado` tiene menos de 24 h; si no,
  «Cupo por confirmar». Revisar el texto de la portada («Todo lo que ves en la app es cierto ese día») para que coincida.
- [ ] **UX del itinerario — fecha y personas:** en `Itinerario.tsx` agregar «¿Cuándo vas?» (fecha de llegada,
  por defecto el próximo sábado) y «¿Cuántos van?» (1–12). Guardarlos en `ItinerarioProvider`. Con ellos el hospedaje
  sugerido muestra cupo real para esa fecha, y «Reservar» llega con fecha y personas ya llenas.
- [ ] **UX — «Soy prestador»:** sacarlo del encabezado y llevarlo al pie de página y al final de la portada.
- [ ] **Aviso de privacidad** breve en el formulario de reserva (qué se guarda, quién lo ve, borrado a los 12 meses)
  y página `/privacidad`.
- [ ] Borrar `src/state/demo.ts` cuando ya no lo importe nadie.

## Prueba de cierre

1. Prueba e2e con Playwright (`npm i -D @playwright/test`), dos contextos de navegador: el prestador inicia sesión en
   uno (usuario de prueba sembrado en `supabase/seed.sql`), el viajero reserva en otro a 375 px; la solicitud aparece
   en el panel sin recargar en menos de 5 s.
2. Prueba pgTAP de concurrencia en verde: el cupo nunca queda negativo.
3. Un viajero encuentra su reserva desde otro navegador con código + teléfono.
4. `grep -r "state/demo" src` no devuelve nada.

## Prompt para Claude Code

```
Lee CLAUDE.md y docs/plan/fase-1-reservas.md. Ejecuta la Fase 1 en la rama fase-1-reservas.
Primero en modo plan: muéstrame el SQL de 0002_operacion.sql (tablas, políticas RLS y funciones) y la lista de
páginas que cambian, y espera mi aprobación antes de escribir código.
Reglas: conserva los nombres exportados de demo.ts en el nuevo src/state/reservas.ts; crear_reserva debe ser atómica
con bloqueo de fila; ningún dato de contacto en vistas públicas; prueba cada pantalla a 375 px.
Al terminar corre build, test, supabase test db y la prueba Playwright, marca el checklist y dime qué configurar
en Supabase Auth (URL de redirección, plantilla del correo en español).
```
