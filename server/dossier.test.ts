import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { LUGARES, tieneUbicacion } from '../src/data/lugares.js'
import { htmlCorreo, htmlDossier, pdfDossier, validarEjemplo, asuntoDossier, dossierDe } from './dossier.js'
import { POST } from '../api/dossier.js'
import { validarSolicitud } from './solicitud.js'
import { huella, memoriaTokens, nuevoToken, vigente } from './descarga.js'
import { enviarRecibo } from './correo.js'
import { cargadorFotos } from './fotos-pdf.js'

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

  it('el ejemplo y la solicitud guardada conservan el negocio del snapshot', async () => {
    const parque = LUGARES.find((l) => l.id === 'la-capilla-naturaleza-parque-principal-77eba')
    if (!parque) throw new Error('falta Parque Principal')
    const negocio = {
      id: 'business:11111111-1111-4111-8111-111111111111',
      nombre: 'Mirador La Peña del Puente',
      categoria: 'atraccion' as const,
      municipio: 'la-capilla',
      lat: 5.09111,
      lon: -73.45001,
      precision: 'exacta' as const,
    }
    const itinerario = {
      plan: 'cultura',
      municipio: 'la-capilla',
      hospedaje: null,
      dias: [{ paradas: [parque.id, negocio.id], comida: null }],
      lugares: [negocio],
    }
    const v = validarEjemplo({ itinerario, nombre: 'Ana', fecha: '2026-12-01', personas: 2, nota: '' })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.dossier.preferencia).toBe('Cultura')
    expect(v.dossier.paradas.map((p) => p.nombre)).toEqual([parque.nombre, negocio.nombre])
    expect(v.dossier.paradas[1].lat).toBe(negocio.lat)
    expect(v.dossier.paradas[1].lon).toBe(negocio.lon)
    const html = htmlDossier(v.dossier)
    expect(html).toContain(parque.nombre)
    expect(html).toContain(negocio.nombre)
    const plano = textoPdf(Buffer.from(await pdfDossier(v.dossier)))
    expect(plano).toContain(parque.nombre)
    expect(plano).toContain('Mirador La Pe')
    expect(plano).toContain('del Puente')

    const res = await POST(new Request('http://local/api/dossier', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ejemplo: true, itinerario, nombre: 'Ana', fecha: '2026-12-01', personas: 2, nota: '' }),
    }))
    const cuerpo = await res.json() as { html?: string; pdf?: string }
    expect(res.status).toBe(200)
    expect(cuerpo.html).toContain(negocio.nombre)
    expect(cuerpo.html).toContain(parque.nombre)
    expect(textoPdf(Buffer.from(cuerpo.pdf ?? '', 'base64'))).toContain('del Puente')

    const guardada = validarSolicitud({
      idempotencyKey: crypto.randomUUID(),
      nombre: 'Ana',
      correo: 'ana@example.com',
      fecha: '2026-12-01',
      personas: 2,
      nota: '',
      itinerario,
    }, { hoy: '2026-11-06' })
    expect(guardada.ok).toBe(true)
    if (!guardada.ok) return
    const recibo = dossierDe({
      ejemplo: false,
      codigo: 'ABCD1234',
      nombre: guardada.valor.nombre,
      fecha: guardada.valor.fecha,
      personas: guardada.valor.personas,
      nota: guardada.valor.nota,
      itinerario: { ...guardada.valor.itinerario, modo: 'ajuste', modelo: null, resumen: 'guardado' },
    })
    expect(recibo.paradas.map((p) => p.nombre)).toEqual([parque.nombre, negocio.nombre])
    expect(recibo.paradas[1].lat).toBe(5.09111)
    negocio.nombre = 'Nombre editado después'
    negocio.lat = 9
    expect(recibo.paradas[1].nombre).toBe('Mirador La Peña del Puente')
    expect(recibo.paradas[1].lat).toBe(5.09111)

    const sinCopia = validarEjemplo({
      itinerario: { plan: 'cultura', municipio: 'la-capilla', hospedaje: null, dias: [{ paradas: [parque.id, negocio.id], comida: null }] },
    })
    expect(sinCopia.ok && sinCopia.dossier.paradas.map((p) => p.nombre)).toEqual([parque.nombre])
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

  describe('cotización formal', () => {
    function ejemploTenza() {
      const de = LUGARES.filter((l) => l.municipio === 'tenza' && tieneUbicacion(l))
      const cat = (c: string[], n: number) => de.filter((l) => c.includes(l.categoria)).slice(0, n).map((l) => l.id)
      const v = validarEjemplo({
        itinerario: {
          plan: 'cultura', municipio: 'tenza', hospedaje: cat(['alojamiento'], 1)[0] ?? null,
          dias: [{ paradas: cat(['atraccion', 'monumento', 'naturaleza'], 3), comida: cat(['restaurante'], 1)[0] ?? null }, { paradas: cat(['monumento'], 1), comida: null }],
        },
        nombre: 'Ana', fecha: '2026-12-01', personas: 2,
      })
      if (!v.ok) throw new Error('ejemplo')
      return v.dossier
    }
    const latin1 = (b: Uint8Array) => Buffer.from(b).toString('latin1')

    it('tiene al menos 2 páginas y enlaces a las fichas solo si hay sitio', async () => {
      const d = ejemploTenza()
      expect(d.paradas.every((p) => p.id && p.dia !== undefined)).toBe(true)
      const con = await pdfDossier(d, { sitio: 'https://ejemplo.test/' })
      expect((await PDFDocument.load(con)).getPageCount()).toBeGreaterThanOrEqual(2)
      expect(latin1(con)).toContain('ejemplo.test/#/lugares/')
      expect(latin1(con)).toContain('/URI')
      const sin = await pdfDossier(d, { sitio: '' })
      expect(latin1(sin)).not.toContain('/#/lugares/')
    })

    it('embebe la foto del municipio y sigue sin ella si falla', async () => {
      const d = ejemploTenza()
      const jpg = new Uint8Array(readFileSync('public/fotos/11.jpg'))
      const sinFoto = await pdfDossier(d)
      const conFoto = await pdfDossier(d, { foto: async () => jpg })
      expect(conFoto.length).toBeGreaterThan(sinFoto.length + 1000)
      const lanza = await pdfDossier(d, { foto: async () => { throw new Error('x') } })
      const nula = await pdfDossier(d, { foto: async () => null })
      const rota = await pdfDossier(d, { foto: async () => new Uint8Array([1, 2, 3]) })
      for (const p of [lanza, nula, rota]) expect((await PDFDocument.load(p)).getPageCount()).toBeGreaterThanOrEqual(2)
      expect(textoPdf(Buffer.from(conFoto))).toContain('Foto: Centro hist')
    })

    it('cargadorFotos rechaza rutas fuera de fotos/N.jpg', async () => {
      const cargar = cargadorFotos('https://ejemplo.test')
      expect(await cargar('../etc/passwd')).toBeNull()
      expect(await cargar('fotos/x.png')).toBeNull()
      expect(await cargar('fotos/../package.json')).toBeNull()
      expect((await cargar('fotos/11.jpg'))?.length).toBeGreaterThan(1000)
    })

    it('no muestra precios: todo valor es «Por confirmar»', async () => {
      const d = ejemploTenza()
      const html = htmlDossier(d, 'https://ejemplo.test')
      expect(html).toContain('Por confirmar')
      expect(html).not.toContain('$')
      expect(html).toContain('https://ejemplo.test/#/lugares/')
      expect(html).toContain('COTIZACIÓN DE VIAJE')
      expect(textoPdf(Buffer.from(await pdfDossier(d)))).toContain('Por confirmar')
    })
  })
})

describe('cotización: ficha de empresas', () => {
  it('la empresa publicada lleva el id de su ficha pública', async () => {
    const { paradasDe } = await import('./dossier.js')
    const uuid = 'business:11111111-2222-4333-8444-555555555555'
    const ps = paradasDe({ dias: [{ paradas: [uuid], comida: null }], hospedaje: null, lugares: [{ id: uuid, nombre: 'Finca de prueba', categoria: 'alojamiento', municipio: 'tenza', lat: null, lon: null, precision: null }] } as never)
    expect(ps[0]?.id).toBe(uuid)
  })
})
