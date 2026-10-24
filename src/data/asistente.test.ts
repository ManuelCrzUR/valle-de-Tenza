import { describe, expect, it } from 'vitest'
import { responder, detectarFecha } from './asistente'
import type { Contexto, DatosVivos } from './asistente'
import { LUGARES } from './lugares'
import type { Negocio, Operacion } from '../state/reservas'
import type { RutaTransporte } from '../state/logistica'

// «Hoy» fijo: miércoles 21 de octubre de 2026 (mediodía, hora local).
const AHORA = new Date(2026, 9, 21, 12, 0)
const HOY = '2026-10-21'

const hotel = LUGARES.find((l) => l.categoria === 'alojamiento' && l.municipio === 'almeida')!
const negocio: Negocio = {
  id: 'n1', lugarId: hotel.id, nombre: hotel.nombre, tipo: 'hotel', municipio: 'almeida', cupoDiario: 4,
  descripcion: '', verificado: true, cupoActualizado: AHORA.toISOString(),
}
const operacion = (extra: Partial<Operacion> = {}): Operacion => ({ negocios: [negocio], cupos: [], ocupacion: [], cargando: false, sinConexion: false, ...extra })
const vivos = (extra: Partial<DatosVivos> = {}): DatosVivos => ({ rutas: [], alertas: [], clima: [], tramoEntre: () => undefined, ahora: AHORA, ...extra })
const ctx = (v: Partial<DatosVivos> = {}, op: Operacion = operacion()): Contexto => ({ operacion: op, vivos: vivos(v) })

const ruta = (extra: Partial<RutaTransporte> = {}): RutaTransporte => ({
  id: 'r1', origen: 'Bogotá', destino: 'Guateque', empresa: 'Flota Prueba', modo: 'bus', terminal: null, duracionMin: null,
  precioDesdeCop: null, notas: null, fuente: null, verificadoEn: null, activa: true,
  salidas: [{ id: 's1', hora: '06:00', dias: [1, 2, 3, 4, 5, 6, 7] }], ...extra,
})

describe('cupo real', () => {
  it('reservar usa el cupo libre de hoy', async () => {
    const r = await responder(`quiero reservar ${hotel.nombre} en Almeida`, ctx({}, operacion({ ocupacion: [{ negocio_id: 'n1', fecha: HOY, personas: 1 }] })))
    expect(r.texto).toContain('Cupo libre hoy: 3')
  })
  it('sin cupo lo dice explícitamente', async () => {
    const r = await responder(`quiero reservar ${hotel.nombre} en Almeida`, ctx({}, operacion({ cupos: [{ negocio_id: 'n1', fecha: HOY, cupo: null, cerrado: true }] })))
    expect(r.texto).toMatch(/No tiene cupo libre hoy/)
  })
  it('entiende «mañana» y consulta esa fecha', async () => {
    const r = await responder(`reservar ${hotel.nombre} mañana`, ctx({}, operacion({ ocupacion: [{ negocio_id: 'n1', fecha: '2026-10-22', personas: 4 }] })))
    expect(r.texto).toMatch(/No tiene cupo libre el .*22 de octubre/)
  })
  it('hospedaje en un municipio muestra el cupo en la tarjeta', async () => {
    const r = await responder('hospedaje cerca de Almeida', ctx())
    expect(r.tarjetas?.some((t) => /cupo|sin prestador/.test(t.detalle))).toBe(true)
  })
  it('detectarFecha: sábado y el 25', () => {
    expect(detectarFecha('el sabado', AHORA)?.fecha).toBe('2026-10-24')
    expect(detectarFecha('el 25', AHORA)?.fecha).toBe('2026-10-25')
    expect(detectarFecha('hola', AHORA)).toBeUndefined()
  })
})

describe('cómo llego', () => {
  it('sin ruta verificada responde «por confirmar»', async () => {
    const r = await responder('¿cómo llego desde Bogotá?', ctx({ rutas: [ruta()] }))
    expect(r.texto).toContain('Flota Prueba')
    expect(r.texto).toMatch(/terminal por confirmar/)
    expect(r.texto).toMatch(/duración por confirmar/)
    expect(r.texto).toMatch(/precio desde por confirmar/)
    expect(r.texto).toMatch(/verificación por confirmar/)
    expect(r.acciones?.[0].to).toBe('/como-llegar')
  })
  it('con ruta verificada cita fecha, terminal y duración', async () => {
    const r = await responder('como llego a Guateque', ctx({ rutas: [ruta({ terminal: 'Terminal Salitre', duracionMin: 150, precioDesdeCop: 40000, verificadoEn: '2026-10-01' })] }))
    expect(r.texto).toMatch(/Terminal Salitre.*2 h 30 min.*\$40\.000.*verificado el 1 de octubre de 2026/)
  })
  it('sin rutas cargadas no inventa', async () => {
    const r = await responder('como llego desde Bogota', ctx())
    expect(r.texto).toMatch(/No tengo rutas/)
    expect(r.texto).toMatch(/por confirmar/)
  })
  it('en carro usa el tramo bogota → guateque', async () => {
    const r = await responder('como llego desde Bogotá', ctx({ tramoEntre: (a, b) => (a === 'bogota' && b === 'mun:guateque' ? { duracion_s: 9000, distancia_m: 120000 } : undefined) }))
    expect(r.texto).toMatch(/En carro: unos 2 h 30 min/)
  })
})

