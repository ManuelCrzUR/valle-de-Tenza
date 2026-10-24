# Fase 2 — Transporte y logística

**Objetivo:** responder las preguntas que hoy la app no responde: cómo llego desde Bogotá, cuánto me demoro entre
pueblos, si la vía está bien y si va a llover. Todo con datos guardados en Supabase y actualizados por trabajos
programados o por el coordinador, nunca llamando APIs externas desde el navegador.

**Rama:** `fase-2-logistica` · **Depende de:** Fase 0 (y Fase 1 para el rol `coordinador`)

## Esquema (`supabase/migrations/0003_logistica.sql`)

- `rutas_transporte(id, origen, destino, empresa, modo modo_transporte, terminal, duracion_min, precio_desde_cop,
  notas, fuente, verificado_en date, activa)`. `origen`/`destino` = slug de municipio o `bogota`.
  Enum `modo_transporte`: `bus`, `colectivo`, `taxi`, `carro_propio`.
- `salidas(id, ruta_id, hora time, dias_semana int[])`.
- `tramos(origen text, destino text, distancia_m int, duracion_s int, fuente text default 'osrm', calculado_en,
  pk(origen, destino))`. `origen`/`destino` = id de lugar o `mun:<slug>` para centros de municipio.
- `alertas_via(id, municipio null, tramo_desde null, tramo_hasta null, tipo tipo_alerta, mensaje, desde timestamptz,
  hasta timestamptz null, fuente, creada_por)`. Enum `tipo_alerta`: `cierre`, `paso_restringido`, `derrumbe`, `obra`, `otro`.
- `clima(municipio, fecha date, prob_lluvia_max int, temp_min, temp_max, actualizado, pk(municipio, fecha))`.
- RLS: lectura pública (alertas solo vigentes); escritura `coordinador` o `service_role`.
- Pruebas pgTAP: anon lee rutas y alertas vigentes, no ve alertas vencidas, no puede escribir.

## Datos

- [ ] Si la Fase 4 aún no agregó Guateque, insertarlo en `municipios` (centro y caja, sin lugares) para que las
  rutas tengan destino; el scraper lo completará después.
- [ ] `supabase/seed.sql` con el **esqueleto** de rutas Bogotá (Terminal Salitre) → Guateque para Flota Valle de
  Tenza y Flota La Macarena con `precio_desde_cop`, `duracion_min` y `salidas` en **null** y `verificado_en` null:
  la app los muestra como «por confirmar» hasta que el coordinador los llene. No inventar horarios ni precios.
- [ ] `scripts/tramos-osrm.ts`: calcula con el servidor demo de OSRM (`router.project-osrm.org/table/v1/driving`)
  la matriz entre los centros de los municipios y entre lugares a menos de 15 km en línea recta. Lotes de máximo 50
  coordenadas, 1 petición por segundo, `User-Agent` propio (`ValleDirecto/1.0 (+repo)`). Solo recalcula pares nuevos.
  Se corre a mano o por `workflow_dispatch` cuando cambia el catálogo. Guarda con `service_role`.
- [ ] `.github/workflows/clima.yml`: cada 3 horas consulta Open-Meteo una vez **por municipio** (14 llamadas máx.) con
  `daily=precipitation_probability_max,temperature_2m_min,temperature_2m_max&timezone=America/Bogota&forecast_days=7`
  y hace upsert en `clima`. Muy por debajo del límite gratuito de 10.000 llamadas al día.

## Front

- [ ] **Página `/como-llegar`** (`src/pages/ComoLlegar.tsx`): enlace desde la portada, el itinerario y
  el menú de escritorio; en la navegación inferior de celular solo si cabe sin bajar de 44 px por botón: desde Bogotá (empresa,
  terminal, duración, precio desde, salidas, «verificado el …» o «por confirmar»), en carro propio (tiempo desde
  el tramo `bogota → mun:guateque` si existe) y entre municipios (tabla de tiempos desde `tramos`).
- [ ] **Avisos en el mapa:** capa con las alertas vigentes (icono por tipo) en `MapaLugares.tsx`; las que tienen
  municipio se pintan en su centro.
- [ ] **Itinerario:**
  - Nueva pregunta «¿Cómo te mueves?» (carro propio / transporte público) en el ItinerarioProvider.
  - Paso 0 del día 1: «Cómo llegar» con la ruta que aplica.
  - Distancias entre paradas desde `tramos` (minutos por carretera); si no hay tramo, la línea recta actual con la
    etiqueta «aprox.». Quitar la palabra «km en línea recta» donde ya haya tiempo real.
  - Aviso por día si hay alerta vigente en el municipio o `prob_lluvia_max ≥ 70 %` en días con caminatas o miradores.
- [ ] **Panel del coordinador (mínimo):** `/coordinador` con formularios para rutas, salidas y alertas. Solo rol
  `coordinador` (la ruta redirige si no lo es). La Fase 3 lo amplía con métricas.
- [ ] **Atribución** visible: «Rutas: © OSRM, datos © colaboradores de OpenStreetMap (ODbL)» y «Clima: Open-Meteo (CC-BY 4.0)».

## Prueba de cierre

1. Con `tramos` calculados, el itinerario muestra «a 18 min por carretera» (o el valor que salga) entre paradas.
2. Una alerta creada en `/coordinador` aparece en el mapa y en el día correspondiente del itinerario sin desplegar.
3. La tabla `clima` tiene 7 días por municipio y el workflow corrió al menos una vez.
4. Ninguna petición a `router.project-osrm.org` ni a `api.open-meteo.com` sale del navegador (revisar pestaña Red).

## Prompt para Claude Code

```
Lee CLAUDE.md y docs/plan/fase-2-logistica.md. Ejecuta la Fase 2 en la rama fase-2-logistica.
En modo plan muéstrame el SQL de 0003_logistica.sql y cómo vas a respetar los límites de OSRM y Open-Meteo.
Reglas: no inventes horarios ni precios de buses (déjalos en null y muestra «por confirmar»); OSRM y Open-Meteo
solo desde scripts o GitHub Actions; RLS y pgTAP para cada tabla; la página Cómo llegar se prueba a 375 px.
Al terminar corre build, test y supabase test db, ejecuta tramos-osrm.ts contra la base local y dime cuántos
pares calculó y cuánto tardó.
```
