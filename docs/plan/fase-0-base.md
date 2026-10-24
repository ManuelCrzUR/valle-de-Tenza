# Fase 0 — Base en Supabase

**Objetivo:** que el catálogo (municipios, lugares) viva en Supabase, con la infraestructura gratuita que lo mantiene
vivo (ping, backups) y un solo destino de despliegue. Ningún cambio visible para el viajero, salvo que todo sigue funcionando.

**Rama:** `fase-0-base`

## Tareas

- [ ] **Supabase local y migraciones**
  - `npx supabase init`; carpeta `supabase/` versionada (sin `.env`).
  - `supabase/migrations/0001_catalogo.sql`: tablas `municipios`, `lugares`, `eventos`; enum `precision_ubicacion`;
    índices por `municipio` y `categoria`; columnas nuevas en `lugares`: `acceso text`, `verificado_en date`,
    `visible boolean default true`, `actualizado timestamptz default now()`.
  - RLS: `select` público donde `visible`; escritura solo `service_role` y rol `coordinador` (la tabla `perfiles` llega en
    la Fase 1, así que por ahora solo `service_role`).
  - `supabase/tests/0001_catalogo.test.sql` (pgTAP): anon puede leer lugares visibles, no puede insertar ni ver ocultos.
- [ ] **Carga del catálogo**
  - `scripts/cargar-lugares.ts`: lee `src/data/lugares.json` y hace *upsert* por `id` con la llave `service_role`
    (variable `SUPABASE_SERVICE_ROLE_KEY`, nunca en el front). Idempotente.
  - Documentar en el README cómo correrlo después de cada corrida del scraper.
- [ ] **Capa de datos en el front**
  - `npm i @supabase/supabase-js`; `src/lib/supabase.ts` crea el cliente con `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
    y exporta `null` si faltan (modo sin backend).
  - `src/lib/database.types.ts` generado con `supabase gen types`.
  - `src/data/lugares.ts`: mantener las exportaciones actuales (`LUGARES`, `MUNICIPIOS`, `getLugar`, etc.) cargadas del
    JSON al arrancar, y agregar `useCatalogo()` que trae la versión de Supabase y la cachea en memoria. Si la consulta
    falla o tarda más de 4 s, se queda con el JSON. Las pantallas migran a `useCatalogo()` sin cambiar su UI.
- [ ] **Pruebas**
  - `npm i -D vitest`; script `"test": "vitest run"`.
  - `src/data/generarPlan.test.ts`: misma semilla → mismo itinerario; nunca más de `DIAS_MAX` días; hospedaje presente
    cuando hay alojamientos en el municipio.
- [ ] **Despliegue único en Vercel**
  - Borrar `.github/workflows/deploy.yml` (GitHub Pages) y quitar la mención en el README.
  - `vercel.json` con cabeceras de caché para `/assets/*` y `/fotos/*`.
  - Variables en Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Actualizar `.env.example`.
- [ ] **Mantener vivo y respaldado (GitHub Actions, gratis en repo público)**
  - `.github/workflows/supabase-ping.yml`: cada 3 días, `curl` a `/rest/v1/municipios?select=slug&limit=1` con la anon key.
    Falla visible si responde distinto de 200.
  - `.github/workflows/backup.yml`: diario 03:00 Bogotá (08:00 UTC), `supabase db dump` (esquema + datos) comprimido como
    artifact con retención de 30 días. Secreto `SUPABASE_DB_URL`.
  - `.github/workflows/ci.yml`: en cada PR, `npm ci && npm run build && npm run test`.

## Archivos

Nuevos: `supabase/config.toml`, `supabase/migrations/0001_catalogo.sql`, `supabase/tests/0001_catalogo.test.sql`,
`scripts/cargar-lugares.ts`, `src/lib/supabase.ts`, `src/lib/database.types.ts`, `src/data/generarPlan.test.ts`,
`vercel.json`, `.github/workflows/{supabase-ping,backup,ci}.yml`.
Cambian: `src/data/lugares.ts`, `.env.example`, `package.json`, `README.md`. Se borra: `.github/workflows/deploy.yml`.

## Prueba de cierre

1. `npx supabase db reset && npx supabase test db` en verde.
2. Con las variables configuradas, la pestaña Red muestra la consulta a Supabase y el mapa sigue con 152 lugares.
3. Sin variables (o con la URL rota), la app funciona igual usando el JSON y no hay errores en consola.
4. El workflow de backup corrió una vez manualmente (`workflow_dispatch`) y dejó el artifact.

## Prompt para Claude Code

```
Lee CLAUDE.md y docs/plan/fase-0-base.md. Ejecuta la Fase 0 completa en la rama fase-0-base.
Empieza en modo plan: lista las migraciones, archivos y el orden en que harás las tareas, y espera mi aprobación.
Reglas: RLS y prueba pgTAP para cada tabla; el front debe seguir funcionando sin Supabase usando lugares.json;
no cambies la UI. Al terminar corre build, tests y supabase test db, marca el checklist del archivo de la fase
y dame los pasos exactos que debo hacer yo en Supabase, Vercel y GitHub (secrets) para que funcione en producción.
```
