// Prerender posterior a `vite build`: una página HTML por lugar y por municipio, con título, descripción,
// Open Graph y JSON-LD visibles sin JavaScript, más sitemap.xml y robots.txt.
// Uso: node scripts/prerender.ts   (lo ejecuta `npm run build`). Dominio: SITIO_URL.
// Solo datos públicos del JSON: nunca teléfonos ni correos (ver `limpiar`).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FOTOS, FOTO_MUNICIPIO, fotoDeLugar } from '../src/data/fotos.ts'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(raiz, 'dist')
const SITIO = (process.env.SITIO_URL ?? 'https://valle-de-tenza.vercel.app').replace(/\/+$/, '')
const datos = JSON.parse(readFileSync(join(raiz, 'src/data/lugares.json'), 'utf8'))
const plantilla = readFileSync(join(dist, 'index.html'), 'utf8')

interface L { id: string; nombre: string; categoria: string; subtipo?: string; municipio: string; lat: number | null; lon: number | null; precision: string | null; direccion?: string; vereda?: string; plan?: string | null; esServicio?: boolean; extra?: { descripcion?: string } }
interface M { slug: string; nombre: string }
const lugares: L[] = datos.lugares
const municipios: M[] = datos.municipios
const nombreMun = Object.fromEntries(municipios.map((m) => [m.slug, m.nombre])) as Record<string, string>

const SINGULAR: Record<string, string> = {
  alojamiento: 'Alojamiento', restaurante: 'Restaurante o café', atraccion: 'Atracción', monumento: 'Monumento', naturaleza: 'Naturaleza',
  operador: 'Guía o agencia', comercio: 'Tienda', cajero: 'Cajero o banco', gasolinera: 'Gasolinera', salud: 'Salud', servicio: 'Servicio',
}
const PLURAL: Record<string, string> = {
  alojamiento: 'alojamientos', restaurante: 'restaurantes y cafés', atraccion: 'atracciones y miradores', monumento: 'monumentos e iglesias', naturaleza: 'parques, cerros y senderos',
  operador: 'guías y agencias', comercio: 'tiendas', cajero: 'cajeros y bancos', gasolinera: 'gasolineras', salud: 'servicios de salud', servicio: 'alcaldía y servicios',
}
const SERVICIOS = new Set(['comercio', 'cajero', 'gasolinera', 'salud', 'servicio'])

// ---------- Utilidades ----------
const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const json = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
/** Quita correos, teléfonos y enlaces de wa.me de cualquier texto que vaya a la página. */
const limpiar = (s: string) => s
  .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '')
  .replace(/https?:\/\/(wa\.me|api\.whatsapp\.com)\S*/gi, '')
  .replace(/\+?\d[\d\s().-]{6,}\d/g, '')
  .replace(/\s{2,}/g, ' ').trim()
const recortar = (s: string, max = 158) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`)
const url = (ruta: string) => `${SITIO}${ruta}`

// ---------- Contenido por lugar ----------
function descripcionLugar(l: L): string {
  const mun = nombreMun[l.municipio] ?? l.municipio
  const tipo = SINGULAR[l.categoria] ?? l.categoria
  const partes = [`${tipo} en ${mun}, Valle de Tenza (Boyacá).`]
  if (l.extra?.descripcion) partes.push(limpiar(l.extra.descripcion))
  else if (l.vereda) partes.push(`Vereda ${limpiar(l.vereda)}.`)
  else if (l.direccion) partes.push(`${limpiar(l.direccion)}.`)
  partes.push('Ficha en Valle Directo, guía del Valle de Tenza.')
  return recortar(partes.join(' ').replace(/\.\./g, '.'))
}
function imagenDe(foto: number | undefined): string | undefined {
  return foto ? url(`/${FOTOS[foto as keyof typeof FOTOS].archivo}`) : undefined
}
function jsonLdLugar(l: L, desc: string, pagina: string, imagen?: string) {
  const tipo = l.categoria === 'alojamiento' ? 'LodgingBusiness' : l.categoria === 'restaurante' ? 'Restaurant' : SERVICIOS.has(l.categoria) ? 'Place' : 'TouristAttraction'
  const o: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': tipo, name: l.nombre, description: desc, url: pagina,
    address: { '@type': 'PostalAddress', addressLocality: nombreMun[l.municipio] ?? l.municipio, addressRegion: 'Boyacá', addressCountry: 'CO', ...(l.direccion ? { streetAddress: limpiar(l.direccion) } : {}) },
  }
  if (imagen) o.image = imagen
  // Coordenadas solo cuando son exactas: las aproximadas (cabecera, vereda) no son la ubicación del lugar.
  if (l.precision === 'exacta' && l.lat !== null && l.lon !== null) o.geo = { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lon }
  return o
}
const destacados = (ls: L[]) => ls.filter((l) => !SERVICIOS.has(l.categoria))
  .sort((a, b) => ((b.extra?.descripcion ? 2 : 0) + (b.plan ? 1 : 0)) - ((a.extra?.descripcion ? 2 : 0) + (a.plan ? 1 : 0)) || a.nombre.localeCompare(b.nombre, 'es'))

// ---------- Inyección en la plantilla ----------
interface Pagina { ruta: string; titulo: string; desc: string; imagen?: string; jsonld: unknown; cuerpo: string }
function pagina(p: Pagina): string {
  const canon = url(p.ruta)
  const titulo = `${p.titulo} · Valle Directo`
  const remplazar = (src: string, re: RegExp, nuevo: string) => { if (!re.test(src)) throw new Error(`La plantilla no tiene ${re}`); return src.replace(re, () => nuevo) }
  let out = plantilla
  out = remplazar(out, /<title>[\s\S]*?<\/title>/, `<title>${html(titulo)}</title>`)
  out = remplazar(out, /<meta name="description"[^>]*>/, `<meta name="description" content="${html(p.desc)}" />`)
  out = remplazar(out, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${html(titulo)}" />`)
  out = remplazar(out, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${html(p.desc)}" />`)
  const extra = [
    `<link rel="canonical" href="${html(canon)}" />`,
    `<meta property="og:url" content="${html(canon)}" />`,
    `<meta property="og:site_name" content="Valle Directo" />`,
    ...(p.imagen ? [`<meta property="og:image" content="${html(p.imagen)}" />`, `<meta name="twitter:card" content="summary_large_image" />`] : []),
    `<script type="application/ld+json">${json(p.jsonld)}</script>`,
  ].join('\n    ')
  out = remplazar(out, /<\/head>/, `    ${extra}\n  </head>`)
  out = remplazar(out, /<div id="root"><\/div>/, `<div id="root">${p.cuerpo}</div>`)
  return out
}
function escribir(ruta: string, contenido: string) {
  const f = join(dist, ruta, 'index.html')
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, contenido)
}

