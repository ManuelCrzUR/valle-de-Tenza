import { describe, expect, it } from 'vitest'
import { DIAS_MAX, FACTOR_RUTA, VELOCIDAD_MEDIA_MS, costoEntre, generarPlan } from './generarPlan'
import type { FnCosto } from './generarPlan'
import { LUGARES, MUNICIPIOS, metros, tieneUbicacion } from './lugares'
import type { Lugar } from './lugares'
import { PLANES } from './planes'

// Municipio con al menos un alojamiento con ubicación (dato real de lugares.json).
const municipioConAlojamiento = LUGARES.find((l) => l.categoria === 'alojamiento' && tieneUbicacion(l))?.municipio ?? ''

describe('generarPlan', () => {
  it('con la misma semilla genera el mismo itinerario', () => {
    const a = generarPlan('aventura', 'tenza', 42, 3)
    const b = generarPlan('aventura', 'tenza', 42, 3)
    expect(a).toBeDefined()
    expect(b).toEqual(a)
  })

  it('nunca genera más de DIAS_MAX días aunque se pidan más', () => {
    const it = generarPlan('aventura', 'tenza', 7, DIAS_MAX + 10)
    expect(it).toBeDefined()
    expect(it!.dias.length).toBeLessThanOrEqual(DIAS_MAX)
    expect(it!.dias.length).toBeGreaterThan(0)
  })

  it('incluye hospedaje cuando hay alojamientos en el municipio', () => {
    const hayAlojamiento = LUGARES.some((l) => l.municipio === municipioConAlojamiento && l.categoria === 'alojamiento' && tieneUbicacion(l))
    expect(hayAlojamiento).toBe(true)
    const it = generarPlan('aventura', municipioConAlojamiento, 1, 2)
    expect(it).toBeDefined()
    expect(it!.hospedaje).toBeDefined()
    expect(it!.hospedaje!.categoria).toBe('alojamiento')
  })
})

// ---------- Generador con dependencias inyectadas (matriz de tramos falsa, cupos, sin carro) ----------
const L = (id: string, categoria: Lugar['categoria'], municipio: string, i: number, extra: Partial<Lugar> = {}): Lugar => ({
  id, nombre: id, categoria, subtipo: '', municipio, lat: 5 + i * 0.01, lon: -73, precision: 'exacta', direccion: '', plan: categoria === 'naturaleza' || categoria === 'monumento' ? 'aventura' : null,
  esServicio: false, conRegistro: false, fuentes: [], ...extra,
})
// Matriz falsa: lo no listado cuesta 1 h aproximada; lo listado, su tiempo exacto.
const matriz = (t: Record<string, number>): FnCosto => (a, b) => {
  const s = t[`${a.id}|${b.id}`] ?? t[`${b.id}|${a.id}`]
  return s === undefined ? { segundos: 3600, aprox: true } : { segundos: s, aprox: false }
}
const paradasA = [0, 1, 2, 3, 4, 5].map((i) => L(`pa${i}`, 'naturaleza', 'a', i))

