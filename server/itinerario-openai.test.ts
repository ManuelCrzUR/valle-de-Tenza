import { describe, expect, it } from 'vitest'
import { LUGARES, tieneUbicacion } from '../src/data/lugares.js'
import type { LugarPublico } from './catalogo.js'
import { armarItinerario } from './itinerario.js'

const LINA: LugarPublico = {
  id: 'business:5aaf2cf4-d73a-4ea3-989a-e904b97e1954',
  nombre: 'La comida de lina y sofia',
  categoria: 'restaurante',
  municipio: 'tenza',
  lat: 5.078,
  lon: -73.396,
  precision: 'exacta',
  descripcion: 'Restaurante publicado en Tenza',
}

function paradaTenza() {
  const l = LUGARES.find((x) => x.municipio === 'tenza' && tieneUbicacion(x) && x.categoria !== 'restaurante' && x.categoria !== 'alojamiento')
  if (!l) throw new Error('falta parada')
  return l
}

function plan(paradaId: string) {
  return { plan: 'gastro', municipio: 'tenza', hospedaje: null, dias: [{ paradas: [`place:${paradaId}`], comida: LINA.id }] }
}

describe('itinerario de OpenAI con el restaurante publicado', () => {
  it('acepta el JSON cuando viene en content.type text y conserva place: y business:', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const parada = paradaTenza()
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
      id: 'resp_1',
      output: [{ type: 'message', content: [{ type: 'text', text: JSON.stringify(plan(parada.id)) }] }],
    }), { status: 200 })
    const r = await armarItinerario(
      { mensaje: 'quiero comer La comida de lina y sofia en Tenza', chips: { plan: 'gastro', municipio: 'tenza', dias: 1 } },
      { fetchImpl, empresas: [LINA] },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.itinerario.modo).toBe('openai')
    expect(r.itinerario.dias[0].paradas).toContain(parada.id)
    expect(r.itinerario.dias[0].comida).toBe(LINA.id)
    expect(r.itinerario.lugares.map((l) => l.nombre)).toContain(LINA.nombre)
  })

  it('recupera un JSON cercado y no etiqueta como IA un id inventado', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const parada = paradaTenza()
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
      output_text: '```json\n' + JSON.stringify(plan(parada.id)) + '\n```',
    }), { status: 200 })
    const bueno = await armarItinerario({ mensaje: 'comer en Tenza' }, { fetchImpl, empresas: [LINA] })
    expect(bueno.ok && bueno.itinerario.dias[0].comida).toBe(LINA.id)

    const falso: typeof fetch = async () => new Response(JSON.stringify({
      output_text: JSON.stringify({ plan: 'gastro', municipio: 'tenza', hospedaje: null, dias: [{ paradas: ['restaurante-inventado'], comida: null }] }),
    }), { status: 200 })
    const malo = await armarItinerario({ mensaje: 'comer en Tenza' }, { fetchImpl: falso, empresas: [LINA] })
    expect(malo.ok).toBe(false)
    if (!malo.ok) {
      expect(malo.status).toBe(422)
      expect(malo.mensaje).toContain('inventados')
    }
  })

  it('distingue el error HTTP y no copia el cuerpo ni la clave', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const errores: string[] = []
    const original = console.error
    console.error = (m?: unknown) => { errores.push(String(m ?? '')) }
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ error: { code: 'server_error', message: 'sk-supersecreto' } }), { status: 500 })
    const r = await armarItinerario({ mensaje: 'comer en Tenza' }, { fetchImpl, empresas: [LINA] })
    console.error = original
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.detalle).toBe('http_500:server_error')
      expect(r.mensaje).toContain('http_500:server_error')
      expect(r.mensaje).not.toContain('sk-supersecreto')
      expect(r.ref).toMatch(/^[0-9a-f]{8}$/)
      expect(JSON.stringify(r)).not.toContain('sk-supersecreto')
    }
    expect(errores.join('\n')).toContain('itinerario_openai')
    expect(errores.join('\n')).not.toContain('sk-supersecreto')
    expect(errores.join('\n')).not.toContain('comer en Tenza')
  })

  it('reintenta una sola vez un http 400 y luego arma el plan', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const parada = paradaTenza()
    const cuerpos: string[] = []
    let n = 0
    const fetchImpl: typeof fetch = async (_u, init) => {
      cuerpos.push(String(init?.body ?? ''))
      n++
      if (n === 1) return new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'reasoning' } }), { status: 400 })
      return new Response(JSON.stringify({ output_text: JSON.stringify(plan(parada.id)) }), { status: 200 })
    }
    const r = await armarItinerario({ mensaje: 'comer en Tenza' }, { fetchImpl, empresas: [LINA] })
    expect(n).toBe(2)
    expect(cuerpos[0]).toContain('reasoning')
    expect(cuerpos[1]).not.toContain('reasoning')
    expect(r.ok && r.itinerario.lugares.some((l) => l.id === LINA.id)).toBe(true)
  })

  it('si OpenAI no manda itinerario, el mensaje pide reintentar y no dice que fue la IA', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ status: 'incomplete', output: [] }), { status: 200 })
    const r = await armarItinerario({ mensaje: 'comer en Tenza' }, { fetchImpl, empresas: [LINA] })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.detalle).toBe('incompleto')
      expect(r.mensaje).toContain('cortada')
      expect(r.mensaje).toContain('Pulsa Armar el plan otra vez')
      expect(r.mensaje).toContain('No lo reemplacé')
    }
  })
})
