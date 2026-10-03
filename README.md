# Valle Directo

Web app para armar un itinerario al Valle de Tenza (Boyacá). Vite + React + TypeScript; se publica en GitHub Pages.

## Desarrollo

```
npm install
npm run dev       # servidor local
npm run build     # compila a dist/
npm run preview   # sirve dist/ para revisar
```

## Dónde cambiar cosas

- **Contacto, horario y redes:** `src/config.ts` (reemplaza los valores `[ENTRE CORCHETES]`).
- **Planes, lugares y hospedajes:** `src/data/planes.ts`.
- **Respuestas del chatbot:** `src/data/respuestas.ts`.
- **Colores, tipografía y espacios:** vienen del sistema de marca (`scripts/tokens.json`). Tras cambiarlos: `node scripts/gen-tokens.mjs`.

## Chatbot (Auren AI)

El chat llama a `/api/chat` (`api/chat.ts`, función de Vercel), que reenvía la pregunta al endpoint de demo de Auren AI. Auren es quien llama a OpenAI; este proyecto no usa ninguna llave de OpenAI.

| Variable | Qué es |
| --- | --- |
| `AUREN_DEMO_TOKEN` | Token de la demo de Auren con el conocimiento del Valle (obligatoria) |
| `AUREN_BASE_URL` | Opcional; por defecto `https://app.getaurenai.com` |

- **Desarrollo:** copia `.env.example` a `.env.local`, completa el token y corre `npm run dev` (sirve `/api/chat` con la misma función).
- **Vercel:** *Settings → Environment Variables*.
- **Sin backend** (por ejemplo en GitHub Pages) o si Auren falla, el chat responde con las reglas locales de `src/data/respuestas.ts`.
- Límites: 500 caracteres por mensaje y 20 mensajes cada 10 minutos por IP (de mejor esfuerzo).
- El contenido que debe conocer el bot está en [docs/auren-conocimiento-valle.md](docs/auren-conocimiento-valle.md).

## Publicación

Cada push a `main` ejecuta `.github/workflows/deploy.yml` y publica en GitHub Pages. En el repositorio: *Settings → Pages → Source: GitHub Actions*. Las rutas usan hash (`/#/mapa`) porque GitHub Pages no tiene fallback para SPA.

`mvp/` conserva el HTML original como referencia.