describe('generarPlan con dependencias', () => {
  it('la comida queda en el municipio de la última parada aunque haya otro restaurante más cerca en otro', () => {
    const lugares = [...paradasA, L('r-b', 'restaurante', 'b', 3), L('r-a', 'restaurante', 'a', 40), L('h', 'alojamiento', 'a', 5)]
    const it = generarPlan('aventura', 'a', 1, 1, { lugares, costo: matriz({}) })!
    const fin = it.dias[0].paradas.at(-1)!
    expect(fin.municipio).toBe('a')
    expect(it.dias[0].comida?.id).toBe('r-a')
    // aun con tiempos reales que favorecen al de otro municipio
    const t = Object.fromEntries(paradasA.map((p) => [`${p.id}|r-b`, 60]))
    expect(generarPlan('aventura', 'a', 1, 1, { lugares, costo: matriz(t) })!.dias[0].comida?.id).toBe('r-a')
  })

  it('sin cupo en el hospedaje más cercano elige el siguiente con cupo y avisa', () => {
    const lugares = [...paradasA, L('h1', 'alojamiento', 'a', 6), L('h2', 'alojamiento', 'a', 9)]
    const cupo = (l: Lugar) => (l.id === 'h1' ? 1 : l.id === 'h2' ? 10 : undefined)
    const sin = generarPlan('aventura', 'a', 1, 1, { lugares, costo: matriz({}) })!
    expect(sin.hospedaje?.id).toBe('h1')
    expect(sin.avisoHospedaje).toBeUndefined()
    const con = generarPlan('aventura', 'a', 1, 1, { lugares, costo: matriz({}), cupo, fecha: '2030-01-05', personas: 4 })!
    expect(con.hospedaje?.id).toBe('h2')
    expect(con.avisoHospedaje).toBe('«h1» no tiene cupo ese día; te sugerimos «h2».')
    // con cupo suficiente se queda con el más cercano, sin aviso
    expect(generarPlan('aventura', 'a', 1, 1, { lugares, costo: matriz({}), cupo, fecha: '2030-01-05', personas: 1 })!.avisoHospedaje).toBeUndefined()
  })

  it('sin carro no hay paradas, comida ni hospedaje fuera de los municipios conectados', () => {
    const lugares = [...paradasA, ...[0, 1, 2].map((i) => L(`pb${i}`, 'naturaleza', 'b', 6 + i)), ...[0, 1, 2].map((i) => L(`pc${i}`, 'naturaleza', 'c', 9 + i)),
      L('r-c', 'restaurante', 'c', 10), L('h-c', 'alojamiento', 'c', 10), L('h-a', 'alojamiento', 'a', 30)]
    for (let s = 0; s < 10; s++) {
      const it = generarPlan('aventura', 'a', s, 3, { lugares, movilidad: 'publico', rutasPublicas: [{ origen: 'a', destino: 'b' }, { origen: 'c', destino: 'd' }] })!
      const munis = new Set([...it.paradas, ...it.dias.flatMap((d) => d.comida ?? []), ...(it.hospedaje ? [it.hospedaje] : [])].map((l) => l.municipio))
      expect([...munis].every((m) => m === 'a' || m === 'b')).toBe(true)
    }
    // sin la ruta a «b» el día queda solo en «a»
    expect(generarPlan('aventura', 'a', 1, 3, { lugares, movilidad: 'publico' })!.paradas.every((l) => l.municipio === 'a')).toBe(true)
  })

  it('las cimas sin acceso van como opcional, no como parada', () => {
    const cima = (id: string, i: number, extra: Partial<Lugar> = {}) => L(id, 'naturaleza', 'a', i, { subtipo: 'peak', ...extra })
    const lugares = [...paradasA.slice(0, 3), cima('cima1', 1), cima('cima2', 2), cima('cima-acc', 3, { acceso: 'Sendero de 40 min desde la vereda' })]
    const it = generarPlan('aventura', 'a', 3, 1, { lugares })!
    expect(it.paradas.map((l) => l.id)).not.toContain('cima1')
    expect(it.paradas.map((l) => l.id)).not.toContain('cima2')
    expect(it.paradas.map((l) => l.id)).toContain('cima-acc')
    expect(it.dias[0].opcional.map((l) => l.id).sort()).toEqual(['cima1', 'cima2'])
  })

  it('con las mismas dependencias y semilla da el mismo itinerario; suma el tiempo en carretera', () => {
    const lugares = [...paradasA, L('r', 'restaurante', 'a', 2), L('h', 'alojamiento', 'a', 4)]
    const deps = { lugares, costo: matriz({ 'pa0|pa1': 600 }), cupo: () => 5, fecha: '2030-01-05', personas: 2 }
    const a = generarPlan('aventura', 'a', 9, 2, deps)!
    expect(generarPlan('aventura', 'a', 9, 2, { ...deps })).toEqual(a)
    expect(a.segundosCarretera).toBe(a.dias.reduce((t, d) => t + d.segundosCarretera, 0))
    expect(a.segundosCarretera).toBeGreaterThan(0)
    expect(a.aprox).toBe(true)
    expect(a.dias.every((d) => d.aprox)).toBe(true)
    const exacto = generarPlan('aventura', 'a', 9, 1, { lugares, costo: () => ({ segundos: 100, aprox: false }) })!
    expect(exacto.aprox).toBe(false)
  })

  it('sin tramo, costoEntre usa línea recta × FACTOR_RUTA / velocidad y lo marca aproximado', () => {
    const [a, b] = paradasA
    const c = costoEntre(a, b)
    expect(c.aprox).toBe(true)
    expect(c.segundos).toBeCloseTo((metros([a.lat!, a.lon!], [b.lat!, b.lon!]) * FACTOR_RUTA) / VELOCIDAD_MEDIA_MS, 5)
    expect(costoEntre(a, b, () => ({ duracion_s: 77 }))).toEqual({ segundos: 77, aprox: false })
  })
})

describe('cierre: la comida nunca queda en otro municipio si existe restaurante en el de la última parada', () => {
  const conRestaurante = new Set(LUGARES.filter((l) => l.categoria === 'restaurante' && tieneUbicacion(l)).map((l) => l.municipio))
  for (const plan of PLANES) {
    it(`plan ${plan.id}, todos los municipios, 10 semillas`, () => {
      for (const m of MUNICIPIOS) {
        for (let semilla = 0; semilla < 10; semilla++) {
          const it = generarPlan(plan.id, m.slug, semilla, 3)
          for (const d of it?.dias ?? []) {
            const fin = d.paradas[d.paradas.length - 1]
            if (d.comida && d.comida.municipio !== fin.municipio) expect(conRestaurante.has(fin.municipio), `${plan.id}/${m.slug}/${semilla}`).toBe(false)
          }
        }
      }
    })
  }
})
