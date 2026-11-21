import { afterEach, describe, expect, it } from 'vitest'
import { POST } from '../api/agente.js'
import { LUGARES, MUNICIPIOS } from '../src/data/lugares.js'
import { leerGustosLocal } from '../src/data/gustos.js'
import { GUSTOS_VACIOS, fusionarGustos, normalizarGustos } from '../shared/gustos.js'
import type { Gustos } from '../shared/gustos.js'
import { responderAgente } from './agente.js'
import { itinerarioLocal } from './itinerario.js'
import { candidatosRecomendacion, recomendar } from './recomendar.js'

const envCopia = { ...process.env }
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in envCopia)) delete process.env[k]
  Object.assign(process.env, envCopia)
})

const respuesta = (cuerpo: unknown) => ({ ok: true, status: 200, json: async () => cuerpo }) as unknown as Response
function simulado(...cuerpos: unknown[]) {
  const bodies: string[] = []
  let i = 0
  const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body))
    return respuesta(cuerpos[Math.min(i++, cuerpos.length - 1)])
  }) as typeof fetch
  return { fetchImpl, bodies }
}
const vacios = { intereses: [], ritmo: null, presupuesto: null, conNinos: null, mascotas: null, movilidadReducida: null, evitar: [], municipio: null }
const salida = (texto: string, det: Partial<Gustos> = {}) => ({ output_text: JSON.stringify({ texto, links: [], gustos_detectados: { ...vacios, ...det } }) })
const llamada = (args: unknown) => ({ id: 'r1', output: [{ type: 'function_call', name: 'recomendar_lugares', call_id: 'c1', arguments: JSON.stringify(args) }] })

describe('agente con gustos', () => {
  it('recomendar_lugares devuelve ids reales con ruta válida y sin datos de contacto', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const { fetchImpl, bodies } = simulado(
      llamada({ gustos: { ...vacios, intereses: ['gastronomia'] }, municipio: null }),
      salida('Te sugiero comer allí.'),
    )
    const r = await responderAgente({ pregunta: 'recomiéndame dónde comer' }, { fetchImpl })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const rec = r.respuesta.recomendaciones!
    expect(rec.length).toBeGreaterThan(0)
    expect(rec.length).toBeLessThanOrEqual(4)
    for (const x of rec) {
      expect(LUGARES.some((l) => l.id === x.id)).toBe(true)
      expect(x.ruta).toBe(`/lugares/${x.id}`)
      expect(x.razones.length).toBeGreaterThan(0)
    }
    expect(bodies[1]).toContain('function_call_output')
    const salidaHerramienta = JSON.parse(JSON.parse(bodies[1]).input[0].output) as Record<string, unknown>[]
    for (const x of salidaHerramienta) expect(Object.keys(x).sort()).toEqual(['categoria', 'id', 'municipio', 'nombre', 'razones'])
    expect(bodies[0]).toContain('recomendar_lugares')
  })

  it('un id inventado por el modelo no llega a recomendaciones', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const { fetchImpl } = simulado(
      { output_text: JSON.stringify({ texto: 'Ve a este', links: [{ etiqueta: 'X', ruta: '/lugares/inventado-123', ancla: null }], gustos_detectados: vacios }) },
    )
    const r = await responderAgente({ pregunta: 'recomiéndame algo de naturaleza', gustos: { intereses: ['naturaleza'] } }, { fetchImpl })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(JSON.stringify(r.respuesta)).not.toContain('inventado-123')
    for (const x of r.respuesta.recomendaciones ?? []) expect(LUGARES.some((l) => l.id === x.id)).toBe(true)
  })

  it('fusiona los gustos entrantes con los detectados en este mensaje', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const { fetchImpl } = simulado(salida('Va', { intereses: ['cultura'], presupuesto: 'bajo' }))
    const r = await responderAgente({ pregunta: 'hola', gustos: { intereses: ['naturaleza'], ritmo: 'tranquilo' } }, { fetchImpl })
    expect(r.ok && r.respuesta.gustos).toMatchObject({ intereses: ['naturaleza', 'cultura'], ritmo: 'tranquilo', presupuesto: 'bajo' })
  })

  it('normaliza gustos basura del navegador', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const { fetchImpl, bodies } = simulado(salida('Ok'))
    const basura = { intereses: ['hackeo', 'cultura', 5], ritmo: 'veloz', presupuesto: 9, conNinos: 'si', evitar: ['x'.repeat(200), '<script>', 'ruido', 'a', 'b', 'c', 'd', 'e', 'f'], municipio: 'marte' }
    const r = await responderAgente({ pregunta: 'hola', gustos: basura }, { fetchImpl })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const g = r.respuesta.gustos!
    expect(g.intereses).toEqual(['cultura'])
    expect(g.ritmo).toBeNull()
    expect(g.presupuesto).toBeNull()
    expect(g.conNinos).toBeNull()
    expect(g.municipio).toBeNull()
    expect(g.evitar.length).toBeLessThanOrEqual(5)
    expect(bodies[0]).not.toContain('marte')
    expect(bodies[0]).not.toContain('hackeo')
  })

  it('sin llave: 503 con gustos y recomendaciones locales, vía handler', async () => {
    delete process.env.OPENAI_API_KEY
    const res = await POST(new Request('http://localhost/api/agente', {
      method: 'POST',
      headers: { 'x-real-ip': 'test-gustos-503' },
      body: JSON.stringify({ pregunta: 'quiero comer rico en Tenza', gustos: { intereses: ['cultura'] }, }),
    }))
    expect(res.status).toBe(503)
    const j = await res.json()
    expect(j.error).toBe('no_configurado')
    expect(j.gustos.intereses).toEqual(expect.arrayContaining(['cultura', 'gastronomia']))
    expect(j.gustos.municipio).toBe('tenza')
    expect(Array.isArray(j.recomendaciones)).toBe(true)
    expect(j.recomendaciones.length).toBeLessThanOrEqual(4)
    for (const x of j.recomendaciones) expect(x.ruta).toBe(`/lugares/${x.id}`)
  })

  it('en 502 también adjunta gustos locales', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const falla = (async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response) as typeof fetch
    const r = await responderAgente({ pregunta: 'busco naturaleza' }, { fetchImpl: falla })
    expect(!r.ok && r.status).toBe(502)
    if (!r.ok) expect(r.gustos?.intereses).toContain('naturaleza')
  })

  it('calcula recomendaciones si el modelo no usó la herramienta pero piden qué hacer', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const { fetchImpl } = simulado(salida('Mira', { intereses: ['naturaleza'] }))
    const r = await responderAgente({ pregunta: '¿qué hacer por aquí?' }, { fetchImpl })
    expect(r.ok && r.respuesta.recomendaciones!.length).toBeGreaterThan(0)
  })

  it('ningún teléfono ni correo de la pregunta llega a OpenAI', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const { fetchImpl, bodies } = simulado(salida('Listo'))
    await responderAgente({ pregunta: 'recomienda algo, soy ana@correo.com o 3101234567', gustos: { intereses: ['cultura'] } }, { fetchImpl })
    expect(bodies.join('')).not.toContain('ana@correo.com')
    expect(bodies.join('')).not.toContain('3101234567')
  })

  it('el prompt incluye los gustos ya conocidos', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const { fetchImpl, bodies } = simulado(salida('Ok'))
    await responderAgente({ pregunta: 'hola', gustos: { intereses: ['artesania'] } }, { fetchImpl })
    expect(bodies[0]).toContain('Artesanía')
  })
})

