import { afterEach, describe, expect, it } from 'vitest'
import { listarFichasPublicas, urlMenuPublico } from './empresas.js'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('ficha pública del negocio', () => {
  afterEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('lee de la vista, agrupa precios por negocio y descarta menu_path malicioso', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
    const urls: string[] = []
    const base = { category: 'restaurante', municipality: 'tenza', description: 'Descripcion publica', contact: null, lat: null, lng: null }
    const r = await listarFichasPublicas(async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('business_photos')) return new Response('[]', { status: 200 })
      if (url.includes('business_prices')) {
        return new Response(JSON.stringify([
          { business_id: A, item: 'Almuerzo', price_cop: 18000, note: null },
          { business_id: B, item: 'Cama', price_cop: 50000, note: 'por noche' },
          { business_id: A, item: 'Jugo', price_cop: 6000, note: 'natural' },
        ]), { status: 200 })
      }
      return new Response(JSON.stringify([
        { ...base, id: A, name: 'Uno', menu_path: '../x.pdf', website: 'http://malo.co', instagram: '@uno_tenza', whatsapp: '3001234567',
          hours: { lun: { abre: '08:00', cierra: '18:00' }, mar: { cerrado: true }, mie: { abre: 'xx', cierra: '1' } }, services: ['wifi', 5] },
        { ...base, id: B, name: 'Dos', menu_path: `${A}/${B}/menu.pdf`, website: 'https://dos.co' },
      ]), { status: 200 })
    })
    expect(urls[0]).toContain('/rest/v1/businesses_public')
    expect(urls.some((u) => u.includes('business_prices?business_id=in.(') && u.includes('order=sort_order'))).toBe(true)
    const [uno, dos] = r.negocios
    expect(uno.menuUrl).toBeNull()
    expect(uno.website).toBeNull()
    expect(uno.instagram).toBe('uno_tenza')
    expect(uno.hours).toEqual({ lun: { abre: '08:00', cierra: '18:00' }, mar: { cerrado: true } })
    expect(uno.services).toEqual(['wifi'])
    expect(uno.prices.map((p) => p.item)).toEqual(['Almuerzo', 'Jugo'])
    expect(dos.prices).toEqual([{ item: 'Cama', priceCop: 50000, note: 'por noche' }])
    expect(dos.menuUrl).toBe(`https://example.supabase.co/storage/v1/object/public/business-menus/${A}/${B}/menu.pdf`)
    expect(dos.website).toBe('https://dos.co')
  })

  it('urlMenuPublico exige PDF y ruta con dos UUID', () => {
    expect(urlMenuPublico('https://x.co', `${A}/${B}/a.png`)).toBeNull()
    expect(urlMenuPublico('https://x.co', `${A}/../${B}/a.pdf`)).toBeNull()
    expect(urlMenuPublico('https://x.co', null)).toBeNull()
  })
})
