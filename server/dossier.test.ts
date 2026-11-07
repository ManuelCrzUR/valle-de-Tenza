import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { LUGARES, tieneUbicacion } from '../src/data/lugares.js'
import { htmlCorreo, htmlDossier, pdfDossier, validarEjemplo, asuntoDossier } from './dossier.js'
import { huella, memoriaTokens, nuevoToken, vigente } from './descarga.js'
import { enviarRecibo } from './correo.js'

function textoPdf(buf: Buffer): string {
  const marker = Buffer.from('stream')
  let out = ''
  let i = 0
  while (i < buf.length) {
    const at = buf.indexOf(marker, i)
    if (at < 0) break
    let s = at + marker.length
    if (buf[s] === 0x0d) s++
    if (buf[s] === 0x0a) s++
    const end = buf.indexOf('endstream', s)
    if (end < 0) break
    const body = buf.subarray(s, end)
    try { out += inflateSync(body).toString('latin1') } catch { out += body.toString('latin1') }
    i = end + 9
  }
  const conOctales = out.replace(/\\([0-7]{1,3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)))
  return conOctales.replace(/<([0-9A-Fa-f]+)>/g, (_, hex: string) => {
    let s = ''
    for (let n = 0; n + 1 < hex.length; n += 2) s += String.fromCharCode(parseInt(hex.slice(n, n + 2), 16))
    return s
  })
}

function itinerarioMinimo() {
  const p = LUGARES.find((l) => tieneUbicacion(l) && l.municipio === 'chivor' && l.categoria !== 'alojamiento')
  const h = LUGARES.find((l) => l.categoria === 'alojamiento' && l.municipio === 'chivor' && tieneUbicacion(l))
  if (!p || !h) throw new Error('faltan lugares')
  return { plan: 'aventura', municipio: 'chivor', hospedaje: h.id, dias: [{ paradas: [p.id], comida: null }] }
}

describe('dossier', () => {
  it('el PDF y el HTML salen del mismo snapshot y marcan el ejemplo', async () => {
    const v = validarEjemplo({ itinerario: itinerarioMinimo(), nombre: 'Viajero de ejemplo', fecha: '2026-12-01', personas: 2, nota: 'Niño en la mañana' })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.dossier.ejemplo).toBe(true)
    expect(v.dossier.codigo).toBe('EJEMPLO')
    expect(v.dossier.paradas.some((p) => p.municipio === 'Chivor')).toBe(true)
    const html = htmlDossier(v.dossier)
    const correo = htmlCorreo(v.dossier)
    expect(html).toContain('EJEMPLO / no guardada / no enviada')
    expect(html).toContain('Solicitud recibida, pendiente de confirmación')
    expect(correo).toContain(v.dossier.paradas[0].nombre)
    expect(html).toContain(v.dossier.paradas[0].nombre)
    const pdf = await pdfDossier(v.dossier)
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-')
    const plano = textoPdf(Buffer.from(pdf))
    expect(plano).toContain('Solicitud recibida, pendiente de confirmación')
    expect(plano).toContain('EJEMPLO')
    expect(plano).toContain('Niño en la mañana')
    expect(plano).toContain(v.dossier.paradas[0].nombre)
    expect(asuntoDossier(v.dossier.codigo)).toBe('Valle Directo | Solicitud recibida · EJEMPLO')
  })

  it('rechaza un id fuera del catálogo y no acepta una URL', () => {
    const malo = validarEjemplo({ itinerario: { plan: 'aventura', municipio: 'chivor', dias: [{ paradas: ['https://evil.example/x'], comida: null }] } })
    expect(malo.ok).toBe(false)
  })

  it('el enlace de descarga guarda solo la huella y vence', async () => {
    const t = await nuevoToken(Date.parse('2026-11-07T00:00:00Z'))
    expect(t.token).not.toBe(t.hash)
    expect(t.hash).toBe(await huella(t.token))
    const mem = memoriaTokens()
    await mem.guardar(t.hash, 'sol-1', t.expira)
    expect((await mem.buscar(t.hash))?.requestId).toBe('sol-1')
    expect(await mem.buscar(await huella('otro'))).toBeNull()
    expect(vigente(t.expira, Date.parse('2026-11-07T01:00:00Z'))).toBe(true)
    expect(vigente(t.expira, Date.parse('2026-11-07T03:00:00Z'))).toBe(false)
  })

  it('el correo adjunta el mismo PDF y no cambia la idempotencia', async () => {
    const v = validarEjemplo({ itinerario: itinerarioMinimo() })
    if (!v.ok) throw new Error('ejemplo')
    const pdf = await pdfDossier(v.dossier)
    let cuerpo = ''
    let clave = ''
    const r = await enviarRecibo({
      fetchImpl: async (_u, init) => {
        cuerpo = String(init?.body ?? '')
        clave = new Headers(init?.headers).get('idempotency-key') ?? ''
        return new Response(JSON.stringify({ id: 're_demo' }), { status: 200 })
      },
      clave: 'rk',
      desde: 'Valle Directo <demo@example.com>',
      para: 'persona@example.com',
      idempotencyKey: 'recibo:sol',
      datos: v.dossier,
      pdf,
    })
    expect(r.ok).toBe(true)
    expect(clave).toBe('recibo:sol')
    expect(cuerpo).toContain('Valle Directo | Solicitud recibida · EJEMPLO')
    expect(cuerpo).toContain('valle-directo-solicitud.pdf')
    expect(cuerpo).toContain(Buffer.from(pdf).toString('base64').slice(0, 40))
  })
})
