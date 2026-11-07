import { afterEach, describe, expect, it } from 'vitest'
import { LUGARES, metros, tieneUbicacion } from '../src/data/lugares.js'
import { almacenMemoria, almacenSupabase } from './almacen.js'
import { revisarAudio } from './audio.js'
import { htmlRecibo } from './correo.js'
import { openaiConfig, resendConfig, supabaseConfig } from './env.js'
import { ipCliente, crearLimite } from './http.js'
import { armarItinerario, validarPropuesta } from './itinerario.js'
import { crearSolicitud, reintentarOutbox } from './solicitud.js'
import type { ItinerarioDto } from './itinerario.js'

const envCopia = { ...process.env }
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in envCopia)) delete process.env[k]
  Object.assign(process.env, envCopia)
})

function lugar(pred: (l: (typeof LUGARES)[number]) => boolean) {
  const l = LUGARES.find(pred)
  if (!l) throw new Error('falta lugar de prueba')
  return l
}

describe('itinerario anclado al catálogo', () => {
  it('rechaza Guateque sin inventar ids ni llamar al modelo', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    let llamadas = 0
    const r = await armarItinerario({ mensaje: 'Quiero un fin de semana en Guateque' }, { fetchImpl: async () => { llamadas++; throw new Error('no debe llamar') } })
    expect(llamadas).toBe(0)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('fuera_de_catalogo')
  })

  it('arma en Chivor con ids reales y sin OpenAI', async () => {
    delete process.env.OPENAI_API_KEY
    const r = await armarItinerario({ mensaje: 'dos días de naturaleza en Chivor', chips: { plan: 'aventura', municipio: 'chivor', dias: 2 } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.itinerario.modo).toBe('demo')
    expect(r.itinerario.modelo).toBeNull()
    const ids = new Set(LUGARES.map((l) => l.id))
    for (const l of r.itinerario.lugares) {
      expect(ids.has(l.id)).toBe(true)
      expect(l.nombre.toLowerCase()).not.toContain('guateque')
    }
    expect(r.itinerario.avisos.some((a) => a.includes('esquema') || a.includes('línea recta') || a.includes('carretera'))).toBe(true)
  })

  it('acota días, paradas y descarta ids y precios ajenos al catálogo', () => {
    const a = lugar((l) => l.municipio === 'tenza' && tieneUbicacion(l) && l.categoria !== 'alojamiento')
    const b = lugar((l) => l.municipio === 'guayata' && tieneUbicacion(l) && l.id !== a.id)
    const comida = lugar((l) => l.categoria === 'restaurante')
    const lejos = metros([a.lat!, a.lon!], [b.lat!, b.lon!]) > 8000
    const r = validarPropuesta({
      plan: 'cultura',
      municipio: 'tenza',
      hospedaje: 'guateque-hotel-inventado',
      precio: 999999,
      dias: [
        { paradas: [a.id, b.id, a.id, 'no-existe', comida.id], comida: comida.id },
        { paradas: [b.id], comida: null },
        { paradas: [a.id], comida: null },
        { paradas: [b.id], comida: null },
      ],
    } as never)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dto.dias.length).toBeLessThanOrEqual(3)
    expect(r.dto.dias[0].paradas.length).toBeLessThanOrEqual(3)
    expect(r.dto.hospedaje).toBeNull()
    expect(JSON.stringify(r.dto)).not.toContain('999999')
    expect(r.dto.avisos.some((a) => a.includes('catálogo'))).toBe(true)
    if (lejos) expect(r.dto.avisos.some((a) => a.includes('línea recta'))).toBe(true)
  })

  it('valida la respuesta del modelo y no manda datos personales', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.OPENAI_ITINERARY_MODEL = 'gpt-6-luna'
    const parada = lugar((l) => l.municipio === 'chivor' && tieneUbicacion(l) && !!l.plan)
    const cuerpos: string[] = []
    const fetchImpl: typeof fetch = async (_url, init) => {
      cuerpos.push(String(init?.body ?? ''))
      if (cuerpos.length === 1) {
        return new Response(JSON.stringify({
          id: 'resp_1',
          output: [{ type: 'function_call', name: 'buscar_lugares', call_id: 'call_1', arguments: '{"municipio":"chivor","categoria":null,"texto":null}' }],
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        id: 'resp_2',
        output_text: JSON.stringify({ plan: 'aventura', municipio: 'chivor', hospedaje: null, dias: [{ paradas: [parada.id, 'id-falso'], comida: null }] }),
      }), { status: 200 })
    }
    const r = await armarItinerario({ mensaje: 'Aventura en Chivor. Mi correo es ana@example.com y mi cel es 3001234567' }, { fetchImpl })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.itinerario.modo).toBe('openai')
    expect(r.itinerario.modelo).toBe('gpt-6-luna')
    expect(r.itinerario.lugares.map((l) => l.id)).toContain(parada.id)
    expect(r.itinerario.lugares.map((l) => l.id)).not.toContain('id-falso')
    expect(cuerpos.join('\n')).not.toContain('ana@example.com')
    expect(cuerpos.join('\n')).not.toContain('3001234567')
    expect(cuerpos[0]).toContain('[correo]')
  })
})

