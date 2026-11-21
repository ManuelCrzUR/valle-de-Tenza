import { describe, expect, it } from 'vitest'
import { cargaInicial, puedeAnimar, reducirCarga } from '../src/components/mapa/mapaListo.js'
import type { CargaMapa } from '../src/components/mapa/mapaListo.js'

function listoVisible(): CargaMapa {
  let s = cargaInicial()
  s = reducirCarga(s, { tipo: 'visible', valor: true })
  s = reducirCarga(s, { tipo: 'tamano', estable: true })
  s = reducirCarga(s, { tipo: 'tileOk' })
  s = reducirCarga(s, { tipo: 'colaVacia' })
  return s
}

describe('recorrido del mapa', () => {
  it('no anima antes de que haya teselas y tamaño estable', () => {
    let s = cargaInicial()
    expect(puedeAnimar(s)).toBe(false)
    s = reducirCarga(s, { tipo: 'visible', valor: true })
    s = reducirCarga(s, { tipo: 'tamano', estable: true })
    expect(puedeAnimar(s)).toBe(false)
    s = reducirCarga(s, { tipo: 'tileOk' })
    expect(puedeAnimar(s)).toBe(false)
    s = reducirCarga(s, { tipo: 'colaVacia' })
    expect(puedeAnimar(s)).toBe(true)
    expect(s.arranques).toBe(1)
  })

  it('una segunda cola vacía no vuelve a arrancar', () => {
    const s = reducirCarga(listoVisible(), { tipo: 'colaVacia' })
    expect(s.arranques).toBe(1)
    expect(s.fase).toBe('listo')
  })

  it('teselas fallidas dejan el mapa en error y sin animación', () => {
    let s = reducirCarga(cargaInicial(), { tipo: 'visible', valor: true })
    s = reducirCarga(s, { tipo: 'tamano', estable: true })
    s = reducirCarga(s, { tipo: 'tileMal' })
    s = reducirCarga(s, { tipo: 'colaVacia' })
    expect(s.fase).toBe('error')
    expect(puedeAnimar(s)).toBe(false)
    s = reducirCarga(s, { tipo: 'reintentar' })
    expect(s.fase).toBe('cargando')
    expect(puedeAnimar(s)).toBe(false)
  })

  it('cambiar la ruta vuelve a esperar teselas', () => {
    const s = reducirCarga(listoVisible(), { tipo: 'ruta' })
    expect(s.fase).toBe('cargando')
    expect(s.tilesOk).toBe(0)
    expect(s.arranques).toBe(0)
    expect(puedeAnimar(s)).toBe(false)
  })

  it('el tiempo de espera no pisa un mapa que ya está listo', () => {
    const s = reducirCarga(listoVisible(), { tipo: 'timeout' })
    expect(s.fase).toBe('listo')
    expect(puedeAnimar(s)).toBe(true)
  })
})