describe('itinerario local con gustos', () => {
  it('es determinista y evita lo que la persona quiere evitar', () => {
    const g = normalizarGustos({ intereses: ['naturaleza'], evitar: ['iglesia'] }, MUNICIPIOS.map((m) => m.slug))
    const a = itinerarioLocal({ plan: 'cultura', municipio: 'tenza', dias: 2 }, [], g)
    const b = itinerarioLocal({ plan: 'cultura', municipio: 'tenza', dias: 2 }, [], g)
    expect(a).toEqual(b)
    expect(a).not.toBeNull()
    for (const l of a!.lugares) expect(l.nombre.toLowerCase()).not.toContain('iglesia')
  })
})

describe('evaluación local: 15 frases', () => {
  const nombres = MUNICIPIOS.map((m) => ({ slug: m.slug, nombre: m.nombre }))
  const slugs = nombres.map((m) => m.slug)
  const frases = [
    'voy con mis hijos y queremos naturaleza tranquila',
    `algo barato para comer en ${nombres[0].nombre}`,
    'me encantan las artesanías y la historia',
    'quiero aventura, nada de iglesias',
    'viajo con mi perro',
    'mi abuela usa silla de ruedas',
    'un plan sin prisa para tomar fotos al atardecer',
    'queremos un viaje activo y full aventura',
    'quiero algo de lujo, sin importar el precio',
    `queremos ahorrar y comer platos típicos en ${nombres[1].nombre}`,
    'no me gusta el frío y prefiero la gastronomía',
    'quiero descansar y desconectar en las termales',
    'queremos ver cascadas y ríos, nada de museos',
    `cultura y museos en ${nombres[2].nombre}`,
    'no me gustan las caminatas, quiero comer bien',
  ]

  it('todo id existe, se respeta evitar y el municipio pedido', async () => {
    const candidatos = await candidatosRecomendacion((async () => { throw new Error('sin red') }) as typeof fetch)
    const ids = new Set(LUGARES.map((l) => l.id))
    expect(frases).toHaveLength(15)
    for (const f of frases) {
      const g: Gustos = fusionarGustos(GUSTOS_VACIOS, normalizarGustos(leerGustosLocal(f, nombres), slugs))
      const rec = recomendar(candidatos, g, 4)
      expect(rec.length, f).toBeLessThanOrEqual(4)
      for (const r of rec) {
        expect(ids.has(r.id), `${f} -> ${r.id}`).toBe(true)
        const l = candidatos.find((c) => c.id === r.id)!
        const texto = `${l.nombre} ${l.descripcion ?? ''}`.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
        for (const e of g.evitar) expect(texto.includes(e), `${f}: evita ${e} en ${l.nombre}`).toBe(false)
      }
      if (g.municipio) {
        const enMun = candidatos.filter((c) => c.municipio === g.municipio).length
        if (enMun >= 4 && rec.length) {
          const propios = rec.filter((r) => r.municipio === g.municipio).length
          expect(propios, f).toBe(rec.length)
        }
      }
    }
  })
})
