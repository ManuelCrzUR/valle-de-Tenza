import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { ItinerarioDto } from './itinerario.js'
import { validarPropuesta } from './itinerario.js'
import { nombreMunicipio, porId, SLUGS } from './catalogo.js'
import type { LugarPublico } from './catalogo.js'
import { idEstatico } from '../shared/ids.js'
import { escapeHtml } from './texto.js'

export interface ParadaDossier {
  n: number
  nombre: string
  municipio: string
  rol: string
  lat: number | null
  lon: number | null
  fuente: string
}

export interface Dossier {
  ejemplo: boolean
  codigo: string
  nombre: string
  fecha: string
  personas: number
  nota: string
  preferencia: string
  municipio: string
  paradas: ParadaDossier[]
}

const VERDE = rgb(0.078, 0.188, 0.169)
const CREMA = rgb(0.965, 0.953, 0.925)
const TIERRA = rgb(0.878, 0.565, 0.184)
const TINTA = rgb(0.12, 0.16, 0.15)

const UUID_EMPRESA = /^business:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CATS = new Set(['alojamiento', 'restaurante', 'comercio', 'atraccion', 'monumento', 'naturaleza', 'operador'])

/** Copia los negocios que ya vienen en `lugares`. No consulta Supabase ni el JSON. */
export function instantaneasDe(raw: unknown): LugarPublico[] {
  const lugares = (raw as { lugares?: unknown } | null)?.lugares
  if (!Array.isArray(lugares)) return []
  const out: LugarPublico[] = []
  for (const item of lugares) {
    if (!item || typeof item !== 'object') continue
    const l = item as Record<string, unknown>
    if (typeof l.id !== 'string' || !UUID_EMPRESA.test(l.id)) continue
    if (typeof l.nombre !== 'string' || l.nombre.trim().length < 2 || l.nombre.length > 120) continue
    if (typeof l.municipio !== 'string' || !SLUGS.includes(l.municipio)) continue
    if (typeof l.categoria !== 'string' || !CATS.has(l.categoria)) continue
    const lat = typeof l.lat === 'number' && Number.isFinite(l.lat) ? l.lat : null
    const lon = typeof l.lon === 'number' && Number.isFinite(l.lon) ? l.lon : null
    out.push({
      id: l.id,
      nombre: l.nombre.trim(),
      categoria: l.categoria as LugarPublico['categoria'],
      municipio: l.municipio,
      lat,
      lon,
      precision: lat != null && lon != null ? 'exacta' : null,
      descripcion: typeof l.descripcion === 'string' ? l.descripcion.slice(0, 240) : undefined,
    })
  }
  return out
}

export function paradasDe(it: Pick<ItinerarioDto, 'dias' | 'hospedaje' | 'lugares'>): ParadaDossier[] {
  const memoria = new Map((it.lugares ?? []).map((l) => [l.id, l]))
  const out: ParadaDossier[] = []
  const push = (id: string | null, rol: string) => {
    if (!id) return
    const snap = memoria.get(id)
    const estatico = porId(id) ?? porId(idEstatico(id))
    const nombre = snap?.nombre ?? estatico?.nombre
    const municipio = snap?.municipio ?? estatico?.municipio
    if (!nombre || !municipio || out.some((p) => p.nombre === nombre && p.rol === rol)) return
    out.push({
      n: out.length + 1,
      nombre,
      municipio: nombreMunicipio(municipio),
      rol,
      lat: snap?.lat ?? estatico?.lat ?? null,
      lon: snap?.lon ?? estatico?.lon ?? null,
      fuente: estatico ? (estatico.fuentes.join(', ') || 'Catálogo del Valle') : 'Empresa publicada al guardar la solicitud',
    })
  }
  for (const d of it.dias) {
    for (const id of d.paradas) push(id, 'Parada')
    push(d.comida, 'Comer')
  }
  push(it.hospedaje, 'Dormir')
  return out.map((p, i) => ({ ...p, n: i + 1 }))
}

export function dossierDe(opts: {
  ejemplo: boolean
  codigo: string
  nombre: string
  fecha: string
  personas: number
  nota: string
  itinerario: ItinerarioDto
}): Dossier {
  const preferencia = opts.itinerario.plan === 'gastro' ? 'Comida' : opts.itinerario.plan === 'cultura' ? 'Cultura' : 'Naturaleza'
  return {
    ejemplo: opts.ejemplo,
    codigo: opts.codigo,
    nombre: opts.nombre,
    fecha: opts.fecha,
    personas: opts.personas,
    nota: opts.nota,
    preferencia,
    municipio: nombreMunicipio(opts.itinerario.municipio),
    paradas: paradasDe(opts.itinerario),
  }
}

