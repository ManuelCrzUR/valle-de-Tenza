# Fase 3 — Itinerarios mejores, compartir y panel de operación

**Objetivo:** que el itinerario resuelva solo los problemas que hoy le muestra al viajero (saltos largos, comida en
otro municipio, hospedaje sin cupo), que se pueda compartir con el grupo, y que prestadores y coordinador vean la
demanda con datos.

**Rama:** `fase-3-itinerarios-panel` · **Depende de:** Fases 1 y 2

## Generador de itinerarios (`src/data/generarPlan.ts`)

- [x] Función de costo entre lugares = `tramos.duracion_s` si existe; si no, la distancia en línea recta por un
  factor `FACTOR_RUTA` calibrado con los tramos ya calculados (mediana de distancia por carretera / línea recta;
  documentar el valor obtenido en el PR), marcada como aproximada. Exponerla como `costoEntre(a, b)` inyectable para las pruebas.
- [x] **Comida:** buscar primero en el municipio de la última parada; si no hay, el restaurante con menor
  `costoEntre`. Nunca en otro municipio si existe uno en el mismo.
- [x] **Hospedaje:** preferir negocios con cupo libre para la fecha y personas elegidas (Fase 1); si el más cercano no
  tiene cupo, ofrecer el siguiente y decirlo («Hostal X no tiene cupo ese día; te sugerimos Y»).
- [x] **Paradas:** ranking que premia `acceso` descrito, fotos, negocio verificado y categorías con nombre propio;
  las cimas de OSM sin `acceso` quedan como «opcional» al final del día, no como parada principal.
- [x] **Transporte público:** si el viajero no tiene carro, limitar cada día a su municipio base más los vecinos con
  ruta en `rutas_transporte`.
- [x] Mantener el determinismo por semilla y que todo funcione sin Supabase (con JSON y línea recta).
- [x] `generarPlan.test.ts`: con una matriz de tramos falsa, la comida queda en el mismo municipio; sin cupo, el
  hospedaje cambia; sin carro, no hay paradas fuera de los municipios conectados.

## UX del itinerario

- [x] **Sin bloque de malas noticias arriba:** quitar la lista de avisos «queda lejos» del encabezado del resultado.
  Si un salto sigue siendo largo, se muestra dentro de esa parada («35 min por carretera desde la anterior»).
- [x] Resumen arriba: municipio base, días, fecha, personas, tiempo total en carretera y si el hospedaje tiene cupo.
- [x] Al elegir plan en celular, desplazar suavemente al resultado.
- [x] «Generar otro» → «Probar otra ruta».
- [x] **Compartir:** tabla `itinerarios_compartidos(id text pk de 8 caracteres, eleccion jsonb, creado, vistas int)`
  con inserción anónima limitada por función (máximo 20 por IP/día vía Edge Function o RPC con contador) y lectura
  pública por id. Ruta `/i/:id` que reconstruye el itinerario. Botones «Compartir por WhatsApp» (`wa.me/?text=` con el
  enlace) y «Copiar enlace». Usar `navigator.share` cuando exista.
- [x] **Demanda anónima:** cada itinerario generado inserta en `demanda(plan, municipio, dias, personas, fecha_viaje,
  transporte, creado)` sin datos personales. Insertar con *debounce* (solo cuando el resultado se muestra 3 s).

## Panel de operación

- [x] Vistas SQL (`supabase/migrations/0004_metricas.sql`), con `security_invoker`:
  - `ocupacion_diaria(negocio_id, fecha, cupo, ocupado, libre)` para los próximos 30 días.
  - `demanda_semanal(municipio, plan, semana, itinerarios, personas)`.
  - `brecha_hospedaje(municipio, fecha, personas_demandadas, cupo_disponible)`.
  - `prestadores_inactivos` (sin actualizar cupo en 7 días).
- [x] **Prestador** (`PrestadorPanel.tsx`): tarjetas de solicitudes por estado, ocupación de 30 días (barras por día),
  tasa de confirmación y tiempo medio de respuesta.
- [x] **Coordinador** (`/coordinador`, ampliado de la Fase 2): demanda por municipio y semana, planes más pedidos,
  brecha de hospedaje, prestadores inactivos con botón para escribirles por WhatsApp, exportar cada tabla a CSV.
- [x] Gráficos con SVG propio o una librería ligera ya justificada en el PR; nada de librerías de dashboards pesadas.

## Prueba de cierre

1. Con los datos sembrados, 10 itinerarios seguidos por plan y municipio: ninguno pone comida en otro municipio si
   existe una en el mismo (prueba automática).
2. Un enlace `/i/<id>` abierto en otro navegador muestra el mismo itinerario.
3. El coordinador ve la demanda de los itinerarios generados en la prueba y la exporta a CSV.

## Prompt para Claude Code

```
Lee CLAUDE.md y docs/plan/fase-3-itinerarios-panel.md. Ejecuta la Fase 3 en la rama fase-3-itinerarios-panel.
En modo plan muéstrame primero los cambios a generarPlan.ts (función de costo, reglas de comida, hospedaje y
ranking) con las pruebas que los cubren, y el SQL de 0004_metricas.sql. Espera mi aprobación.
Reglas: el generador sigue siendo determinista y funciona sin Supabase; la tabla demanda no guarda datos personales;
los enlaces compartidos tienen límite de creación. Prueba el itinerario y los paneles a 375 px.
Al terminar corre build, test, supabase test db y Playwright, y marca el checklist.
```

## Estado del cierre (local)

- [x] 1. Prueba automática (vitest): 3 planes × 14 municipios × 10 semillas; ninguna comida en otro municipio si existe una en el de la última parada.
- [x] 2. `tests/e2e/compartir.spec.ts`: un enlace `/i/<id>` abierto en otro navegador muestra el mismo itinerario.
- [x] 3. El coordinador ve la demanda registrada y la exporta a CSV (verificado con Playwright y datos sembrados).

Valores para el PR: `FACTOR_RUTA` = 1,78 (mediana carretera / línea recta en 118.972 tramos lugar↔lugar de los 14
municipios con más de 300 m; con solo los 7 iniciales daba 2,23) y velocidad media 9,48 m/s (≈ 34 km/h).
La migración es `0005_metricas.sql` (no 0004, que ya usó la Fase 4).

Notas: el límite de 20 enlaces por IP y día usa `x-forwarded-for` (un cliente podría falsearlo; es un freno, no un
control). Quien abre un enlace compartido también registra demanda una vez (puede duplicar la del emisor). La ruta
puede cambiar una vez cuando llegan los tiempos reales por carretera.
