import { describe, expect, it, vi } from 'vitest'
import { eliminarCuenta } from './cuenta.js'

const UID = '11111111-2222-3333-4444-555555555555'
const OTRO = '99999999-2222-3333-4444-555555555555'
const config = { configurado: true, url: 'https://x.supabase.co', clave: 'service-clave-de-prueba' }
const TOKEN = 'a'.repeat(30) + '.b.c'

const peticion = (token?: string, cuerpo: unknown = {}) =>
  new Request('https://sitio.test/api/cuenta', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(cuerpo),
  })

function supabaseFalso(opciones: { tokenValido?: boolean; falla?: string } = {}) {
  const llamadas: string[] = []
  const cuerposBorrado: string[] = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const m = init?.method ?? 'GET'
    llamadas.push(`${m} ${u.replace(config.url, '')}`)
    if (u.endsWith('/auth/v1/user')) {
      return opciones.tokenValido === false ? new Response('{}', { status: 401 }) : Response.json({ id: UID, email: 'persona@example.com' })
    }
    if (opciones.falla && u.includes(opciones.falla)) return new Response('{}', { status: 500 })
    if (u.includes('/storage/v1/object/list/')) {
      const { prefix } = JSON.parse(String(init?.body))
      if (prefix === UID) return Response.json([{ name: 'neg1', id: null }])
      return Response.json([{ name: 'a.jpg', id: 'x' }])
    }
    if (m === 'DELETE' && String(init?.body).includes('prefixes')) cuerposBorrado.push(String(init?.body))
    return Response.json({})
  }) as unknown as typeof fetch
  return { impl, llamadas, cuerposBorrado }
}

describe('eliminarCuenta', () => {
  it('sin token responde 401 y no llama a Supabase', async () => {
    const f = supabaseFalso()
    const r = await eliminarCuenta(peticion(), { config, fetchImpl: f.impl })
    expect(r.status).toBe(401)
    expect(f.llamadas).toEqual([])
  })

  it('token inválido responde 401 y no borra nada', async () => {
    const f = supabaseFalso({ tokenValido: false })
    const r = await eliminarCuenta(peticion(TOKEN), { config, fetchImpl: f.impl })
    expect(r.status).toBe(401)
    expect(f.llamadas.some((l) => l.startsWith('DELETE'))).toBe(false)
  })

  it('sin configuración responde 503', async () => {
    const r = await eliminarCuenta(peticion(TOKEN), { config: { configurado: false, url: '', clave: '' }, fetchImpl: supabaseFalso().impl })
    expect(r.status).toBe(503)
  })

  it('borra Storage y luego el usuario del token, ignorando el uid del cuerpo, sin devolver el correo', async () => {
    const f = supabaseFalso()
    const r = await eliminarCuenta(peticion(TOKEN, { id: OTRO, uid: OTRO }), { config, fetchImpl: f.impl })
    expect(r.status).toBe(200)
    expect(await r.text()).not.toContain('example.com')
    expect(f.llamadas.filter((l) => l.startsWith('DELETE'))).toEqual([
      'DELETE /storage/v1/object/business-photos',
      'DELETE /storage/v1/object/business-menus',
      `DELETE /auth/v1/admin/users/${UID}`,
    ])
    expect(f.llamadas.join('\n')).not.toContain(OTRO)
    expect(f.cuerposBorrado[0]).toContain(`${UID}/neg1/a.jpg`)
  })

  it('si Storage falla responde 502 y no borra el usuario', async () => {
    const f = supabaseFalso({ falla: '/storage/v1/object/business-photos' })
    const r = await eliminarCuenta(peticion(TOKEN), { config, fetchImpl: f.impl })
    expect(r.status).toBe(502)
    expect(f.llamadas.some((l) => l.includes('/auth/v1/admin/users'))).toBe(false)
  })

  it('si falla el borrado del usuario responde 502', async () => {
    const f = supabaseFalso({ falla: '/auth/v1/admin/users' })
    const r = await eliminarCuenta(peticion(TOKEN), { config, fetchImpl: f.impl })
    expect(r.status).toBe(502)
  })
})