// ---------- Generación ----------
const urls: string[] = []
const RUTAS_PRINCIPALES = ['/', '/itinerario', '/lugares', '/mapa', '/como-llegar', '/galeria', '/chat', '/prestadores', '/privacidad']
urls.push(...RUTAS_PRINCIPALES)

for (const m of municipios) {
  const propios = lugares.filter((l) => l.municipio === m.slug)
  const visitables = destacados(propios)
  const porCat = Object.entries(Object.groupBy(propios, (l) => l.categoria)).filter(([c]) => !SERVICIOS.has(c))
  const resumen = porCat.sort((a, b) => b[1]!.length - a[1]!.length).slice(0, 3).map(([c, ls]) => `${ls!.length} ${PLURAL[c] ?? c}`).join(', ')
  const desc = recortar(`Qué hacer en ${m.nombre}, Valle de Tenza (Boyacá): ${resumen || 'lugares por registrar'}. Cómo llegar y próximos eventos.`)
  const foto = FOTO_MUNICIPIO[m.slug]
  const ruta = `/municipios/${m.slug}`
  const cuerpo = `<main><h1>${html(m.nombre)}, Valle de Tenza</h1><p>${html(desc)}</p>`
    + (visitables.length ? `<ul>${visitables.slice(0, 12).map((l) => `<li><a href="/lugares/${html(l.id)}">${html(l.nombre)}</a></li>`).join('')}</ul>` : '')
    + '</main>'
  const ld = {
    '@context': 'https://schema.org', '@type': 'TouristDestination', name: `${m.nombre}, Valle de Tenza`, description: desc, url: url(ruta),
    containedInPlace: { '@type': 'AdministrativeArea', name: 'Boyacá, Colombia' },
    ...(foto ? { image: imagenDe(foto) } : {}),
  }
  escribir(ruta, pagina({ ruta, titulo: `${m.nombre}, Valle de Tenza`, desc, imagen: imagenDe(foto), jsonld: ld, cuerpo }))
  urls.push(ruta)
}

for (const l of lugares) {
  const ruta = `/lugares/${l.id}`
  const mun = nombreMun[l.municipio] ?? l.municipio
  const desc = descripcionLugar(l)
  const imagen = imagenDe(fotoDeLugar({ id: l.id, municipio: l.municipio }))
  const cuerpo = `<main><h1>${html(l.nombre)}</h1><p>${html(desc)}</p><p><a href="/municipios/${html(l.municipio)}">${html(mun)}</a></p></main>`
  escribir(ruta, pagina({ ruta, titulo: `${l.nombre} · ${mun}`, desc, imagen, jsonld: jsonLdLugar(l, desc, url(ruta), imagen), cuerpo }))
  urls.push(ruta)
}

const lastmod = String(datos.generado ?? new Date().toISOString().slice(0, 10))
writeFileSync(join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + urls.map((u) => `  <url><loc>${html(url(u === '/' ? '/' : u))}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n') + '\n</urlset>\n')
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITIO}/sitemap.xml\n`)

// Salvaguarda de privacidad: ningún correo ni teléfono en lo generado.
const MALO = /[\w.+-]+@[\w-]+\.[\w.-]+|(?<![\d.])(?:\+?57[\s-]?)?3\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/
for (const u of urls.filter((x) => x.startsWith('/lugares/') || x.startsWith('/municipios/'))) {
  const t = readFileSync(join(dist, u, 'index.html'), 'utf8')
  const cuerpo = t.slice(t.indexOf('<title>'), t.indexOf('</head>')) + t.slice(t.indexOf('<div id="root">'), t.indexOf('</div>', t.indexOf('<div id="root">')))
  const hit = cuerpo.match(MALO)
  if (hit) throw new Error(`Dato personal en ${u}: ${hit[0]}`)
}
console.log(`Prerender: ${lugares.length} lugares, ${municipios.length} municipios, ${urls.length} URLs en sitemap.xml (${SITIO}).`)
