# Fase 4 — Cobertura, contenido y chat con datos reales

**Objetivo:** cubrir el Valle completo (hoy faltan 7 de los 14 municipios de Boyacá, incluidos Guateque y Garagoa,
que son los nodos de transporte y servicios), quitar los textos de relleno y hacer que el chat responda con cupos,
transporte y avisos reales.

**Rama:** `fase-4-cobertura-contenido` · **Depende de:** Fases 0 y 1 (puede ir en paralelo con la 2)

## Cobertura

- [x] `scraper/municipios.py`: agregar Guateque y Garagoa primero; después Chinavita, Macanal, Pachavita, Santa María
  y San Luis de Gaceno (según la decisión abierta). Centro y caja de cada uno.
- [x] Correr el scraper con `--descargar`, revisar `scraper/salida/reporte.md` y cargar con `scripts/cargar-lugares.ts`.
  Los lugares sin ubicación honesta siguen la regla existente: aparecen en la lista, no en el mapa.
- [x] Revisar a mano los nombres raros que vengan de OSM (como «antiguo jardin» o «PARQUE PRINCIPAL») con un paso de
  normalización: mayúsculas de título y descarte de duplicados por nombre + municipio.
- [x] Actualizar los textos «los siete municipios» / «7 municipios» en `Mapa.tsx`, `Lugares.tsx` y
  `components/mapa/LeyendaMapa.tsx` para que salgan del número real de municipios activos.

## Contenido

- [x] Llenar el campo `acceso` de `lugares` (creado en la Fase 0): cómo se llega, si es propiedad privada, si requiere guía, dificultad. Formulario
  en `/coordinador` para llenarlo; mostrarlo en `LugarDetalle.tsx` y usarlo en el ranking de la Fase 3.
- [x] Tabla `ajustes(clave text pk, valor jsonb)` con lectura pública: contacto, horario de embajadores, redes.
  `src/config.ts` lee de ahí con los valores actuales como respaldo, y **ninguna** cadena `[ENTRE CORCHETES]` se
  muestra: si falta el dato, se oculta la línea.
- [x] Tabla `embajadores(id, nombre, municipio, whatsapp, horario, activo)`; la página de chat muestra quiénes están
  disponibles ahora según su horario, con botón de WhatsApp.
- [x] Calendario de `eventos` (fiestas, mercados) por municipio, editable por el coordinador, visible en la portada
  («Este fin de semana en el Valle») y como aviso en el itinerario si coincide con la fecha.

## Chat

- [x] `src/data/asistente.ts`: las respuestas de hospedaje y reservas usan `cupo_libre` real; nuevas intenciones
  «cómo llego», «cuánto me demoro de X a Y», «hay paro / cómo está la vía», «va a llover», «qué hay este fin de semana».
- [x] Mantener `usarAuren: false` por defecto. Si se activa, `api/chat.ts` envía a Auren un contexto mínimo con
  cupos y avisos del día (sin datos personales), y actualizar `docs/auren-conocimiento-valle.md` con los 14 municipios.

## Prueba de cierre

1. Guateque y Garagoa aparecen en el mapa, en el selector de municipio y en el itinerario.
2. `grep -rn "\[CONTACTO\]\|\[HORARIO\]\|\[REDES" src` solo encuentra el respaldo en `config.ts`, y el sitio en
   producción no muestra corchetes.
3. El chat responde «¿cómo llego desde Bogotá?» con la ruta de la tabla y su fecha de verificación.

## Prompt para Claude Code

```
Lee CLAUDE.md y docs/plan/fase-4-cobertura-contenido.md. Ejecuta la Fase 4 en la rama fase-4-cobertura-contenido.
En modo plan dime qué municipios vas a agregar, qué cambia en el scraper y el SQL de ajustes, embajadores y eventos.
Reglas: respeta la regla de precisión de ubicación del scraper y su cortesía (1 petición por segundo, caché);
ningún placeholder visible en producción; el chat no inventa datos: si no hay cupo o ruta verificada, lo dice.
Al terminar corre el scraper sin red (cache) y con red si te lo permito, build, test y supabase test db.
```

## Estado del cierre (local)

- [x] 1. Guateque y Garagoa en el mapa (selector «Los 14 municipios»), en el selector del itinerario y con itinerario
  propio (Garagoa: 8 paradas con minutos por carretera). 561 lugares, 513 en el mapa; 131.990 tramos; clima de 14 municipios.
- [x] 2. `grep -rn "\[CONTACTO\]\|\[HORARIO\]\|\[REDES" src` solo encuentra el respaldo en `config.ts`; `useAjustes()`
  oculta cualquier línea sin dato. **Pendiente del usuario:** cargar contacto, horario y redes reales en `/coordinador`.
- [x] 3. El chat responde «¿cómo llego desde Bogotá?» con las rutas de la tabla y marca «por confirmar» lo no verificado.

Decisiones: se agregaron los 7 municipios de una vez (Pachavita es DANE 15511; en OSM es «San Luís de Gaceno»).
`usarAuren` sigue en `false`; `api/chat.ts` aún no reenvía el `contexto` que arma el front (pendiente si se activa).
