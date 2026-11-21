import { PDFArray, PDFDocument, PDFName, PDFString, StandardFonts, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb } from 'pdf-lib'
import type { PDFFont, PDFPage } from 'pdf-lib'
import type { ItinerarioDto } from './itinerario.js'
import { validarPropuesta } from './itinerario.js'
import { nombreMunicipio, porId, SLUGS } from './catalogo.js'
import type { LugarPublico } from './catalogo.js'
import { esEmpresa, idEstatico } from '../shared/ids.js'
import { siteUrl } from './env.js'
import { escapeHtml, hoyColombia } from './texto.js'
import { LUGARES } from '../src/data/lugares.js'
import { FOTOS, FOTO_MUNICIPIO } from '../src/data/fotos.js'

export interface ParadaDossier {
  n: number
  /** Id del catálogo estático (para el enlace a la ficha). Vacío si es un negocio sin ficha pública. */
  id?: string
  /** Día del viaje (1..n); null para el hospedaje (todas las noches). */
  dia?: number | null
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
  municipioSlug?: string
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
  const push = (id: string | null, rol: string, dia: number | null) => {
    if (!id) return
    const snap = memoria.get(id)
    const estatico = porId(id) ?? porId(idEstatico(id))
    const nombre = snap?.nombre ?? estatico?.nombre
    const municipio = snap?.municipio ?? estatico?.municipio
    if (!nombre || !municipio || out.some((p) => p.nombre === nombre && p.rol === rol)) return
    out.push({
      n: out.length + 1,
      // Ficha pública: la del catálogo o, si es una empresa publicada, /lugares/business:<uuid>.
      id: estatico?.id ?? (snap && esEmpresa(id) ? id : ''),
      dia,
      nombre,
      municipio: nombreMunicipio(municipio),
      rol,
      lat: snap?.lat ?? estatico?.lat ?? null,
      lon: snap?.lon ?? estatico?.lon ?? null,
      fuente: estatico ? (estatico.fuentes.join(', ') || 'Catálogo del Valle') : 'Empresa publicada al guardar la solicitud',
    })
  }
  it.dias.forEach((d, i) => {
    for (const id of d.paradas) push(id, 'Parada', i + 1)
    push(d.comida, 'Comer', i + 1)
  })
  push(it.hospedaje, 'Dormir', null)
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
    municipioSlug: opts.itinerario.municipio,
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

const POR_CONFIRMAR = 'Por confirmar'
const CONCEPTO: Record<string, string> = { Parada: 'Parada', Comer: 'Comida', Dormir: 'Alojamiento' }
const normSitio = (s?: string) => {
  const v = (s ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^\s]+$/.test(v) ? v : ''
}
const rutaFicha = (id: string) => `/#/lugares/${encodeURIComponent(id)}`
const diaTexto = (p: ParadaDossier) => (p.dia != null ? `Día ${p.dia}` : 'Todas las noches')

export interface CifrasMunicipio { atractivos: number; comer: number; dormir: number; guias: number }
/** Cuenta lugares del catálogo del municipio. No inventa: sale de `LUGARES`. */
export function cifrasMunicipio(slug: string): CifrasMunicipio {
  const del = LUGARES.filter((l) => l.municipio === slug)
  const n = (cats: string[]) => del.filter((l) => cats.includes(l.categoria)).length
  return { atractivos: n(['atraccion', 'monumento', 'naturaleza']), comer: n(['restaurante']), dormir: n(['alojamiento']), guias: n(['operador']) }
}

function fotoDe(slug: string) {
  const id = FOTO_MUNICIPIO[slug]
  return id ? FOTOS[id] : undefined
}

export function htmlDossier(d: Dossier, sitio?: string): string {
  const base = normSitio(sitio)
  const aviso = d.ejemplo
    ? '<p class="ejemplo"><strong>EJEMPLO / no guardada / no enviada.</strong> No es una reserva ni un correo real.</p>'
    : ''
  const foto = fotoDe(d.municipioSlug ?? '')
  const cifras = cifrasMunicipio(d.municipioSlug ?? '')
  const enMun = d.paradas.filter((p) => p.municipio === d.municipio).map((p) => p.nombre)
  const otros = [...new Set(d.paradas.map((p) => p.municipio).filter((m) => m !== d.municipio))]
  const imagen = foto && base
    ? `<figure><img src="${escapeHtml(`${base}/${foto.archivo}`)}" alt="${escapeHtml(foto.pie)}" loading="lazy"><figcaption>Foto: ${escapeHtml(foto.pie)}. Fuente: ${escapeHtml(foto.fuente)}.</figcaption></figure>`
    : foto
      ? `<p class="credito">Foto del municipio: ${escapeHtml(foto.pie)}. Fuente: ${escapeHtml(foto.fuente)}.</p>`
      : ''
  const masInfo = foto?.url ? `<p>Más información turística: <a href="${escapeHtml(foto.url)}">${escapeHtml(foto.url)}</a></p>` : ''
  const filas = d.paradas.map((p) => {
    const ficha = p.id
      ? (base
        ? `<a href="${escapeHtml(base + rutaFicha(p.id))}">${escapeHtml(p.nombre)}</a><br><small>Ver ficha en Valle Directo</small>`
        : `${escapeHtml(p.nombre)}<br><small>${escapeHtml(rutaFicha(p.id))}</small>`)
      : `${escapeHtml(p.nombre)}<br><small>Sin ficha pública en el catálogo</small>`
    return `<tr><td>${p.n}</td><td>${escapeHtml(diaTexto(p))}</td><td>${escapeHtml(CONCEPTO[p.rol] ?? p.rol)}</td><td>${ficha}</td><td>${escapeHtml(p.municipio)}</td><td class="der">${POR_CONFIRMAR}</td></tr>`
  }).join('')
  const nota = d.nota ? `<p>Nota: ${escapeHtml(d.nota)}</p>` : ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(asuntoDossier(d.codigo))}</title>
<style>
body{margin:0;background:#f6f3ec;color:#14302b;font-family:Georgia,serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
header{background:#14302b;color:#f6f3ec;padding:20px 16px}
h1{font-size:28px;margin:0}
h2{font-size:18px;border-bottom:1px solid #14302b;padding-bottom:4px;margin-top:28px}
.marca{letter-spacing:.12em;font-size:12px;text-transform:uppercase;color:#e0902f}
.ejemplo{background:#f3e2c4;padding:12px;border-radius:8px}
.doc{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}
.doc p{margin:2px 0}
figure{margin:12px 0}img{max-width:100%;height:auto;border-radius:4px}figcaption,.credito{font-size:13px;color:#3d534c}
table{border-collapse:collapse;width:100%;font-size:14px}
th{background:#14302b;color:#f6f3ec;text-align:left;padding:6px}
td{padding:6px;vertical-align:top} tr:nth-child(even) td{background:#efe9da}
.der{text-align:right;white-space:nowrap} a{color:#1f6f6b} small{color:#1f6f6b}
.cifras{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.cifras li{background:#efe9da;padding:8px 12px;border-radius:6px}
</style></head><body><header><p class="marca">Valle de Tenza</p><h1>Valle Directo</h1></header><main>
${aviso}
<div class="doc"><div><h2 style="margin-top:0;border:0">COTIZACIÓN DE VIAJE</h2><p><strong>Solicitud recibida, pendiente de confirmación.</strong></p></div>
<div><p>N.º ${escapeHtml(d.codigo)}</p><p>Emitida: ${escapeHtml(hoyColombia())}</p><p>Validez: sujeta a confirmación de cada prestador</p></div></div>
<h2>Cliente</h2>
<p>${escapeHtml(d.nombre)} · ${d.personas} ${d.personas === 1 ? 'persona' : 'personas'} · Fecha del viaje: ${escapeHtml(d.fecha)}<br>Preferencia: ${escapeHtml(d.preferencia)}</p>
${nota}
<h2>Resumen de ${escapeHtml(d.municipio)}</h2>
${imagen}
<ul class="cifras"><li>Atractivos y naturaleza en el catálogo: <strong>${cifras.atractivos}</strong></li><li>Dónde comer: <strong>${cifras.comer}</strong></li><li>Dónde dormir: <strong>${cifras.dormir}</strong></li><li>Guías: <strong>${cifras.guias}</strong></li></ul>
<p>Paradas de este plan en ${escapeHtml(d.municipio)}: ${enMun.length ? escapeHtml(enMun.join(', ')) : 'ninguna'}.</p>
${otros.length ? `<p>El recorrido también pasa por: ${escapeHtml(otros.join(', '))}.</p>` : ''}
${masInfo}
<h2>Detalle de la cotización</h2>
<table><thead><tr><th>N.º</th><th>Día</th><th>Concepto</th><th>Lugar o prestador</th><th>Municipio</th><th class="der">Valor (COP)</th></tr></thead><tbody>${filas}
<tr><td colspan="5" class="der"><strong>Subtotal</strong></td><td class="der">${POR_CONFIRMAR}</td></tr>
<tr><td colspan="5" class="der"><strong>Total</strong></td><td class="der"><strong>${POR_CONFIRMAR}</strong></td></tr></tbody></table>
<h2>Condiciones</h2>
<ul>
<li>Este documento no confirma cupo, no cobra y no reserva.</li>
<li>Cada prestador confirma su disponibilidad y su precio. No hay precios publicados en el sistema.</li>
<li>Los enlaces llevan a la ficha pública del lugar en Valle Directo.</li>
<li>La línea del esquema es recta entre coordenadas: no es una carretera ni un tiempo de viaje.</li>
</ul>
<p class="credito">Coordenadas: colaboradores de OpenStreetMap (ODbL) y datos.gov.co. Fotos: créditos en cada imagen.</p>
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

function dibujarEsquema(page: PDFPage, font: PDFFont, paradas: ParadaDossier[], x: number, y: number, w: number, h: number) {
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

const TEAL = rgb(0.122, 0.435, 0.42)
const LINEA = rgb(0.8, 0.78, 0.72)
const A4: [number, number] = [595.28, 841.89]
const MX = 40
const ANCHO = 515
const PIE_ALTO = 56

export interface OpcionesPdf {
  sitio?: string
  foto?: (archivo: string) => Promise<Uint8Array | null>
}

/** Deja solo caracteres que Helvetica (WinAnsi) puede dibujar. */
function limpia(t: string): string {
  return t.replace(/[\r\n\t]+/g, ' ').replace(/[^ -~ -ÿ–—‘’“”•…€]/g, '?')
}

function ajusta(t: string, font: PDFFont, size: number, ancho: number): string {
  t = limpia(t)
  if (font.widthOfTextAtSize(t, size) <= ancho) return t
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > ancho) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

function envolver(t: string, font: PDFFont, size: number, ancho: number, maxLineas = 99): string[] {
  const out: string[] = []
  let linea = ''
  for (const palabra of limpia(t).split(' ').filter(Boolean)) {
    const prueba = linea ? `${linea} ${palabra}` : palabra
    if (font.widthOfTextAtSize(prueba, size) <= ancho) { linea = prueba; continue }
    if (linea) out.push(linea)
    linea = font.widthOfTextAtSize(palabra, size) <= ancho ? palabra : ajusta(palabra, font, size, ancho)
  }
  if (linea) out.push(linea)
  if (out.length > maxLineas) {
    const corte = out.slice(0, maxLineas)
    corte[maxLineas - 1] = ajusta(corte[maxLineas - 1] + ' …', font, size, ancho)
    return corte
  }
  return out
}

/** Anotación de enlace clicable. `rect` = [x1, y1, x2, y2] en coordenadas PDF. */
function enlazar(pdf: PDFDocument, page: PDFPage, rect: [number, number, number, number], url: string) {
  const annot = pdf.context.register(pdf.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: rect,
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
  }))
  let annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  if (!annots) {
    annots = pdf.context.obj([]) as PDFArray
    page.node.set(PDFName.of('Annots'), annots)
  }
  annots.push(annot)
}

export async function pdfDossier(d: Dossier, opts: OpcionesPdf = {}): Promise<Uint8Array> {
  const sitio = normSitio(opts.sitio ?? siteUrl())
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Cotización de viaje ${d.codigo} · Valle Directo`)
  pdf.setProducer('Valle Directo')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const H = A4[1]
  const paginas: PDFPage[] = []
  let page!: PDFPage
  let y = 0 // coordenada PDF (crece hacia arriba)

  const texto = (t: string, x: number, yy: number, size: number, f = font, color = TINTA) => {
    page.drawText(limpia(t), { x, y: yy, size, font: f, color })
  }
  const derecha = (t: string, xDer: number, yy: number, size: number, f = font, color = TINTA) => {
    const s = limpia(t)
    page.drawText(s, { x: xDer - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color })
  }
  const regla = (yy: number, color = LINEA, grosor = 0.6) => page.drawLine({ start: { x: MX, y: yy }, end: { x: MX + ANCHO, y: yy }, thickness: grosor, color })

  const nuevaPagina = (primera: boolean) => {
    page = pdf.addPage(A4)
    paginas.push(page)
    if (primera) {
      page.drawRectangle({ x: 0, y: H - 74, width: A4[0], height: 74, color: VERDE })
      texto('VALLE DE TENZA', MX, H - 30, 9, bold, TIERRA)
      texto('Valle Directo', MX, H - 56, 22, bold, CREMA)
      y = H - 74 - 26
    } else {
      page.drawRectangle({ x: 0, y: H - 30, width: A4[0], height: 30, color: VERDE })
      texto('VALLE DIRECTO', MX, H - 19, 9, bold, CREMA)
      derecha(`Cotización N.º ${d.codigo}`, MX + ANCHO, H - 19, 9, font, CREMA)
      y = H - 30 - 24
    }
    if (d.ejemplo) {
      const w = bold.widthOfTextAtSize('EJEMPLO – no guardada, no enviada', 9) + 16
      page.drawRectangle({ x: MX + ANCHO - w, y: primera ? H - 62 : H - 25, width: w, height: 16, color: TIERRA })
      texto('EJEMPLO – no guardada, no enviada', MX + ANCHO - w + 8, primera ? H - 57 : H - 20, 9, bold, VERDE)
    }
  }
  const asegurar = (alto: number, repetir?: () => void) => {
    if (y - alto >= PIE_ALTO + 8) return
    nuevaPagina(false)
    repetir?.()
  }
  const titulo = (t: string) => {
    texto(t.toUpperCase(), MX, y, 10, bold, VERDE)
    regla(y - 5, VERDE, 1)
    y -= 20
  }

  // ---------- Página 1: cabecera y resumen ----------
  nuevaPagina(true)
  texto('COTIZACIÓN DE VIAJE', MX, y - 10, 20, bold, VERDE)
  texto('Solicitud recibida, pendiente de confirmación.', MX, y - 28, 10, font, TINTA)
  derecha(`N.º ${d.codigo}`, MX + ANCHO, y - 2, 11, bold, TINTA)
  derecha(`Emitida: ${hoyColombia()}`, MX + ANCHO, y - 15, 9, font, TINTA)
  derecha('Validez: sujeta a confirmación de cada prestador', MX + ANCHO, y - 27, 8, font, TINTA)
  y -= 44
  regla(y, VERDE, 1.2)
  y -= 18

  // Cliente / Destino base
  const colW = 330
  const yc = y
  texto('CLIENTE', MX, yc, 9, bold, TIERRA)
  texto('DESTINO BASE', MX + colW + 20, yc, 9, bold, TIERRA)
  let yy = yc - 15
  texto(ajusta(d.nombre, bold, 12, colW), MX, yy, 12, bold)
  yy -= 14
  texto(`Fecha del viaje: ${d.fecha}`, MX, yy, 9.5)
  yy -= 13
  texto(`Personas: ${d.personas}   ·   Preferencia: ${d.preferencia}`, MX, yy, 9.5)
  if (d.nota) {
    for (const l of envolver(`Nota: ${d.nota}`, font, 9, colW, 2)) { yy -= 12; texto(l, MX, yy, 9, font, TINTA) }
  }
  texto(ajusta(d.municipio, bold, 14, ANCHO - colW - 20), MX + colW + 20, yc - 16, 14, bold, VERDE)
  texto('Municipio base del plan', MX + colW + 20, yc - 30, 9, font, TINTA)
  y = Math.min(yy, yc - 38) - 30

  // Resumen del municipio
  titulo(`Resumen de ${d.municipio}`)
  const foto = fotoDe(d.municipioSlug ?? '')
  if (foto && opts.foto) {
    try {
      const bytes = await opts.foto(foto.archivo)
      if (bytes) {
        const img = await pdf.embedJpg(bytes)
        const cajaW = ANCHO, cajaH = 220
        const escala = Math.max(cajaW / img.width, cajaH / img.height)
        const w = img.width * escala, h = img.height * escala
        const x0 = MX, y0 = y - cajaH
        page.pushOperators(pushGraphicsState(), rectangle(x0, y0, cajaW, cajaH), clip(), endPath())
        page.drawImage(img, { x: x0 - (w - cajaW) / 2, y: y0 - (h - cajaH) / 2, width: w, height: h })
        page.pushOperators(popGraphicsState())
        page.drawRectangle({ x: x0, y: y0, width: cajaW, height: cajaH, borderColor: LINEA, borderWidth: 0.6 })
        y = y0 - 12
        const credito = ajusta(`Foto: ${foto.pie}. Fuente: ${foto.fuente}.`, font, 8, ANCHO)
        texto(credito, MX, y, 8, font, TINTA)
        y -= 18
      }
    } catch { /* sigue sin imagen */ }
  }
  // Cifras del catálogo
  const c = cifrasMunicipio(d.municipioSlug ?? '')
  const celdas: [string, number][] = [['Atractivos y naturaleza', c.atractivos], ['Dónde comer', c.comer], ['Dónde dormir', c.dormir], ['Guías', c.guias]]
  const cw = (ANCHO - 3 * 8) / 4
  celdas.forEach(([et, n], i) => {
    const x = MX + i * (cw + 8)
    page.drawRectangle({ x, y: y - 40, width: cw, height: 40, color: CREMA })
    texto(String(n), x + 10, y - 22, 16, bold, VERDE)
    texto(ajusta(et, font, 8, cw - 20), x + 10, y - 34, 8, font, TINTA)
  })
  y -= 54
  texto('Cifras del catálogo de Valle Directo para este municipio; no es un inventario completo.', MX, y, 7.5, font, TINTA)
  y -= 16
  const enMun = d.paradas.filter((p) => p.municipio === d.municipio).map((p) => p.nombre)
  texto('Paradas de este plan en ' + d.municipio, MX, y, 9.5, bold, VERDE)
  y -= 13
  const lineasMun = enMun.length ? envolver(enMun.join(' · '), font, 9, ANCHO, 3) : ['Este plan no tiene paradas en el municipio base.']
  for (const l of lineasMun) { texto(l, MX, y, 9); y -= 12 }
  const otros = [...new Set(d.paradas.map((p) => p.municipio).filter((m) => m !== d.municipio))]
  if (otros.length) {
    y -= 3
    for (const l of envolver(`El recorrido también pasa por: ${otros.join(', ')}.`, font, 9, ANCHO, 2)) { texto(l, MX, y, 9); y -= 12 }
  }
  if (foto?.url) {
    y -= 3
    const pref = 'Más información turística: '
    texto(pref, MX, y, 9)
    const url = ajusta(foto.url, font, 9, ANCHO - font.widthOfTextAtSize(pref, 9))
    const x1 = MX + font.widthOfTextAtSize(pref, 9)
    texto(url, x1, y, 9, font, TEAL)
    page.drawLine({ start: { x: x1, y: y - 1.5 }, end: { x: x1 + font.widthOfTextAtSize(limpia(url), 9), y: y - 1.5 }, thickness: 0.5, color: TEAL })
    enlazar(pdf, page, [x1, y - 3, x1 + font.widthOfTextAtSize(limpia(url), 9), y + 10], foto.url)
    y -= 12
  }

  // ---------- Página 2: detalle ----------
  nuevaPagina(false)
  const cols = [
    { t: 'N.º', w: 26, der: false },
    { t: 'Día', w: 80, der: false },
    { t: 'Concepto', w: 60, der: false },
    { t: 'Lugar o prestador', w: 183, der: false },
    { t: 'Municipio', w: 76, der: false },
    { t: 'Valor (COP)', w: 90, der: true },
  ]
  const cabeceraTabla = () => {
    page.drawRectangle({ x: MX, y: y - 18, width: ANCHO, height: 20, color: VERDE })
    let x = MX
    for (const col of cols) {
      if (col.der) derecha(col.t, x + col.w - 6, y - 12, 8.5, bold, CREMA)
      else texto(col.t, x + 6, y - 12, 8.5, bold, CREMA)
      x += col.w
    }
    y -= 20
  }
  titulo('Detalle de la cotización')
  cabeceraTabla()
  const FILA = 30
  d.paradas.forEach((p, i) => {
    asegurar(FILA + 4, cabeceraTabla)
    if (i % 2 === 0) page.drawRectangle({ x: MX, y: y - FILA, width: ANCHO, height: FILA, color: CREMA })
    const base = y - 12
    let x = MX
    const concepto = CONCEPTO[p.rol] ?? p.rol
    const celdasT = [String(p.n), p.dia != null ? `Día ${p.dia}` : 'Todas las noches', concepto]
    celdasT.forEach((t, k) => { texto(t, x + 6, base, 8.5); x += cols[k].w })
    const xl = x
    const anchoL = cols[3].w - 10
    texto(ajusta(p.nombre, bold, 8.5, anchoL), xl + 6, base, 8.5, bold)
    if (p.id) {
      const rel = rutaFicha(p.id)
      const mostrado = ajusta(sitio ? 'Ver perfil en Valle Directo' : rel, font, 8, anchoL)
      texto(mostrado, xl + 6, base - 11, 8, font, TEAL)
      if (sitio) enlazar(pdf, page, [xl, y - FILA, xl + cols[3].w, y], sitio + rel)
    } else {
      texto('Sin ficha pública en el catálogo', xl + 6, base - 11, 8, font, TINTA)
    }
    x = xl + cols[3].w
    texto(ajusta(p.municipio, font, 8.5, cols[4].w - 8), x + 6, base, 8.5)
    x += cols[4].w
    derecha(POR_CONFIRMAR, x + cols[5].w - 6, base, 8.5)
    y -= FILA
  })
  regla(y, VERDE, 0.8)
  asegurar(60)
  const totalFila = (et: string, f: PDFFont) => {
    derecha(et, MX + ANCHO - cols[5].w - 8, y - 15, 9.5, f, TINTA)
    derecha(POR_CONFIRMAR, MX + ANCHO - 6, y - 15, 9.5, f, TINTA)
    y -= 22
  }
  totalFila('Subtotal', font)
  regla(y + 2, LINEA)
  totalFila('Total', bold)
  regla(y + 2, VERDE, 1)
  y -= 14

  asegurar(110)
  titulo('Condiciones')
  const condiciones = [
    'Este documento no confirma cupo, no cobra y no reserva.',
    'Cada prestador confirma su disponibilidad y su precio. En el sistema no hay precios publicados, por eso el valor figura como «Por confirmar».',
    'Los enlaces llevan a la ficha pública del lugar en Valle Directo.',
    'La línea del esquema es recta entre coordenadas: no es una carretera ni un tiempo de viaje.',
  ]
  for (const cond of condiciones) {
    const ls = envolver(cond, font, 9, ANCHO - 14)
    asegurar(ls.length * 12 + 4)
    texto('•', MX + 2, y, 9)
    for (const l of ls) { texto(l, MX + 14, y, 9); y -= 12 }
    y -= 2
  }
  y -= 8
  const altoEsq = 170
  asegurar(altoEsq + 6)
  dibujarEsquema(page, font, d.paradas, MX, y - altoEsq, ANCHO, altoEsq)

  // ---------- Pie en todas las páginas ----------
  paginas.forEach((pg, i) => {
    page = pg
    regla(PIE_ALTO - 6, LINEA)
    texto(`Valle Directo · Cotización N.º ${d.codigo} · Página ${i + 1} de ${paginas.length}`, MX, PIE_ALTO - 19, 8, bold, VERDE)
    texto('Coordenadas: colaboradores de OpenStreetMap (ODbL) y datos.gov.co. Fotos: créditos en cada imagen.', MX, PIE_ALTO - 31, 7.5, font, TINTA)
  })
  return pdf.save({ useObjectStreams: false })
}
