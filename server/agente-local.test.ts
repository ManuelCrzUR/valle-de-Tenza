import { describe, expect, it } from 'vitest'
import { LUGARES } from '../src/data/lugares.js'
import { RESUMEN_DESTINOS, SUGERENCIAS, empresasDeNegocios, respaldoLocal, responderLocal, validarLink } from '../src/data/agente.js'

const l = (ruta: string, ancla: string | null = null) => validarLink({ etiqueta: 'x', ruta, ancla })

describe('validarLink', () => {
  it('rechaza destinos peligrosos o inexistentes', () => {
    for (const r of ['https://x.com', 'javascript:alert(1)', '//evil', '/lugares/no-existe', '/lugares?cat=hackeo', '/admin', '/lugares?x=1', '/a/../b'])
      expect(l(r), r).toBeNull()
  })
  it('rechaza ancla no permitida y etiqueta inválida', () => {
    expect(l('/plan', 'otra')).toBeNull()
    expect(l('/mapa', 'plan-asistente')).toBeNull()
    expect(validarLink({ etiqueta: '  ', ruta: '/' })).toBeNull()
    expect(validarLink(null)).toBeNull()
  })
  it('acepta y normaliza', () => {
    expect(l('/lugares?mun=tenza&cat=dormir')?.ruta).toBe('/lugares?cat=dormir&mun=tenza')
    expect(l('/plan', 'plan-asistente')?.ancla).toBe('plan-asistente')
    const id = LUGARES[0].id
    expect(l(`/lugares/${id}`)?.ruta).toBe(`/lugares/${id}`)
    expect(l('/mapa?vista=ruta')?.ruta).toBe('/mapa?vista=ruta')
  })
})

const cafe = {
  id: 'business:11111111-1111-4111-8111-111111111111',
  nombre: 'Cafe La Esperanza',
  categoria: 'restaurante',
  municipio: 'tenza',
  descripcion: 'Cafe de la plaza',
}

describe('negocios publicados en el asistente', () => {
  it('incluye el publicado por nombre y arma links de ficha, mapa y plan', () => {
    const r = responderLocal('Cuéntame de Cafe La Esperanza', [cafe])
    expect(r.texto).toContain('Cafe La Esperanza')
    expect(r.texto).toContain('Cafe de la plaza')
    expect(r.links.map((x) => x.ruta)).toEqual([
      `/lugares/${cafe.id}`,
      `/mapa?lugar=${cafe.id}`,
      `/plan?lugar=${cafe.id}`,
    ])
    for (const link of r.links) expect(validarLink(link, [cafe])).toEqual(link)
  })
  it('rechaza un negocio que no está publicado y un borrador', () => {
    expect(validarLink({ etiqueta: 'X', ruta: `/lugares/${cafe.id}`, ancla: null })).toBeNull()
    expect(validarLink({ etiqueta: 'X', ruta: `/lugares/${cafe.id}`, ancla: null }, [cafe])?.ruta).toBe(`/lugares/${cafe.id}`)
    const crudo = { negocios: [{ ...cafe, id: cafe.id, name: cafe.nombre, category: cafe.categoria, municipality: cafe.municipio, description: cafe.descripcion, status: 'draft' }, { id: 'business:22222222-2222-4222-8222-222222222222', name: 'Otro', category: 'restaurante', municipality: 'tenza', status: 'published' }] }
    expect(empresasDeNegocios(crudo).map((e) => e.nombre)).toEqual(['Otro'])
    expect(responderLocal('Borrador Secreto', [cafe]).links.some((x) => x.ruta.includes('Borrador'))).toBe(false)
  })
  it('si no se pueden leer los negocios, el respaldo lo dice y sigue con el catálogo', () => {
    const r = respaldoLocal('quiero ver el mapa', [], 'error')
    expect(r.texto.startsWith('No pude leer los negocios publicados.')).toBe(true)
    expect(r.links.length).toBeGreaterThan(0)
    expect(respaldoLocal('¿Dónde dormir en Tenza?').texto).toMatch(/11 lugares para dormir/)
  })
})

describe('responderLocal', () => {
  it('constantes', () => {
    expect(SUGERENCIAS).toEqual(['¿Qué hacer en Tenza?', 'Dónde dormir', 'Ver el mapa', 'Armar un plan'])
    expect(RESUMEN_DESTINOS).toContain('guayata')
  })
  it('dormir en Tenza', () => {
    const r = responderLocal('¿Dónde dormir en Tenza?')
    expect(r.links.map((x) => x.ruta)).toContain('/lugares?cat=dormir&mun=tenza')
    expect(r.texto).toMatch(/11 lugares para dormir/)
  })
  it('nombre de un lugar real', () => {
    const lug = LUGARES.find((x) => !x.esServicio && x.categoria === 'restaurante' && x.nombre.length > 8)!
    const r = responderLocal(`Cuéntame de ${lug.nombre}`)
    expect(r.links.map((x) => x.ruta)).toContain(`/lugares/${lug.id}`)
    expect(r.links.map((x) => x.ruta)).toContain(`/plan?lugar=${lug.id}`)
  })
  it('armar un plan', () => {
    const r = responderLocal('quiero armar un plan')
    expect(r.links.some((x) => x.ruta === '/plan' && x.ancla === 'plan-asistente')).toBe(true)
  })
  it('precio y reserva', () => {
    const r = responderLocal('¿cuánto cuesta reservar?')
    expect(r.texto).toMatch(/no cobra/)
    expect(r.texto).toMatch(/no reserva/)
  })
  it('fuera de cobertura', () => {
    const r = responderLocal('Guateque')
    expect(r.texto).toMatch(/cubre 7 municipios/)
  })
  it('solo municipio y sin coincidencias', () => {
    expect(responderLocal('qué hacer en Tenza').links.length).toBeGreaterThan(1)
    expect(responderLocal('asdf qwer').links.length).toBe(3)
  })
  it('siempre ≤3 links, modo catalogo y links válidos', () => {
    for (const q of ['', 'dormir comer cultura aventura mapa fotos plan', 'hotel en Somondoco con mapa y fotos', 'capilla', 'mi ruta']) {
      const r = responderLocal(q)
      expect(r.modo).toBe('catalogo')
      expect(r.links.length).toBeLessThanOrEqual(3)
      for (const k of r.links) expect(validarLink(k)).toEqual(k)
    }
  })
})