export function validarEjemplo(entrada: {
  nombre?: string
  fecha?: string
  personas?: number
  nota?: string
  itinerario?: unknown
}): { ok: true; dossier: Dossier } | { ok: false; error: string } {
  const it = validarPropuesta((entrada.itinerario ?? {}) as { plan?: unknown; municipio?: unknown; dias?: unknown; hospedaje?: unknown }, [], instantaneasDe(entrada.itinerario))
  if (!it.ok) return { ok: false, error: 'El ejemplo necesita paradas del catálogo.' }
  const completo = { ...it.dto, modo: 'demo' as const, modelo: null, resumen: '' }
  const nombre = (entrada.nombre ?? '').trim()
  return {
    ok: true,
    dossier: dossierDe({
      ejemplo: true,
      codigo: 'EJEMPLO',
      nombre: nombre || 'Viajero de ejemplo',
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(entrada.fecha ?? '') ? entrada.fecha! : 'fecha de ejemplo',
      personas: Number.isInteger(entrada.personas) && (entrada.personas ?? 0) > 0 ? entrada.personas! : 2,
      nota: (entrada.nota ?? '').slice(0, 500),
      itinerario: completo,
    }),
  }
}

export function asuntoDossier(codigo: string): string {
  return `Valle Directo | Solicitud recibida · ${codigo}`
}

export function htmlDossier(d: Dossier): string {
  const aviso = d.ejemplo
    ? '<p class="ejemplo"><strong>EJEMPLO / no guardada / no enviada.</strong> No es una reserva ni un correo real.</p>'
    : ''
  const filas = d.paradas.map((p) => `<li><strong>${p.n}. ${escapeHtml(p.nombre)}</strong> · ${escapeHtml(p.rol)} · ${escapeHtml(p.municipio)}. Fuente: ${escapeHtml(p.fuente)}.</li>`).join('')
  const nota = d.nota ? `<p>Nota: ${escapeHtml(d.nota)}</p>` : ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(asuntoDossier(d.codigo))}</title>
