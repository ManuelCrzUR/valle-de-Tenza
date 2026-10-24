// Calcula tramos por carretera con el servidor demo de OSRM y los guarda en `tramos` (upsert).
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run tramos [-- --todo]
// Pares: centros de municipio (y Bogotá) entre sí en ambos sentidos, y lugares a menos de 15 km en línea
// recta (más lugar ↔ centro de su municipio). Solo calcula pares nuevos; `--todo` fuerza todos.
// Respeta el servidor demo: ≤ 50 coordenadas por petición, 1 petición por segundo, User-Agent propio.
// Atribución: rutas © OSRM, datos © colaboradores de OpenStreetMap (ODbL).
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const llave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !llave) {
  console.error('Faltan SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}
const supabase = createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } })

const OSRM = 'https://router.project-osrm.org/table/v1/driving'
const USER_AGENT = 'ValleDirecto/1.0 (+https://github.com/ManuelCrzUR/valle-de-Tenza)'
const MAX_COORDS = 50
const BLOQUE = MAX_COORDS / 2 // sources + destinations únicos ≤ 50
const RADIO_KM = 15
const ESPERA_MIN_MS = 1000
const MAX_REINTENTOS = 3
const forzar = process.argv.includes('--todo')

// Terminal de Transportes Salitre (Cl. 23 #69-60, Bogotá), de donde salen los buses al Valle de Tenza.
const BOGOTA = { id: 'bogota', lat: 4.6573, lon: -74.1156, grupo: 'bogota' }

type Nodo = { id: string; lat: number; lon: number; grupo: string }

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

