// Service worker (injectManifest). Precache del shell; caché en tiempo de ejecución de fotos y del catálogo público.
// Nunca se cachean /auth/, /rpc/ ni las tablas con datos personales o de sesión (reservas, negocios, perfiles).
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'

const CACHE_RUTA = 'valle-directo-ruta'   // lo escribe «Guardar para ver sin señal» (src/state/offline.ts)

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()

// registerType 'prompt': la versión nueva espera hasta que la persona pulse «Actualizar».
self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting() })

// Navegaciones sin precache (fichas, municipios, etc.) caen al shell; la API y los archivos estáticos no.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
  denylist: [/^\/api\//, /^\/(sitemap\.xml|robots\.txt|manifest\.webmanifest|sw\.js)$/],
}))

registerRoute(({ url, request }) => request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith('/fotos/'),
  new CacheFirst({ cacheName: 'vd-fotos', plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 200 })] }))

// Catálogo público de Supabase: por pathname, sin depender del host. Solo peticiones anónimas (Authorization = la llave pública):
// con sesión iniciada la respuesta podría variar por RLS y no se comparte.
const CATALOGO = /^\/rest\/v1\/(municipios|lugares|rutas_transporte|salidas|clima|alertas_via|eventos|ajustes)\/?$/
registerRoute(({ url, request }) => {
  if (request.method !== 'GET' || !CATALOGO.test(url.pathname)) return false
  const auth = request.headers.get('authorization'), llave = request.headers.get('apikey')
  return !auth || (!!llave && auth === `Bearer ${llave}`)
}, new StaleWhileRevalidate({ cacheName: 'vd-catalogo', plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 14 })] }))

// Teselas de OSM: solo se sirven las ya guardadas con «Guardar para ver sin señal». Si no están, pasa a la red tal cual
// y NO se guarda nada (política de teselas de OSM: sin descarga masiva ni caché propia del uso normal).
registerRoute(({ url, request }) => request.method === 'GET' && url.hostname === 'tile.openstreetmap.org', async ({ request }) => {
  const cache = await caches.open(CACHE_RUTA)
  return (await cache.match(request.url)) ?? fetch(request)
})
