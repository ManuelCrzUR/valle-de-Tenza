import { afterEach, describe, expect, it } from 'vitest'
import { CATEGORIAS, LUGARES, MUNICIPIOS, getLugar, tieneUbicacion } from '../src/data/lugares.js'
import { idPublicoEstatico } from '../shared/ids.js'
import { almacenMemoria } from './almacen.js'
import { buscarLugares } from './catalogo.js'
import { filaAPublico, listarFichasPublicas, puedeGestionar, puedeVer } from './empresas.js'
import { openaiConfig } from './env.js'
import { crearLimite, ipCliente, json } from './http.js'
import { validarPropuesta } from './itinerario.js'
import { crearSolicitud } from './solicitud.js'
import { puertaEnvio } from './puerta.js'
import { sinDatosPersonales } from './texto.js'
import type { LugarPublico } from './catalogo.js'

const envCopia = { ...process.env }
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in envCopia)) delete process.env[k]
  Object.assign(process.env, envCopia)
})

function parada() {
  const l = LUGARES.find((x) => tieneUbicacion(x) && x.municipio === 'tenza' && x.categoria !== 'alojamiento')
  if (!l) throw new Error('falta parada')
  return l
}

function dtoMinimo() {
  const v = validarPropuesta({ plan: 'cultura', municipio: 'tenza', hospedaje: null, dias: [{ paradas: [parada().id], comida: null }] })
  if (!v.ok) throw new Error(v.error)
  return { ...v.dto, modo: 'demo' as const, modelo: null, resumen: 'resumen' }
}

describe('contratos que el asistente flotante importa', () => {
  it('conserva http, openai, texto, buscarLugares y lugares', () => {
    const limite = crearLimite({ max: 1, ventanaMs: 1000 })
    expect(limite('10.0.0.1', 0)).toBe(false)
    expect(limite('10.0.0.1', 10)).toBe(true)
    expect(ipCliente(new Request('http://local', { headers: { 'x-real-ip': '9.9.9.9' } }))).toBe('9.9.9.9')
    expect(json({ ok: true }).headers.get('content-type')).toContain('application/json')
    const ai = openaiConfig()
    expect(typeof ai.modeloItinerario).toBe('string')
    expect(typeof ai.configurado).toBe('boolean')
    expect(sinDatosPersonales('ana@example.com')).toContain('[correo]')
    const lista = buscarLugares({ municipio: 'tenza', limite: 3 })
    expect(lista.length).toBeGreaterThan(0)
    expect(lista.every((l) => !l.id.startsWith('business:'))).toBe(true)
    expect(MUNICIPIOS).toHaveLength(7)
    expect(CATEGORIAS.length).toBeGreaterThan(0)
    const id = LUGARES[0].id
    expect(getLugar(id)?.id).toBe(id)
    expect(getLugar(idPublicoEstatico(id))?.id).toBe(id)
    expect(getLugar('business:11111111-1111-4111-8111-111111111111')).toBeUndefined()
  })
})

describe('ids de catálogo y empresas', () => {
  it('acepta el id estático viejo y el prefijo place:, y una empresa publicada', () => {
    const estatico = parada()
    const legado = validarPropuesta({ plan: 'cultura', municipio: 'tenza', hospedaje: null, dias: [{ paradas: [estatico.id], comida: null }] })
    const prefijo = validarPropuesta({ plan: 'cultura', municipio: 'tenza', hospedaje: null, dias: [{ paradas: [`place:${estatico.id}`], comida: null }] })
    expect(legado.ok && legado.dto.lugares.map((l) => l.id)).toEqual([estatico.id])
    expect(prefijo.ok && prefijo.dto.lugares.map((l) => l.id)).toEqual([estatico.id])
    const empresa: LugarPublico = {
      id: 'business:11111111-1111-4111-8111-111111111111',
      nombre: 'Cafe del puente',
      categoria: 'restaurante',
      municipio: 'tenza',
      lat: 5.07,
      lon: -73.42,
      precision: 'exacta',
      descripcion: 'Cafe publicado por su titular',
    }
    const conEmpresa = validarPropuesta({
      plan: 'gastro', municipio: 'tenza', hospedaje: null,
      dias: [{ paradas: [estatico.id], comida: empresa.id }],
    }, [], [empresa])
    expect(conEmpresa.ok && conEmpresa.dto.dias[0].comida).toBe(empresa.id)
    expect(conEmpresa.ok && conEmpresa.dto.lugares.some((l) => l.id === empresa.id)).toBe(true)
    const ajena = validarPropuesta({
      plan: 'gastro', municipio: 'tenza', hospedaje: null,
      dias: [{ paradas: ['business:22222222-2222-4222-8222-222222222222'], comida: null }],
    }, [], [empresa])
    expect(ajena.ok).toBe(false)
  })

  it('separa a dos titulares', () => {
    expect(puedeGestionar('dueño-a', 'dueño-a')).toBe(true)
    expect(puedeGestionar('dueño-a', 'dueño-b')).toBe(false)
    expect(puedeGestionar(null, 'dueño-b')).toBe(false)
    expect(puedeVer('published', null, 'dueño-b')).toBe(true)
    expect(puedeVer('draft', 'dueño-a', 'dueño-b')).toBe(false)
    expect(puedeVer('draft', 'dueño-b', 'dueño-b')).toBe(true)
    const fila = filaAPublico({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Cafe',
      category: 'restaurante',
      municipality: 'tenza',
      description: 'Una descripcion publica del cafe',
      lat: 5,
      lng: -73,
    })
    expect(fila?.id).toBe('business:11111111-1111-4111-8111-111111111111')
    expect(filaAPublico({ ...{
      id: '11111111-1111-4111-8111-111111111111', name: 'X', category: 'cajero', municipality: 'tenza', description: 'no entra', lat: 1, lng: 1,
    } })).toBeNull()
  })
})

