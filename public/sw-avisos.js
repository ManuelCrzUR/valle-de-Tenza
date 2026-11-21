// Service worker solo para avisos push. Sin caché ni interceptación de peticiones.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let datos = {}
  try {
    datos = event.data ? event.data.json() : {}
  } catch {
    datos = {}
  }
  const titulo = typeof datos.titulo === 'string' && datos.titulo ? datos.titulo : 'Nueva solicitud'
  const cuerpo = typeof datos.cuerpo === 'string' && datos.cuerpo ? datos.cuerpo : 'Tienes una solicitud nueva en tu panel.'
  const url = typeof datos.url === 'string' ? datos.url : '/'
  event.waitUntil(self.registration.showNotification(titulo, {
    body: cuerpo,
    icon: '/app/icon-192.png',
    data: { url },
    tag: 'solicitud',
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  let destino = '/'
  const pedida = event.notification.data && event.notification.data.url
  if (typeof pedida === 'string' && pedida.startsWith('/') && !pedida.startsWith('//') && !pedida.startsWith('/\\')) {
    destino = pedida
  }
  event.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of abiertas) {
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) return c.focus()
    }
    return self.clients.openWindow(destino)
  })())
})
