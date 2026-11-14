# Asistente flotante con IA

Responde preguntas cortas sobre el viaje al Valle de Tenza (7 municipios) y propone hasta 3 links internos del sitio.

## Endpoint

`POST /api/agente` con `{ "pregunta": string, "pagina"?: string, "gustos"?: Gustos }`. `gustos` es lo que el navegador acumuló; el servidor lo normaliza (`normalizarGustos`) y descarta lo que no cumpla el formato.

| Estado | Cuerpo |
| --- | --- |
| 200 | `{ modo: 'openai', texto, links: [{ etiqueta, ruta, ancla }], gustos, recomendaciones }` (máx. 3 links). `gustos`: los previos fusionados con lo detectado en este mensaje. `recomendaciones`: 0 a 4 de `{ id, nombre, municipio (slug), categoria, razones, ruta: '/lugares/<id>' }` |
| 400 | `solicitud_invalida` (no es JSON, pregunta vacía o no es texto) o `mensaje_largo` (más de 500 caracteres) |
| 429 | `limite`: 30 preguntas cada 10 minutos por IP |
| 503 | `no_configurado`: falta `OPENAI_API_KEY` (no se llama a OpenAI). El cuerpo trae además `gustos` y `recomendaciones` calculados localmente (`leerGustosLocal` + `recomendar`) |
| 502 | `openai_no_disponible`: error, timeout (20 s), JSON inválido o texto vacío; `detalle` corto (`http_500`, `json`, `vacio`, `timeout`). Igual que el 503, incluye `gustos` y `recomendaciones` locales |

## Gustos y recomendaciones

El modelo devuelve en `gustos_detectados` lo que la persona dijo en ese mensaje y puede llamar a la herramienta `recomendar_lugares` (`{ gustos, municipio }`), que ejecuta el servidor con `recomendar` sobre el catálogo y las fichas publicadas. Al modelo solo le vuelven `id, nombre, municipio, categoria, razones`. Las recomendaciones finales se filtran a ids que existan en el catálogo; si el modelo no llamó la herramienta pero hay gustos y la pregunta pide recomendaciones, se calculan igual. Máximo 3 rondas, `max_output_tokens` 900.

`POST /api/itinerario` también acepta `gustos`: en modo catálogo reordena candidatos por puntaje (determinista) y en modo OpenAI añade los gustos al prompt. `validarPropuesta` sigue siendo la última palabra.

## Variables

Solo las existentes: `OPENAI_API_KEY` y, opcionalmente, `OPENAI_ITINERARY_MODEL`. Los negocios publicados salen de Supabase en cada pregunta (`listarPublicadas`), sin caché. Un borrador no entra. Si esa lectura falla, la respuesta local lo dice y sigue con el catálogo fijo.

## Respaldo local

Ante 503, 502 o error de red, el navegador usa `responderLocal` (`src/data/agente.ts`), que responde por reglas con el catálogo. Si el modelo responde pero ningún link es válido, se usan los links de `responderLocal` (el texto sigue siendo del modelo).

## Privacidad

La pregunta no se guarda ni se registra. Antes de enviarla se quitan correos y teléfonos (`sinDatosPersonales`). El modelo solo ve ids, nombres, municipio y categoría del catálogo.

Los gustos no se guardan en el servidor: viven en el navegador, viajan en cada petición y no se registran. Solo se envían al modelo como etiquetas (intereses, ritmo, presupuesto, etc.), sin datos personales.

## Lista blanca de links

Cada link pasa por `validarLink`: solo `/`, `/plan`, `/lugares`, `/lugares/<id existente>`, `/mapa` y `/galeria`, con parámetros y anclas permitidos. Se deduplican y se recortan a 3. El texto se recorta a 600 caracteres.

## Probar

```
curl -s -X POST http://localhost:5174/api/agente \
  -H 'content-type: application/json' \
  -d '{"pregunta":"¿Dónde puedo dormir en Tenza?","pagina":"/mapa"}'
```
