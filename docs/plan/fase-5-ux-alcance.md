# Fase 5 — UX y alcance: offline, SEO, inglés, analítica y confianza

**Objetivo:** que la app sirva donde más se necesita (sin señal en veredas y miradores), que la encuentren en Google
sin pagar anuncios y que los viajeros confíen en lo que ven.

**Rama:** `fase-5-ux-alcance` · **Depende de:** Fases 1 a 4

## Offline (PWA)

- [ ] `npm i -D vite-plugin-pwa`; registrar *service worker* con `registerType: 'prompt'` (aviso «Hay una versión
  nueva») usando el `manifest.webmanifest` existente.
- [ ] Precache del *shell* de la app y las fuentes. Caché en tiempo de ejecución: fotos (`CacheFirst`, máx. 200),
  lecturas de Supabase de catálogo (`StaleWhileRevalidate`).
- [ ] Botón «Guardar para ver sin señal» en el itinerario: guarda el itinerario, sus fichas y las teselas del mapa de la
  zona de la ruta en los zooms 12–15 (respetar la política de teselas de OSM: solo la caja de la ruta, nunca descarga
  masiva; si el número de teselas pasa de unas 300, avisar y no descargar).
- [ ] Indicador «Sin conexión — viendo tu ruta guardada» y formularios de reserva deshabilitados con explicación.

## SEO

- [ ] Cambiar `HashRouter` por `BrowserRouter` en `src/main.tsx`; `base: '/'` en `vite.config.ts`; `vercel.json` con
  `rewrites` de todo a `index.html` (excepto `/api`, `/assets`, `/fotos`, `/fonts`, `/logos`, `/app`).
  Redirigir los enlaces viejos `/#/ruta` a `/ruta` en el arranque para no romper enlaces compartidos.
- [ ] Ajustar `manifest.webmanifest` (`start_url` y `scope` a `/`).
- [ ] Prerender en el build (`scripts/prerender.ts`) de una página HTML estática por municipio y por lugar visible
  con `<title>`, `<meta name="description">`, Open Graph y JSON-LD (`TouristAttraction`, `LodgingBusiness`,
  `Restaurant`). `sitemap.xml` y `robots.txt` generados en el mismo paso.
- [ ] URLs legibles: `/lugares/:id` ya existe; agregar `/municipios/:slug` con lo que hay, cómo llegar y eventos.

## Inglés

- [ ] Diccionario simple `src/i18n/{es,en}.ts` y hook `useT()`; selector ES/EN en el pie. Sin librerías pesadas.
  Nombres propios de lugares no se traducen. El contenido de prestadores queda en español.

## Analítica y calidad

- [ ] Vercel Web Analytics (`@vercel/analytics`, gratis hasta 50.000 eventos al mes) con eventos de embudo:
  plan elegido → itinerario visto → reservar abierto → reserva enviada → compartido. Ningún dato personal en eventos.
- [ ] Lighthouse móvil en CI (`@lhci/cli`) con umbrales: rendimiento ≥ 85, accesibilidad ≥ 95.

## Confianza y conversión

- [ ] **Reseñas post-viaje:** tabla `resenas(reserva_id unique, calificacion 1–5, comentario, creada, visible)`.
  Un día después de la fecha de la reserva confirmada, el prestador ve un botón «Pedir reseña por WhatsApp» con
  enlace `/resena/<codigo>`. Solo reservas confirmadas pueden reseñar; moderación por el coordinador.
- [ ] **Presupuesto estimado** en el itinerario: transporte (`precio_desde_cop` de la ruta) + hospedaje
  (`precio_desde_cop` × noches × personas) + comida (solo si los negocios lo publican). Si falta un precio, se muestra
  el rango parcial y «sin precio publicado», nunca un promedio inventado.
- [ ] **Mapa en celular:** a menos de 768 px, mapa a pantalla completa bajo el encabezado y la lista como hoja
  deslizable desde abajo; el texto introductorio se colapsa.
- [ ] **Tarjetas de Lugares:** foto si existe, una línea de «por qué ir» o `acceso`, municipio, distancia o tiempo desde
  el municipio base, y etiqueta de cupo si es reservable. Quitar el tipo repetido («Atracción / Atracción»).
  Orden por defecto: verificados y con información primero.

## Prueba de cierre

1. Con la red apagada en DevTools, una ruta guardada abre completa con su mapa.
2. `https://valle-de-tenza.vercel.app/lugares/<id>` devuelve HTML con título y descripción del lugar sin ejecutar
   JavaScript (`curl` lo muestra), y el `sitemap.xml` lista todos los lugares visibles.
3. Los enlaces viejos con `/#/` siguen funcionando.
4. Lighthouse móvil cumple los umbrales en CI.

## Prompt para Claude Code

```
Lee CLAUDE.md y docs/plan/fase-5-ux-alcance.md. Ejecuta la Fase 5 en la rama fase-5-ux-alcance.
Trabájala en este orden y con un commit por bloque: SEO y BrowserRouter, PWA offline, mapa y tarjetas en móvil,
presupuesto, reseñas, inglés, analítica y Lighthouse. En modo plan dime primero cómo vas a migrar de HashRouter
sin romper enlaces viejos y cuántas teselas descargaría la ruta más grande.
Reglas: respeta la política de teselas de OpenStreetMap; ningún dato personal en analítica; nada de precios
inventados en el presupuesto. Al terminar corre build, test, Playwright y Lighthouse, y marca el checklist.
```
