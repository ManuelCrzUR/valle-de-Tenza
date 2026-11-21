import { afterEach, describe, expect, it } from 'vitest'
import { LUGARES, tieneUbicacion } from '../src/data/lugares.js'
import { almacenMemoria, almacenSupabase, type Almacen } from './almacen.js'
import type { LugarPublico } from './catalogo.js'
import { siteUrl } from './env.js'
import { cargadorFotos, sitioDe } from './fotos-pdf.js'
import { datosReciboDe, crearSolicitud, reintentarOutbox, validarSolicitud } from './solicitud.js'
import { validarPropuesta } from './itinerario.js'
import type { ItinerarioDto } from './itinerario.js'

const envCopia = { ...process.env }
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in envCopia)) delete process.env[k]
  Object.assign(process.env, envCopia)
})

function dtoMinimo(): ItinerarioDto {
  const parada = LUGARES.find((l) => tieneUbicacion(l) && l.municipio === 'tenza' && l.categoria !== 'alojamiento')
  if (!parada) throw new Error('falta parada')
  const v = validarPropuesta({ plan: 'cultura', municipio: 'tenza', hospedaje: null, dias: [{ paradas: [parada.id], comida: null }] })
  if (!v.ok) throw new Error(v.error)
  return { ...v.dto, modo: 'demo', modelo: null, resumen: 'resumen' }
}

const base = () => ({
  idempotencyKey: crypto.randomUUID(),
  nombre: 'Ana',
  correo: 'ana@example.com',
  fecha: '2026-12-01',
  personas: 2,
  nota: '',
  itinerario: dtoMinimo(),
})

const HOY = '2026-11-06'

describe('hallazgo 1 y 2: reintento del outbox', () => {
  it('pendientes embebe el itinerario y datosReciboDe no lanza', async () => {
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
    const dto = dtoMinimo()
    let url = ''
    const fetchImpl: typeof fetch = async (u) => {
      url = String(u)
      return new Response(JSON.stringify([{
        id: 'abcdef12-0000-4000-8000-000000000000', idempotency_key: 'k', nombre: 'Ana', correo: 'ana@example.com', telefono: null,
        fecha: '2026-12-01', personas: 2, nota: null,
        email_outbox: [{ id: 'o1', idempotency_key: 'recibo:1', estado: 'fallido', intentos: 1 }],
        itineraries: { itinerario: dto },
      }]), { status: 200 })
    }
    const filas = await almacenSupabase(fetchImpl).pendientes(5, { pendienteAntesDe: '2026-11-06T10:00:00.000Z' })
    expect(url).toContain('itineraries(itinerario)')
    expect(url).toContain('created_at.lt.')
    expect(filas[0].itinerario.plan).toBe(dto.plan)
    expect(() => datosReciboDe(filas[0])).not.toThrow()
  })

  it('un fallo en una fila no detiene el lote', async () => {
    const almacen = almacenMemoria()
    for (let i = 0; i < 2; i++) {
      const r = await crearSolicitud(base(), { almacen, hoy: HOY, enviar: async () => ({ ok: false, error: 'x' }) })
      expect(r.ok && r.resultado.comprobante).toBe('fallido')
    }
    let n = 0
    const r = await reintentarOutbox(almacen, async () => {
      n++
      if (n === 1) throw new Error('boom de render')
      return { ok: true, id: 're' }
    })
    expect(r.intentos).toBe(2)
    expect(r.enviados).toBe(1)
  })

  it('no toma pendientes recientes, sí los viejos, y respeta la puerta de envío', async () => {
    const almacen = almacenMemoria()
    const r1 = await crearSolicitud(base(), { almacen, hoy: HOY })
    const id = r1.ok ? r1.resultado.id! : ''
    const fila = (await almacen.buscarPorId(id))!
    await almacen.marcarOutbox(fila.outbox.id, { estado: 'pendiente', intentos: 0 })
    let envios = 0
    const enviar = async () => { envios++; return { ok: true as const, id: 're' } }
    const reciente = await reintentarOutbox(almacen, enviar)
    expect(reciente.intentos).toBe(0)
    const tarde = Date.now() + 11 * 60_000
    const bloqueado = await reintentarOutbox(almacen, enviar, 20, { remitente: 'onboarding@resend.dev', ahora: tarde })
    expect(bloqueado.omitidos).toBe(1)
    expect(envios).toBe(0)
    expect((await almacen.buscarPorId(id))?.outbox.estado).toBe('bloqueado_dominio')
  })

  it('no envía dos veces si otro proceso ya reclamó la fila', async () => {
    const almacen = almacenMemoria()
    await crearSolicitud(base(), { almacen, hoy: HOY, enviar: async () => ({ ok: false, error: 'x' }) })
    const original = almacen.reclamar.bind(almacen)
    almacen.reclamar = async () => false
    let envios = 0
    const r = await reintentarOutbox(almacen, async () => { envios++; return { ok: true, id: 're' } })
    expect(envios).toBe(0)
    expect(r.omitidos).toBe(1)
    almacen.reclamar = original
  })
})