describe('solicitud, correo e idempotencia', () => {
  function dtoMinimo(): ItinerarioDto {
    const parada = lugar((l) => tieneUbicacion(l) && l.municipio === 'tenza')
    const v = validarPropuesta({ plan: 'cultura', municipio: 'tenza', hospedaje: null, dias: [{ paradas: [parada.id], comida: null }] })
    if (!v.ok) throw new Error(v.error)
    return { ...v.dto, modo: 'demo', modelo: null, resumen: 'resumen' }
  }

  const base = () => ({
    idempotencyKey: crypto.randomUUID(),
    nombre: 'Ana <script>',
    correo: 'ana@example.com',
    fecha: '2026-12-01',
    personas: 2,
    nota: '',
    itinerario: dtoMinimo(),
  })

  it('no guarda ni envía si Supabase no está', async () => {
    let envios = 0
    const r = await crearSolicitud(base(), { almacen: null, hoy: '2026-11-06', enviar: async () => { envios++; return { ok: true, id: 'x' } } })
    expect(r.ok && r.resultado.persistido).toBe(false)
    expect(r.ok && r.resultado.comprobante).toBe('no_enviado')
    expect(envios).toBe(0)
  })

  it('persiste antes de enviar y no repite el correo', async () => {
    const eventos: string[] = []
    const almacen = almacenMemoria(eventos)
    let envios = 0
    const entrada = base()
    const enviar = async () => { eventos.push('correo'); envios++; return { ok: true as const, id: 're_demo' } }
    const r1 = await crearSolicitud(entrada, { almacen, hoy: '2026-11-06', enviar })
    expect(eventos).toEqual(['itinerario', 'solicitud', 'outbox', 'correo'])
    expect(r1.ok && r1.resultado.persistido && r1.resultado.comprobante).toBe('enviado')
    const r2 = await crearSolicitud(entrada, { almacen, hoy: '2026-11-06', enviar })
    expect(envios).toBe(1)
    expect(r2.ok && r2.resultado.nueva).toBe(false)
  })

  it('si el correo falla, la solicitud queda guardada', async () => {
    const almacen = almacenMemoria()
    const r = await crearSolicitud(base(), { almacen, hoy: '2026-11-06', enviar: async () => { throw new Error('red') } })
    expect(r.ok && r.resultado.persistido).toBe(true)
    expect(r.ok && r.resultado.comprobante).toBe('fallido')
    const otra = await reintentarOutbox(almacen, async () => ({ ok: true, id: 're_reintento' }))
    expect(otra.enviados).toBe(1)
  })

  it('escapa el nombre en la plantilla fija', () => {
    const html = htmlRecibo({
      ejemplo: false, codigo: 'ABC12345', nombre: 'Ana <script>', fecha: '2026-12-01', personas: 2, nota: '',
      preferencia: 'Cultura', municipio: 'Tenza', paradas: [{ n: 1, nombre: 'Parque', municipio: 'Tenza', rol: 'Parada', lat: null, lon: null, fuente: 'Catálogo' }],
    })
    expect(html).toContain('Ana &lt;script&gt;')
    expect(html).toContain('Solicitud recibida, pendiente de confirmación')
    expect(html).not.toContain('<script>')
  })
})

describe('configuración, audio y límites', () => {
  it('ignora variables VITE_ y no marca proveedores sin claves de servidor', () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.RESEND_API_KEY
    process.env.VITE_OPENAI_API_KEY = 'no-usar'
    process.env.VITE_SUPABASE_URL = 'https://ejemplo.supabase.co'
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = 'no-usar'
    expect(openaiConfig().configurado).toBe(false)
    expect(supabaseConfig().configurado).toBe(false)
    expect(resendConfig().configurado).toBe(false)
  })

  it('habla con Supabase solo con la service role y el RPC', async () => {
    process.env.SUPABASE_URL = 'https://ejemplo.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
    let auth = ''
    let url = ''
    const fetchImpl: typeof fetch = async (input, init) => {
      url = String(input)
      auth = new Headers(init?.headers).get('authorization') ?? ''
      return new Response(JSON.stringify({
        id: 'sol', idempotency_key: 'k', nombre: 'Ana', correo: 'ana@example.com', telefono: null,
        fecha: '2026-12-01', personas: 2, nota: null, itinerario: {},
        outbox: { id: 'out', idempotency_key: 'recibo:sol', estado: 'pendiente', provider_id: null, intentos: 0, ultimo_error: null, destinatario: 'ana@example.com' },
      }), { status: 200 })
    }
    await almacenSupabase(fetchImpl).crear({
      idempotencyKey: crypto.randomUUID(), nombre: 'Ana', correo: 'ana@example.com', telefono: null,
      fecha: '2026-12-01', personas: 2, nota: null,
      itinerario: { modo: 'demo', modelo: null, plan: 'cultura', municipio: 'tenza', dias: [], hospedaje: null, avisos: [], resumen: '', esquematico: true, lugares: [] },
    })
    expect(url).toContain('/rpc/crear_solicitud')
    expect(auth).toBe('Bearer service-role-test')
  })

  it('rechaza audio grande o de tipo incorrecto y acepta webm pequeño', () => {
    expect(revisarAudio('audio/webm', 1000).ok).toBe(true)
    expect(revisarAudio('text/plain', 1000).ok).toBe(false)
    const grande = revisarAudio('audio/webm', 3_500_001)
    expect(grande.ok).toBe(false)
    if (!grande.ok) expect(grande.status).toBe(413)
  })

  it('toma la última IP de X-Forwarded-For y limita', () => {
    const req = new Request('http://local', { headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } })
    expect(ipCliente(req)).toBe('2.2.2.2')
    const limite = crearLimite({ max: 2, ventanaMs: 1000 })
    expect(limite('a', 0)).toBe(false)
    expect(limite('a', 10)).toBe(false)
    expect(limite('a', 20)).toBe(true)
  })
})
