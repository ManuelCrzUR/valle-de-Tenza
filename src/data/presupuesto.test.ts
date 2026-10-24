import { describe, expect, it } from 'vitest'
import { calcularPresupuesto } from './presupuesto'
import type { EntradaPresupuesto } from './presupuesto'

const base: EntradaPresupuesto = {
  movilidad: 'publico', personas: 2, dias: 2,
  transporte: { directa: true, precios: [40000, 55000] },
  hospedaje: { precio: 60000 },
  comidas: [{ precio: 20000 }, { precio: 25000 }],
}

describe('calcularPresupuesto', () => {
  it('con todo publicado suma bien', () => {
    const p = calcularPresupuesto(base)
    // transporte 40.000 × 2 personas × 2 (ida y vuelta); hospedaje 60.000 × 1 noche × 2; comida 45.000 × 2
    expect(p.lineas.map((l) => l.valor)).toEqual([160000, 120000, 90000])
    expect(p.total).toBe(370000)
    expect(p.faltantes).toEqual([])
    expect(p.lineas[0].nota).toContain('Ida y vuelta')
  })
  it('sin precio de hospedaje, el total lo excluye y lo lista en faltantes', () => {
    const p = calcularPresupuesto({ ...base, hospedaje: { precio: null } })
    expect(p.lineas[1].valor).toBeNull()
    expect(p.total).toBe(250000)
    expect(p.faltantes).toEqual(['hospedaje'])
  })
  it('carro propio no estima transporte', () => {
    const p = calcularPresupuesto({ ...base, movilidad: 'carro' })
    expect(p.lineas[0].valor).toBeNull()
    expect(p.lineas[0].nota).toContain('no los estimamos')
    expect(p.total).toBe(210000)
  })
  it('1 día no tiene hospedaje', () => {
    const p = calcularPresupuesto({ ...base, dias: 1, hospedaje: null })
    expect(p.lineas.some((l) => l.concepto === 'Hospedaje')).toBe(false)
    expect(p.faltantes).toEqual([])
  })
  it('sin ningún precio publicado el total es 0 y todo queda en faltantes', () => {
    const p = calcularPresupuesto({ ...base, transporte: { directa: false, precios: [null] }, hospedaje: { precio: null }, comidas: [{ precio: null }] })
    expect(p.total).toBe(0)
    expect(p.faltantes).toEqual(['transporte', 'hospedaje', 'comida'])
    expect(p.lineas[0].nota).toContain('Guateque')
  })
})