describe('hallazgo 3: fallos del almacén', () => {
  function roto(parcial: Partial<Almacen>): Almacen {
    return { ...almacenMemoria(), ...parcial }
  }

  it('si crear falla, devuelve 503 almacen_no_disponible', async () => {
    const r = await crearSolicitud(base(), { almacen: roto({ crear: async () => { throw new Error('supabase_500') } }), hoy: HOY })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(503)
      expect(r.codigo).toBe('almacen_no_disponible')
      expect(r.error).toBe('No pude guardar la solicitud. Intenta de nuevo en un momento.')
    }
  })

  it('si buscar falla, también 503', async () => {
    const r = await crearSolicitud(base(), { almacen: roto({ buscar: async () => { throw new Error('supabase_500') } }), hoy: HOY })
    expect(!r.ok && r.status).toBe(503)
  })

  it('si solo falla marcarOutbox, responde éxito sin lanzar', async () => {
    const almacen = roto({ marcarOutbox: async () => { throw new Error('supabase_500') } })
    const enviado = await crearSolicitud(base(), { almacen, hoy: HOY, enviar: async () => ({ ok: true, id: 're' }) })
    expect(enviado.ok && enviado.resultado.persistido).toBe(true)
    expect(enviado.ok && enviado.resultado.comprobante).toBe('enviado')
    const fallido = await crearSolicitud(base(), { almacen, hoy: HOY, enviar: async () => ({ ok: false, error: 'x' }) })
    expect(fallido.ok && fallido.resultado.comprobante).toBe('pendiente')
    const sinCorreo = await crearSolicitud(base(), { almacen, hoy: HOY })
    expect(sinCorreo.ok && sinCorreo.resultado.comprobante).toBe('pendiente')
  })
})

describe('hallazgo 4: negocios del cliente', () => {
  const real = '11111111-1111-4111-8111-111111111111'
  const publicado: LugarPublico = {
    id: `business:${real}`, nombre: 'Posada Real', categoria: 'alojamiento', municipio: 'tenza',
    lat: 5.07, lon: -73.42, precision: 'exacta', descripcion: 'Descripción del servidor',
  }
  const entrada = (id: string, nombre: string) => ({
    ...base(),
    itinerario: {
      plan: 'cultura', municipio: 'tenza', hospedaje: id, dias: [{ paradas: [dtoMinimo().dias[0].paradas[0]], comida: null }],
      lugares: [{ id, nombre, municipio: 'tenza', categoria: 'alojamiento', lat: 5, lon: -73, descripcion: 'texto del atacante' }],
    },
  })

  it('rechaza un business inventado aunque el cliente mande su snapshot', () => {
    const falso = `business:${crypto.randomUUID()}`
    const v = validarSolicitud(entrada(falso, 'Inventado'), { hoy: HOY, empresas: [publicado] })
    // El id se descarta; el plan sigue siendo válido pero sin ese hospedaje.
    expect(v.ok && v.valor.itinerario.hospedaje).toBeNull()
    expect(v.ok && JSON.stringify(v.valor.itinerario)).not.toContain('Inventado')
  })

  it('rechaza paradas business: si no hay lista del servidor', () => {
    const solo = { ...entrada(`business:${real}`, 'Falso'), itinerario: { plan: 'cultura', municipio: 'tenza', hospedaje: null, dias: [{ paradas: [`business:${real}`], comida: null }], lugares: [] } }
    const v = validarSolicitud(solo, { hoy: HOY })
    expect(v.ok).toBe(false)
  })

  it('con uno publicado usa el nombre real, no el del cliente', () => {
    const v = validarSolicitud(entrada(publicado.id, 'Nombre Falso'), { hoy: HOY, empresas: [publicado] })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const texto = JSON.stringify(v.valor.itinerario)
    expect(v.valor.itinerario.hospedaje).toBe(publicado.id)
    expect(texto).toContain('Posada Real')
    expect(texto).not.toContain('Nombre Falso')
    expect(texto).not.toContain('texto del atacante')
  })
})

describe('hallazgo 5: origen del sitio sin cabeceras del cliente', () => {
  const pedido = new Request('http://localhost/api/solicitudes', {
    method: 'POST',
    headers: { host: 'evil.example', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'evil.example' },
  })
  const limpiar = () => { delete process.env.SITIO_URL; delete process.env.SITE_URL; delete process.env.VERCEL_PROJECT_PRODUCTION_URL }

  it('ignora Host y x-forwarded-*', () => {
    limpiar()
    expect(sitioDe(pedido)).toBe('')
    process.env.SITIO_URL = 'https://valle.example/'
    expect(sitioDe(pedido)).toBe('https://valle.example')
    expect(sitioDe(pedido)).not.toContain('evil')
  })

  it('orden: SITIO_URL, SITE_URL, VERCEL_PROJECT_PRODUCTION_URL', () => {
    limpiar()
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'valle.vercel.app'
    expect(siteUrl()).toBe('https://valle.vercel.app')
    process.env.SITE_URL = 'https://site.example/'
    expect(siteUrl()).toBe('https://site.example')
    process.env.SITIO_URL = 'https://sitio.example'
    expect(siteUrl()).toBe('https://sitio.example')
    expect(sitioDe()).toBe('https://sitio.example')
  })

  it('sin origen no pide fotos remotas', async () => {
    limpiar()
    const llamadas: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (u: string) => { llamadas.push(String(u)); return new Response('x') }) as never
    try {
      expect(await cargadorFotos(sitioDe(pedido))('fotos/999.jpg')).toBeNull()
    } finally { globalThis.fetch = original }
    expect(llamadas).toEqual([])
  })
})