<style>
body{margin:0;background:#f6f3ec;color:#14302b;font-family:Georgia,serif}
main{max-width:640px;margin:0 auto;padding:24px 16px 48px}
header{background:#14302b;color:#f6f3ec;padding:20px 16px}
h1{font-size:28px;margin:0}
.marca{letter-spacing:.12em;font-size:12px;text-transform:uppercase;color:#e0902f}
.ejemplo{background:#f3e2c4;padding:12px;border-radius:8px}
ul{padding-left:1.2em} li{margin:8px 0}
</style></head><body><header><p class="marca">Valle de Tenza</p><h1>Valle Directo</h1></header><main>
${aviso}
<p><strong>Solicitud recibida, pendiente de confirmación.</strong></p>
<p>Código ${escapeHtml(d.codigo)}. ${escapeHtml(d.nombre)}, ${d.personas} ${d.personas === 1 ? 'persona' : 'personas'}, ${escapeHtml(d.fecha)}. Preferencia: ${escapeHtml(d.preferencia)}. Municipio base: ${escapeHtml(d.municipio)}.</p>
${nota}
<h2>Paradas del catálogo</h2>
<ol>${filas}</ol>
<p>La línea del mapa es un esquema en línea recta entre coordenadas. No es una carretera, no indica seguridad ni tiempos de viaje. No hay precios ni cupo garantizado.</p>
<p>Posiciones del catálogo público: colaboradores de OpenStreetMap (ODbL) y datos.gov.co. Este dossier no pide direcciones externas.</p>
</main></body></html>`
}

export function htmlCorreo(d: Dossier): string {
  const aviso = d.ejemplo
    ? '<p style="background:#f3e2c4;padding:12px;border-radius:8px"><strong>EJEMPLO / no guardada / no enviada.</strong></p>'
    : ''
  const filas = d.paradas.map((p) => `<li style="margin:6px 0">${escapeHtml(p.n + '. ' + p.nombre)} · ${escapeHtml(p.municipio)}</li>`).join('')
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f6f3ec;color:#14302b">
<div style="max-width:560px;margin:0 auto;font-family:Georgia,serif">
<div style="background:#14302b;color:#f6f3ec;padding:20px 16px"><p style="margin:0;color:#e0902f;letter-spacing:.12em;font-size:12px">VALLE DE TENZA</p><h1 style="margin:8px 0 0;font-size:26px">Valle Directo</h1></div>
<div style="padding:20px 16px">
${aviso}
<p>Hola ${escapeHtml(d.nombre)},</p>
<p><strong>Solicitud recibida, pendiente de confirmación.</strong> Código ${escapeHtml(d.codigo)}.</p>
<p>${escapeHtml(d.fecha)} · ${d.personas} ${d.personas === 1 ? 'persona' : 'personas'} · ${escapeHtml(d.preferencia)} · ${escapeHtml(d.municipio)}</p>
<ol style="padding-left:1.2em">${filas}</ol>
<p>No confirma cupo, no publica precios y no reserva. El mapa es un esquema, no una ruta por carretera.</p>
<p style="font-size:14px;color:#3d534c">Valle Directo · prototipo de clase</p>
</div></div></body></html>`
}

export function textoDossier(d: Dossier): string {
  const cabeza = d.ejemplo ? 'EJEMPLO / no guardada / no enviada.\n' : ''
  return [
    cabeza + 'Valle Directo',
    'Solicitud recibida, pendiente de confirmación.',
    `Código ${d.codigo}`,
    `${d.nombre} · ${d.personas} personas · ${d.fecha}`,
    `Preferencia: ${d.preferencia}. Municipio: ${d.municipio}.`,
    d.nota ? `Nota: ${d.nota}` : '',
    '',
    ...d.paradas.map((p) => `${p.n}. ${p.nombre} · ${p.rol} · ${p.municipio}`),
    '',
    'No hay precio ni cupo garantizado. La línea es un esquema, no una carretera.',
  ].filter((x) => x !== '').join('\n')
}

function dibujarEsquema(page: import('pdf-lib').PDFPage, font: import('pdf-lib').PDFFont, paradas: ParadaDossier[], x: number, y: number, w: number, h: number) {
  const pts = paradas.filter((p) => p.lat != null && p.lon != null) as (ParadaDossier & { lat: number; lon: number })[]
  page.drawRectangle({ x, y, width: w, height: h, color: CREMA, borderColor: VERDE, borderWidth: 1 })
  page.drawText('Esquema 2D, no es una carretera', { x: x + 8, y: y + h - 16, size: 9, font, color: VERDE })
  if (pts.length < 2) {
    page.drawText('Paradas ordenadas debajo. No hay suficientes coordenadas para el esquema.', { x: x + 8, y: y + 16, size: 9, font, color: TINTA })
    return
  }
  const lats = pts.map((p) => p.lat)
  const lons = pts.map((p) => p.lon)
  const minLa = Math.min(...lats), maxLa = Math.max(...lats)
  const minLo = Math.min(...lons), maxLo = Math.max(...lons)
  const dx = Math.max(0.001, maxLo - minLo)
  const dy = Math.max(0.001, maxLa - minLa)
  const xy = pts.map((p) => ({
    x: x + 16 + ((p.lon - minLo) / dx) * (w - 32),
    y: y + 16 + ((p.lat - minLa) / dy) * (h - 40),
    n: p.n,
  }))
  for (let i = 1; i < xy.length; i++) {
    page.drawLine({ start: xy[i - 1], end: xy[i], thickness: 1.4, color: TIERRA, dashArray: [4, 3] })
  }
  for (const p of xy) {
    page.drawCircle({ x: p.x, y: p.y, size: 7, color: VERDE })
    page.drawText(String(p.n), { x: p.x - 3, y: p.y - 3, size: 8, font, color: CREMA })
  }
}

export async function pdfDossier(d: Dossier): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage([595.28, 841.89])
  page.drawRectangle({ x: 0, y: 760, width: 595, height: 82, color: VERDE })
  page.drawText('VALLE DE TENZA', { x: 40, y: 812, size: 9, font: bold, color: TIERRA })
  page.drawText('Valle Directo', { x: 40, y: 786, size: 22, font: bold, color: CREMA })
  let y = 730
  if (d.ejemplo) {
    page.drawText('EJEMPLO / no guardada / no enviada', { x: 40, y, size: 12, font: bold, color: TIERRA })
    y -= 18
  }
  page.drawText('Solicitud recibida, pendiente de confirmación.', { x: 40, y, size: 12, font: bold, color: VERDE })
  y -= 16
  const linea = (t: string, size = 11) => {
    page.drawText(t.slice(0, 110), { x: 40, y, size, font, color: TINTA })
    y -= size + 6
  }
  linea(`Código ${d.codigo}`)
  linea(`${d.nombre} · ${d.personas} ${d.personas === 1 ? 'persona' : 'personas'} · ${d.fecha}`)
  linea(`Preferencia: ${d.preferencia}. Municipio base: ${d.municipio}.`)
  if (d.nota) linea(`Nota: ${d.nota.slice(0, 140)}`)
  y -= 6
  linea('No hay precios ni cupo garantizado.', 10)
  y -= 8
  const limite = Math.min(d.paradas.length, 8)
  for (const p of d.paradas.slice(0, limite)) {
    if (y < 250) break
    linea(`${p.n}. ${p.nombre} · ${p.rol} · ${p.municipio}`, 10)
  }
  dibujarEsquema(page, font, d.paradas, 40, 48, 515, 180)
  const sobran = d.paradas.length > limite
  if (sobran || d.paradas.length > 6) {
    const p2 = pdf.addPage([595.28, 841.89])
    let y2 = 800
    p2.drawText('Paradas y fuentes', { x: 40, y: y2, size: 16, font: bold, color: VERDE })
    y2 -= 24
    for (const p of d.paradas) {
      if (y2 < 60) break
      p2.drawText(`${p.n}. ${p.nombre}`.slice(0, 80), { x: 40, y: y2, size: 11, font: bold, color: TINTA })
      y2 -= 14
      p2.drawText(`${p.rol} · ${p.municipio} · ${p.fuente}`.slice(0, 100), { x: 40, y: y2, size: 9, font, color: TINTA })
      y2 -= 18
    }
    p2.drawText('Coordenadas del catálogo público. OpenStreetMap (ODbL) y datos.gov.co.', { x: 40, y: 40, size: 8, font, color: TINTA })
  }
  return pdf.save()
}