function kmRecta(a: Nodo, b: Nodo) {
  const rad = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

async function leerTodo(tabla: string, columnas: string) {
  const filas: any[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select(columnas).range(desde, desde + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    filas.push(...data)
    if (data.length < 1000) break
  }
  return filas
}

// --- Nodos ---------------------------------------------------------------
const municipios = await leerTodo('municipios', 'slug, centro')
const lugares = await leerTodo('lugares', 'id, municipio, lat, lon')

const centros: Nodo[] = [BOGOTA]
for (const m of municipios) {
  if (Array.isArray(m.centro) && m.centro.length === 2) {
    centros.push({ id: `mun:${m.slug}`, lat: m.centro[0], lon: m.centro[1], grupo: m.slug })
  }
}
const nodosLugar: Nodo[] = lugares
  .filter((l) => l.lat != null && l.lon != null)
  .map((l) => ({ id: l.id, lat: l.lat, lon: l.lon, grupo: l.municipio }))
const nodos = [...centros, ...nodosLugar]
const porId = new Map(nodos.map((n) => [n.id, n]))

// --- Pares necesarios ------------------------------------------------------
const clave = (o: string, d: string) => `${o}\u0000${d}`
const necesarios = new Map<string, [string, string]>()
const agregar = (o: string, d: string) => {
  if (o !== d) necesarios.set(clave(o, d), [o, d])
}
for (const a of centros) for (const b of centros) agregar(a.id, b.id)
for (const a of nodosLugar) {
  for (const b of nodosLugar) if (kmRecta(a, b) < RADIO_KM) agregar(a.id, b.id)
  const centro = porId.get(`mun:${a.grupo}`)
  if (centro) {
    agregar(a.id, centro.id)
    agregar(centro.id, a.id)
  }
}

const existentes = new Set<string>()
if (!forzar) {
  for (const t of await leerTodo('tramos', 'origen, destino')) existentes.add(clave(t.origen, t.destino))
}
const pendientes = [...necesarios.entries()].filter(([k]) => !existentes.has(k)).map(([, v]) => v)
console.log(`Pares necesarios: ${necesarios.size}; ya calculados: ${necesarios.size - pendientes.length}; por calcular: ${pendientes.length}`)

// --- Lotes: bloques de ≤ 25 nodos agrupados por municipio ---------------------
const bloqueDe = new Map<string, number>()
const bloques: Nodo[][] = []
const grupos = new Map<string, Nodo[]>()
for (const n of nodos) grupos.set(n.grupo, [...(grupos.get(n.grupo) ?? []), n])
for (const miembros of grupos.values()) {
  for (let i = 0; i < miembros.length; i += BLOQUE) {
    const bloque = miembros.slice(i, i + BLOQUE)
    bloque.forEach((n) => bloqueDe.set(n.id, bloques.length))
    bloques.push(bloque)
  }
}
const peticiones = new Map<string, [string, string][]>() // "bA,bB" -> pares
for (const par of pendientes) {
  const k = `${bloqueDe.get(par[0])},${bloqueDe.get(par[1])}`
  peticiones.set(k, [...(peticiones.get(k) ?? []), par])
}

// --- OSRM -------------------------------------------------------------------
let ultima = 0
let hechas = 0
async function osrm(urlPeticion: string): Promise<any> {
  for (let intento = 0; ; intento++) {
    const espera = ultima + ESPERA_MIN_MS - Date.now()
    if (espera > 0) await dormir(espera)
    ultima = Date.now()
    hechas++
    let motivo = ''
    try {
      const r = await fetch(urlPeticion, { headers: { 'User-Agent': USER_AGENT } })
      if (r.ok) return await r.json()
      motivo = `HTTP ${r.status}`
      if (r.status !== 429 && r.status < 500) throw new Error(`OSRM respondió ${motivo}`)
    } catch (e: any) {
      if (e.message?.startsWith('OSRM respondió')) throw e
      motivo = e.message ?? 'error de red'
    }
    if (intento >= MAX_REINTENTOS) throw new Error(`OSRM falló tras ${MAX_REINTENTOS} reintentos (${motivo})`)
    const ms = 2000 * 2 ** intento
    console.warn(`  ${motivo}; reintento ${intento + 1}/${MAX_REINTENTOS} en ${ms / 1000} s`)
    await dormir(ms)
  }
}

const inicio = Date.now()
let calculados = 0
let sinRuta = 0
let n = 0
for (const [k, pares] of peticiones) {
  n++
  const [ba, bb] = k.split(',').map(Number)
  const A = bloques[ba]
  const B = bloques[bb]
  const union = ba === bb ? A : [...A, ...B]
  const idx = new Map(union.map((x, i) => [x.id, i]))
  const coords = union.map((x) => `${x.lon},${x.lat}`).join(';')
  const src = A.map((x) => idx.get(x.id)).join(';')
  const dst = B.map((x) => idx.get(x.id)).join(';')
  const u = `${OSRM}/${coords}?sources=${src}&destinations=${dst}&annotations=duration,distance`
  const res = await osrm(u)
  if (res.code !== 'Ok') throw new Error(`OSRM código ${res.code} en la petición ${n}`)
  const filas: object[] = []
  const ahora = new Date().toISOString()
  for (const [o, d] of pares) {
    const i = A.findIndex((x) => x.id === o)
    const j = B.findIndex((x) => x.id === d)
    const dur = res.durations?.[i]?.[j]
    const dist = res.distances?.[i]?.[j]
    if (dur == null || dist == null) {
      sinRuta++
      continue
    }
    filas.push({ origen: o, destino: d, distancia_m: Math.round(dist), duracion_s: Math.round(dur), fuente: 'osrm', calculado_en: ahora })
  }
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from('tramos').upsert(filas.slice(i, i + 500), { onConflict: 'origen,destino' })
    if (error) throw new Error(`tramos: ${error.message}`)
  }
  calculados += filas.length
  console.log(`  petición ${n}/${peticiones.size}: ${filas.length} pares`)
}

console.log(
  `Pares calculados: ${calculados} (sin ruta: ${sinRuta}); peticiones: ${hechas}; tiempo total: ${((Date.now() - inicio) / 1000).toFixed(1)} s`,
)