describe('puerta de correo', () => {
  it('no sustituye el correo del formulario cuando el remitente es de prueba', async () => {
    expect(puertaEnvio('Valle <onboarding@resend.dev>', 'persona@example.com', 'cuenta@resend.dev').ok).toBe(false)
    expect(puertaEnvio('onboarding@resend.dev', 'cuenta@resend.dev', 'cuenta@resend.dev').ok).toBe(true)
    expect(puertaEnvio('Valle Directo <planes@valle.example>', 'persona@example.com', '').ok).toBe(true)

    const almacen = almacenMemoria()
    let envios = 0
    const bloqueado = await crearSolicitud({
      idempotencyKey: crypto.randomUUID(),
      nombre: 'Ana',
      correo: 'persona@example.com',
      fecha: '2026-12-01',
      personas: 2,
      nota: '',
      itinerario: dtoMinimo(),
    }, {
      almacen,
      hoy: '2026-11-06',
      remitente: 'onboarding@resend.dev',
      destinatarioPrueba: 'cuenta@resend.dev',
      enviar: async () => { envios++; return { ok: true, id: 'no' } },
    })
    expect(envios).toBe(0)
    expect(bloqueado.ok && bloqueado.resultado.comprobante).toBe('bloqueado_dominio')
    expect(bloqueado.ok && bloqueado.resultado.persistido).toBe(true)
    const guardada = bloqueado.ok && bloqueado.resultado.id ? await almacen.buscarPorId(bloqueado.resultado.id) : null
    expect(guardada?.correo).toBe('persona@example.com')
    expect(guardada?.outbox.estado).toBe('bloqueado_dominio')

    let destino = ''
    const permitido = await crearSolicitud({
      idempotencyKey: crypto.randomUUID(),
      nombre: 'Ana',
      correo: 'cuenta@resend.dev',
      fecha: '2026-12-01',
      personas: 2,
      nota: '',
      itinerario: dtoMinimo(),
    }, {
      almacen,
      hoy: '2026-11-06',
      remitente: 'onboarding@resend.dev',
      destinatarioPrueba: 'cuenta@resend.dev',
      enviar: async (fila) => { destino = fila.correo; return { ok: true, id: 're_demo' } },
    })
    expect(destino).toBe('cuenta@resend.dev')
    expect(permitido.ok && permitido.resultado.comprobante).toBe('enviado')
  })

  it('lista solo publicados y arma la portada sin llamar a un proveedor real', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
    const id = '11111111-1111-4111-8111-111111111111'
    const urls: string[] = []
    const r = await listarFichasPublicas(async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('business_photos')) {
        return new Response(JSON.stringify([{ business_id: id, storage_path: `${id}/${id}/foto.jpg` }]), { status: 200 })
      }
      return new Response(JSON.stringify([{
        id, name: 'Cafe', category: 'restaurante', municipality: 'tenza',
        description: 'Descripcion publica suficiente', contact: 'mesa', lat: 5.1, lng: -73.4,
      }]), { status: 200 })
    })
    expect(urls[0]).toContain('/rest/v1/businesses_public')
    expect(urls[0]).not.toContain('/rest/v1/businesses?')
    expect(r.configurado).toBe(true)
    expect(r.negocios).toHaveLength(1)
    expect(r.negocios[0].id).toBe(`business:${id}`)
    expect(r.negocios[0].coverUrl).toContain(`${id}/${id}/foto.jpg`)
  })
})
