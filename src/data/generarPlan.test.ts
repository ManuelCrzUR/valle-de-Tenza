import { describe, expect, it } from 'vitest'
import { DIAS_MAX, generarPlan } from './generarPlan'
import { LUGARES, tieneUbicacion } from './lugares'

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
