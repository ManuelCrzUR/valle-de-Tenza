# Asistente flotante con IA

Responde preguntas cortas sobre el viaje al Valle de Tenza (7 municipios) y propone hasta 3 links internos del sitio.

## Endpoint

`POST /api/agente` con `{ "pregunta": string, "pagina"?: string }`.

| Estado | Cuerpo |
| --- | --- |
| 200 | `{ modo: 'openai', texto, links: [{ etiqueta, ruta, ancla }] }` (máx. 3 links) |
| 400 | `solicitud_invalida` (no es JSON, pregunta vacía o no es texto) o `mensaje_largo` (más de 500 caracteres) |
| 429 | `limite`: 30 preguntas cada 10 minutos por IP |
| 503 | `no_configurado`: falta `OPENAI_API_KEY` (no se llama a OpenAI) |
| 502 | `openai_no_disponible`: error, timeout (20 s), JSON inválido o texto vacío; `detalle` corto (`http_500`, `json`, `vacio`, `timeout`) |

## Variables

Solo las existentes: `OPENAI_API_KEY` y, opcionalmente, `OPENAI_ITINERARY_MODEL`. Los negocios publicados salen de Supabase en cada pregunta (`listarPublicadas`), sin caché. Un borrador no entra. Si esa lectura falla, la respuesta local lo dice y sigue con el catálogo fijo.

## Respaldo local

Ante 503, 502 o error de red, el navegador usa `responderLocal` (`src/data/agente.ts`), que responde por reglas con el catálogo. Si el modelo responde pero ningún link es válido, se usan los links de `responderLocal` (el texto sigue siendo del modelo).

## Privacidad

La pregunta no se guarda ni se registra. Antes de enviarla se quitan correos y teléfonos (`sinDatosPersonales`). El modelo solo ve ids, nombres, municipio y categoría del catálogo.

## Lista blanca de links

Cada link pasa por `validarLink`: solo `/`, `/plan`, `/lugares`, `/lugares/<id existente>`, `/mapa` y `/galeria`, con parámetros y anclas permitidos. Se deduplican y se recortan a 3. El texto se recorta a 600 caracteres.

## Probar

```
curl -s -X POST http://localhost:5174/api/agente \
  -H 'content-type: application/json' \
  -d '{"pregunta":"¿Dónde puedo dormir en Tenza?","pagina":"/mapa"}'
```
