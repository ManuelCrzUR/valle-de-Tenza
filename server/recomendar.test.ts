import { describe, expect, it } from 'vitest'
import { GUSTOS_VACIOS, etiquetasGustos, fusionarGustos, hayGustos, normalizarGustos } from '../shared/gustos.js'
import type { Gustos } from '../shared/gustos.js'
import { buscarLugares, SLUGS } from './catalogo.js'
import { candidatosRecomendacion, puntuar, recomendar } from './recomendar.js'
import type { LugarRecomendable } from './recomendar.js'

const g = (p: Partial<Gustos>): Gustos => ({ ...GUSTOS_VACIOS, intereses: [], evitar: [], ...p })
const lugar = (id: string, nombre: string, categoria: string, municipio = 'tenza', extra: Partial<LugarRecomendable> = {}): LugarRecomendable =>
  ({ id, nombre, categoria, municipio, lat: null, lon: null, precision: null, ...extra }) as LugarRecomendable

describe('normalizarGustos', () => {
  it('descarta basura y recorta', () => {
    const r = normalizarGustos({
      intereses: ['naturaleza', 'naturaleza', 'surf', 5, 'cultura'],
      ritmo: 'veloz', presupuesto: 'alto', conNinos: 'si', mascotas: true,
      evitar: ['Ruido', 'x'.repeat(40), 7, 'ruido', 'Frío', 'a', 'b1', 'c2', 'd3', 'e4'],
      municipio: 'marte',
    }, SLUGS)
    expect(r.intereses).toEqual(['naturaleza', 'cultura'])
    expect(r.ritmo).toBeNull()
    expect(r.presupuesto).toBe('alto')
    expect(r.conNinos).toBeNull()
    expect(r.mascotas).toBe(true)
    expect(r.evitar).toEqual(['ruido', 'frio', 'b1', 'c2', 'd3'])
    expect(r.municipio).toBeNull()
  })
  it('nunca lanza con tipos raros', () => {
    for (const x of [null, undefined, 3, 'hola', [], { intereses: 'x', evitar: { a: 1 } }]) {
      expect(() => normalizarGustos(x, SLUGS)).not.toThrow()
      expect(hayGustos(normalizarGustos(x, SLUGS))).toBe(false)
    }
  })
  it('acepta municipio válido', () => {
    expect(normalizarGustos({ municipio: 'tenza' }, SLUGS).municipio).toBe('tenza')
  })
})

describe('fusionarGustos y etiquetas', () => {
  it('une listas sin repetidos y reemplaza escalares no nulos', () => {
    const r = fusionarGustos(g({ intereses: ['cultura'], ritmo: 'activo', evitar: ['ruido'] }), { intereses: ['cultura', 'descanso'], ritmo: null, presupuesto: 'bajo', evitar: ['frio'] })
    expect(r.intereses).toEqual(['cultura', 'descanso'])
    expect(r.ritmo).toBe('activo')
    expect(r.presupuesto).toBe('bajo')
    expect(r.evitar).toEqual(['ruido', 'frio'])
  })
  it('respeta el máximo de evitar', () => {
    const r = fusionarGustos(g({ evitar: ['a1', 'b1', 'c1', 'd1'] }), { evitar: ['e1', 'f1'] })
    expect(r.evitar).toHaveLength(5)
  })
  it('etiquetas en español', () => {
    const t = etiquetasGustos(g({ intereses: ['naturaleza'], ritmo: 'tranquilo', presupuesto: 'bajo', conNinos: true, mascotas: true, movilidadReducida: true, evitar: ['ruido'], municipio: 'tenza' }), { tenza: 'Tenza' }).map((e) => e.texto)
    expect(t).toEqual(['Naturaleza', 'Sin prisa', 'Presupuesto bajo', 'Con niños', 'Con mascota', 'Movilidad reducida', 'Evitar: ruido', 'En Tenza'])
  })
})