describe('cuánto me demoro', () => {
  it('usa el tramo real', async () => {
    const r = await responder('¿Cuánto me demoro de Tenza a Garagoa?', ctx({ tramoEntre: (a, b) => (a === 'mun:tenza' && b === 'mun:garagoa' ? { duracion_s: 1500, distancia_m: 20000 } : undefined) }))
    expect(r.texto).toMatch(/25 min por carretera/)
  })
  it('sin tramo cae a línea recta marcada aprox.', async () => {
    let pidio = false
    const r = await responder('cuanto me demoro de Tenza a Garagoa', ctx({ cargarTramos: async () => { pidio = true } }))
    expect(pidio).toBe(true)
    expect(r.texto).toMatch(/aprox\./)
    expect(r.texto).toMatch(/línea recta/)
  })
})

describe('vía', () => {
  it('sin alertas no afirma que la vía está bien', async () => {
    const r = await responder('¿hay paro?', ctx())
    expect(r.texto).toContain('No tenemos avisos de vía vigentes')
    expect(r.texto).not.toMatch(/\b(est[aá] (bien|libre|despejad)|sin problemas|todo bien)/i)
    expect(r.texto).toMatch(/no garantiza/)
  })
  it('sin conexión no afirma nada', async () => {
    const r = await responder('como esta la via', ctx({ sinConexion: true }))
    expect(r.texto).toMatch(/No pude consultar/)
  })
  it('lista las alertas vigentes del municipio', async () => {
    const r = await responder('hay derrumbe en Macanal', ctx({ alertas: [
      { id: 'a', municipio: 'macanal', tramo_desde: null, tramo_hasta: null, tipo: 'derrumbe', mensaje: 'Paso a un carril', desde: '2026-10-20T00:00:00Z', hasta: null, fuente: 'Prueba', creada_por: null },
      { id: 'b', municipio: 'tenza', tramo_desde: null, tramo_hasta: null, tipo: 'obra', mensaje: 'Otra', desde: '2026-10-20T00:00:00Z', hasta: null, fuente: null, creada_por: null },
    ] }))
    expect(r.texto).toContain('Paso a un carril')
    expect(r.texto).not.toContain('Otra')
  })
})

describe('clima y eventos', () => {
  it('clima del municipio cita Open-Meteo', async () => {
    const r = await responder('¿va a llover en Guateque?', ctx({ clima: [{ municipio: 'guateque', fecha: HOY, prob_lluvia_max: 70, temp_min: 14, temp_max: 22.5, actualizado: AHORA.toISOString() }] }))
    expect(r.texto).toMatch(/70%/)
    expect(r.texto).toMatch(/14 y 22\.5/)
    expect(r.texto).toContain('Open-Meteo')
  })
  it('sin pronóstico lo dice', async () => {
    const r = await responder('va a llover mañana en Tenza', ctx())
    expect(r.texto).toMatch(/No tengo pronóstico/)
  })
  it('eventos del fin de semana', async () => {
    let rango: [string, string] | undefined
    const r = await responder('¿qué hay este fin de semana?', ctx({ consultarEventos: async (d, h) => { rango = [d, h]; return [{ nombre: 'Feria de prueba', municipio: 'tenza', descripcion: null, desde: '2026-10-24', hasta: null, verificado_en: null }] } }))
    expect(rango).toEqual(['2026-10-24', '2026-10-25'])
    expect(r.texto).toContain('Feria de prueba')
    expect(r.texto).toMatch(/por confirmar/)
  })
  it('sin eventos lo dice y no afirma que no haya nada', async () => {
    const r = await responder('hay fiestas este fin de semana', ctx({ consultarEventos: async () => [] }))
    expect(r.texto).toMatch(/No tenemos eventos registrados/)
    expect(r.texto).toMatch(/no significa que no haya/)
  })
  it('si falla la consulta de eventos lo dice', async () => {
    const r = await responder('que eventos hay', ctx({ consultarEventos: async () => { throw new Error('x') } }))
    expect(r.texto).toMatch(/No pude consultar/)
  })
})
