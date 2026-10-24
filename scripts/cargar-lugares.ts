// Carga src/data/lugares.json en Supabase (upsert por id / slug). Idempotente.
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run cargar
// La llave service_role solo se lee del entorno; nunca va en el repositorio ni en el front.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const llave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !llave) {
  console.error('Faltan SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const supabase = createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } })
const datos = JSON.parse(readFileSync(new URL('../src/data/lugares.json', import.meta.url), 'utf8'))

const TAMANO_LOTE = 100
const ahora = new Date().toISOString()

const municipios = datos.municipios.map((m: any) => ({ slug: m.slug, nombre: m.nombre, centro: m.centro, caja: m.caja }))
const lugares = datos.lugares.map((l: any) => ({
  id: l.id,
  nombre: l.nombre,
  categoria: l.categoria,
  subtipo: l.subtipo ?? '',
  municipio: l.municipio,
  lat: l.lat,
  lon: l.lon,
  precision: l.precision,
  direccion: l.direccion ?? '',
  vereda: l.vereda ?? null,
  plan: l.plan,
  es_servicio: l.esServicio,
  con_registro: l.conRegistro,
  fuentes: l.fuentes ?? [],
  extra: l.extra ?? null,
  actualizado: ahora,
}))

async function subir(tabla: string, filas: object[], conflicto: string) {
  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    const lote = filas.slice(i, i + TAMANO_LOTE)
    const { error } = await supabase.from(tabla).upsert(lote, { onConflict: conflicto })
    if (error) throw new Error(`${tabla}: ${error.message}`)
  }
  console.log(`${tabla}: ${filas.length} filas cargadas`)
}

await subir('municipios', municipios, 'slug')
await subir('lugares', lugares, 'id')