describe('recomendar', () => {
  it('el municipio pesa', () => {
    const lista = [lugar('a', 'A cerro', 'naturaleza', 'almeida'), lugar('b', 'B cerro', 'naturaleza', 'tenza')]
    const r = recomendar(lista, g({ intereses: ['naturaleza'], municipio: 'tenza' }))
    expect(r[0].id).toBe('b')
  })
  it('evitar excluye', () => {
    const lista = [lugar('a', 'Cascada ruidosa', 'naturaleza', 'tenza', { descripcion: 'mucho ruido' }), lugar('b', 'Cerro', 'naturaleza')]
    const gs = g({ intereses: ['naturaleza'], evitar: ['ruido'] })
    expect(puntuar(lista[0], gs).puntos).toBe(-Infinity)
    expect(recomendar(lista, gs).map((x) => x.id)).toEqual(['b'])
  })
  it('mascotas favorece al negocio con el servicio', () => {
    const lista = [lugar('a', 'Hotel A', 'alojamiento'), lugar('b', 'Hotel B', 'alojamiento', 'tenza', { services: ['Se admiten mascotas'] })]
    const r = recomendar(lista, g({ intereses: ['descanso'], mascotas: true }))
    expect(r[0].id).toBe('b')
    expect(r[0].razones).toContain('Se admiten mascotas')
  })
  it('sin precio no inventa razón de presupuesto', () => {
    const p = puntuar(lugar('a', 'Hotel', 'alojamiento', 'tenza', { priceFromCop: null }), g({ presupuesto: 'bajo' }))
    expect(p.razones).not.toContain('Dentro de tu presupuesto')
    const q = puntuar(lugar('b', 'Hotel', 'alojamiento', 'tenza', { priceFromCop: 30000 }), g({ presupuesto: 'bajo' }))
    expect(q.razones).toContain('Dentro de tu presupuesto')
    const c = puntuar(lugar('c', 'Hotel', 'alojamiento', 'tenza', { priceFromCop: 90000 }), g({ presupuesto: 'bajo' }))
    expect(c.razones).not.toContain('Dentro de tu presupuesto')
  })
  it('diversidad: máximo 2 por categoría y 3 razones', () => {
    const lista = ['a', 'b', 'c', 'd'].map((x) => lugar(x, `Cerro ${x}`, 'naturaleza', 'tenza', { descripcion: 'mirador con paisaje tranquilo' }))
      .concat([lugar('z', 'Iglesia', 'monumento', 'tenza', { descripcion: 'paisaje' })])
    const r = recomendar(lista, g({ intereses: ['naturaleza', 'fotografia', 'descanso'], municipio: 'tenza' }), 5)
    expect(r.filter((x) => x.categoria === 'naturaleza')).toHaveLength(2)
    expect(r.every((x) => x.razones.length <= 3)).toBe(true)
  })
  it('es determinista', () => {
    const lista = ['c', 'a', 'b'].map((x) => lugar(x, 'Igual', 'naturaleza'))
    const gs = g({ intereses: ['naturaleza'] })
    expect(recomendar(lista, gs)).toEqual(recomendar([...lista].reverse(), gs))
    expect(recomendar(lista, gs)).toEqual(recomendar(lista, gs))
  })
  it('con el catálogo real todo id existe', async () => {
    const existentes = new Set(buscarLugares({ limite: 40 }).map((l) => l.id))
    const candidatos = await candidatosRecomendacion(async () => { throw new Error('sin red') })
    const ids = new Set(candidatos.map((c) => c.id))
    expect(candidatos.length).toBeGreaterThan(40)
    for (const id of existentes) expect(ids.has(id)).toBe(true)
    const r = recomendar(candidatos, g({ intereses: ['gastronomia', 'cultura'], ritmo: 'tranquilo' }), 6)
    expect(r.length).toBeGreaterThan(0)
    for (const x of r) expect(ids.has(x.id)).toBe(true)
  })
})
