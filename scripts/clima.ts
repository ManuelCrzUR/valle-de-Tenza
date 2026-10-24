// Descarga el pronóstico de 7 días de Open-Meteo por municipio (con centro) y lo guarda en `clima` (upsert).
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run clima
// Atribución: clima © Open-Meteo (CC-BY 4.0). Solo se llama desde aquí, nunca desde el navegador.
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const llave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !llave) {
  console.error('Faltan SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}
const supabase = createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } })

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

const { data: municipios, error } = await supabase.from('municipios').select('slug, centro').order('slug')
if (error) throw new Error(`municipios: ${error.message}`)

let escritas = 0
let fallidos = 0
const conCentro = municipios.filter((m) => Array.isArray(m.centro) && m.centro.length === 2)
for (const [i, m] of conCentro.entries()) {
  if (i > 0) await dormir(1000)
  const [lat, lon] = m.centro as number[]
  const api =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&daily=precipitation_probability_max,temperature_2m_min,temperature_2m_max&timezone=America/Bogota&forecast_days=7'
  try {
    const r = await fetch(api)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d = (await r.json()).daily
    const ahora = new Date().toISOString()
    const filas = d.time.map((fecha: string, k: number) => ({
      municipio: m.slug,
      fecha,
      prob_lluvia_max: d.precipitation_probability_max[k],
      temp_min: d.temperature_2m_min[k],
      temp_max: d.temperature_2m_max[k],
      actualizado: ahora,
    }))
    const { error: e } = await supabase.from('clima').upsert(filas, { onConflict: 'municipio,fecha' })
    if (e) throw new Error(e.message)
    escritas += filas.length
    console.log(`${m.slug}: ${filas.length} días`)
  } catch (e: any) {
    fallidos++
    console.error(`${m.slug}: ${e.message}`)
  }
}
console.log(`Filas de clima escritas: ${escritas}`)
if (fallidos) process.exit(1)
