import { describe, expect, it, vi } from 'vitest'
import type { SolicitudFila } from './almacen.js'
import type { CorreoSimple } from './correo.js'
import { avisarNegocios, negociosDeSolicitud, reintentarAvisos, type DepsAviso, type Suscripcion } from './avisoNegocio.js'
import type { ItinerarioDto } from './itinerario.js'

const B1 = '11111111-1111-4111-8111-111111111111'
const B2 = '22222222-2222-4222-8222-222222222222'
const REQ = '99999999-9999-4999-8999-999999999999'

function itinerario(): ItinerarioDto {
  return {
    modo: 'ajuste', modelo: null, plan: 'cultura', municipio: 'tenza', hospedaje: `business:${B2}`, avisos: [], resumen: '', esquematico: true, lugares: [],
    dias: [{ paradas: [`business:${B1}`, 'place:abc', 'business:no-uuid'], comida: `business:${B1}` }, { paradas: [`business:${B2}`], comida: null }],
  } as unknown as ItinerarioDto
}

function fila(extra: Partial<SolicitudFila> = {}): SolicitudFila {
  return {
    id: REQ, idempotencyKey: 'k', nombre: 'Ana <script>alert(1)</script>', correo: 'ana@example.com', telefono: '3001234567',
    fecha: '2026-12-01', personas: 3, nota: 'Somos <b>vegetarianos</b>', comparteDatos: true, itinerario: itinerario(),
    outbox: { id: 'o', idempotencyKey: 'recibo:x', estado: 'pendiente', providerId: null, intentos: 0, ultimoError: null, destinatario: 'ana@example.com' },
    ...extra,
  }
}

interface Llamada { url: string; metodo: string; body: unknown }

function montar(opts: { resend?: boolean; desde?: string; destinatario?: string | null; subs?: Suscripcion[]; vapid?: boolean } = {}) {
  const llamadas: Llamada[] = []
  const patches: Record<string, unknown>[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    llamadas.push({ url: u, metodo: init?.method ?? 'GET', body })
    const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200 })
    if (u.includes('/rest/v1/businesses?id=in.')) return ok([{ id: B1, name: 'Casa Rural' }, { id: B2, name: 'Hotel Sol' }])
    if (u.includes('/rest/v1/request_businesses')) return new Response(null, { status: 201 })
    if (u.includes('/rest/v1/notification_outbox?on_conflict')) {
      return ok((body as { business_id: string; canal: string }[]).map((r, i) => ({ id: `n${i}`, canal: r.canal, business_id: r.business_id, intentos: 0 })))
    }
    if (u.includes('/rpc/destinatario_aviso')) return ok(opts.destinatario === undefined ? 'dueno@negocio.co' : opts.destinatario)
    if (u.includes('/rpc/suscripciones_de_negocio')) return ok(opts.subs ?? [])
    if (u.includes('/notification_outbox?id=eq.') && init?.method === 'PATCH') { patches.push({ url: u, ...(body as object) }); return new Response(null, { status: 204 }) }
    if (u.includes('/push_subscriptions?endpoint=eq.')) return new Response(null, { status: 204 })
    return new Response('{}', { status: 200 })
  })
  const enviarCorreo = vi.fn(async (_c: CorreoSimple) => ({ ok: true as const, id: 'em_1' }))
  const enviarPush = vi.fn(async (_s: Suscripcion, _p: string, _o: { ttl: number }) => ({ ok: true as const }))
  const deps: DepsAviso = {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    supabase: { url: 'https://x.supabase.co', clave: 'svc' },
    resend: opts.resend === false ? undefined : { clave: 'rk', desde: opts.desde ?? 'Valle <avisos@valledirecto.co>', destinatarioPrueba: '' },
    siteUrl: 'https://valle.test',
    vapid: opts.vapid === false ? undefined : { publica: 'pub', privada: 'priv', asunto: 'mailto:a@b.co' },
    enviarCorreo, enviarPush,
  }
  return { deps, llamadas, patches, enviarCorreo, enviarPush }
}

const estadoDe = (patches: Record<string, unknown>[], id: string) => patches.filter((p) => String(p.url).endsWith(`id=eq.${id}`)).at(-1)

describe('negociosDeSolicitud', () => {
  it('extrae ids de paradas, comida y hospedaje sin duplicar, y suma el directo', () => {
    const B3 = '33333333-3333-4333-8333-333333333333'
    expect(negociosDeSolicitud(itinerario(), `business:${B3}`)).toEqual([`business:${B3}`, `business:${B1}`, `business:${B2}`])
    expect(negociosDeSolicitud(itinerario(), `business:${B1}`)).toEqual([`business:${B1}`, `business:${B2}`])
  })
  it('ignora ids inválidos y limita a 10', () => {
    expect(negociosDeSolicitud(itinerario(), 'business:xyz')).toEqual([`business:${B1}`, `business:${B2}`])
    const muchos = { ...itinerario(), dias: [{ paradas: Array.from({ length: 15 }, (_, i) => `business:00000000-0000-4000-8000-${String(i).padStart(12, '0')}`), comida: null }] } as unknown as ItinerarioDto
    expect(negociosDeSolicitud(muchos)).toHaveLength(10)
  })
})

describe('avisarNegocios', () => {
  it('no inserta ni envía nada si comparte_datos es false', async () => {
    const m = montar()
    const r = await avisarNegocios(fila({ comparteDatos: false }), m.deps)
    expect(r.negocios).toBe(0)
    expect(m.llamadas).toHaveLength(0)
    expect(m.enviarCorreo).not.toHaveBeenCalled()
    expect(m.enviarPush).not.toHaveBeenCalled()
  })

  it('encola con ignore-duplicates, escapa el HTML y usa la Idempotency-Key aviso:<req>:<negocio>', async () => {
    const m = montar()
    const r = await avisarNegocios(fila(), m.deps)
    expect(r.negocios).toBe(2)
    const outbox = m.llamadas.find((l) => l.url.includes('notification_outbox?on_conflict'))!
    expect((outbox.body as unknown[]).length).toBe(4)
    expect(m.enviarCorreo).toHaveBeenCalledTimes(2)
    const c = m.enviarCorreo.mock.calls[0][0]
    expect(c.idempotencyKey).toBe(`aviso:${REQ}:${B1}`)
    expect(c.asunto).toBe('Nueva solicitud para Casa Rural — 1 de diciembre de 2026')
    expect(c.html).not.toContain('<script>')
    expect(c.html).toContain('&lt;script&gt;')
    expect(c.html).toContain('&lt;b&gt;vegetarianos')
    expect(c.html).toContain('Responder por WhatsApp')
    expect(c.html).toContain('https://wa.me/573001234567?text=')
    expect(c.html).toContain('https://valle.test/prestadores')
    expect(c.texto).toContain('3001234567')
    expect(estadoDe(m.patches, 'n0')).toMatchObject({ estado: 'enviado', intentos: 1, provider_id: 'em_1' })
  })

  it('sin teléfono válido no pone botón de WhatsApp', async () => {
    const m = montar()
    await avisarNegocios(fila({ telefono: '123' }), m.deps)
    expect(m.enviarCorreo.mock.calls[0][0].html).not.toContain('wa.me')
  })

  it('remitente de prueba queda bloqueado_dominio y no envía', async () => {
    const m = montar({ desde: 'onboarding@resend.dev' })
    await avisarNegocios(fila(), m.deps)
    expect(m.enviarCorreo).not.toHaveBeenCalled()
    expect(estadoDe(m.patches, 'n0')).toMatchObject({ estado: 'bloqueado_dominio' })
  })

  it('sin Resend es omitido_sin_configuracion y sin destinatario es sin_destino', async () => {
    const a = montar({ resend: false })
    await avisarNegocios(fila(), a.deps)
    expect(estadoDe(a.patches, 'n0')).toMatchObject({ estado: 'omitido_sin_configuracion' })
    const b = montar({ destinatario: null })
    await avisarNegocios(fila(), b.deps)
    expect(estadoDe(b.patches, 'n0')).toMatchObject({ estado: 'sin_destino' })
  })

  it('un fallo de Resend no lanza y queda fallido sin cuerpo del proveedor', async () => {
    const m = montar()
    m.enviarCorreo.mockResolvedValue({ ok: false, error: 'resend_500' } as never)
    await expect(avisarNegocios(fila(), m.deps)).resolves.toEqual({ negocios: 2 })
    expect(estadoDe(m.patches, 'n0')).toMatchObject({ estado: 'fallido', ultimo_error: 'resend_500' })
    m.enviarCorreo.mockRejectedValue(new Error('boom'))
    await expect(avisarNegocios(fila(), m.deps)).resolves.toBeDefined()
  })

  it('el push no lleva datos personales y usa TTL de un día', async () => {
    const m = montar({ subs: [{ endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' }] })
    await avisarNegocios(fila(), m.deps)
    const [sub, carga, o] = m.enviarPush.mock.calls[0]
    expect(sub.endpoint).toBe('https://push.example/1')
    expect(o.ttl).toBe(86400)
    const p = JSON.parse(carga)
    expect(p).toEqual({ titulo: 'Nueva solicitud', cuerpo: 'Casa Rural: 1 de diciembre de 2026, 3 personas', url: '/prestadores' })
    for (const dato of ['Ana', 'script', '3001234567', 'ana@example.com', 'vegetarianos']) expect(carga).not.toContain(dato)
    expect(estadoDe(m.patches, 'n1')).toMatchObject({ estado: 'enviado' })
  })

  it('un 410 borra la suscripción', async () => {
    const m = montar({ subs: [{ endpoint: 'https://push.example/a b', p256dh: 'p', auth: 'a' }] })
    m.enviarPush.mockResolvedValue({ ok: false, status: 410, error: 'push_410' } as never)
    await avisarNegocios(fila(), m.deps)
    const del = m.llamadas.find((l) => l.metodo === 'DELETE')!
    expect(del.url).toContain(`/push_subscriptions?endpoint=eq.${encodeURIComponent('https://push.example/a b')}`)
  })

  it('sin VAPID es omitido_sin_configuracion y sin suscripciones es sin_destino', async () => {
    const a = montar({ vapid: false })
    await avisarNegocios(fila(), a.deps)
    expect(estadoDe(a.patches, 'n1')).toMatchObject({ estado: 'omitido_sin_configuracion' })
    const b = montar({ subs: [] })
    await avisarNegocios(fila(), b.deps)
    expect(estadoDe(b.patches, 'n1')).toMatchObject({ estado: 'sin_destino' })
  })
})

describe('reintentarAvisos', () => {
  it('reintenta filas pendientes con intentos < 3', async () => {
    const m = montar()
    const base = m.deps.fetchImpl
    m.deps.fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/notification_outbox?estado=in.')) return new Response(JSON.stringify([{ id: 'r1', request_id: REQ, business_id: B1, canal: 'correo', intentos: 1 }]), { status: 200 })
      if (u.includes('/reservation_requests?id=eq.')) return new Response(JSON.stringify([{ id: REQ, nombre: 'Ana', telefono: null, correo: 'a@b.co', fecha: '2026-12-01', personas: 2, nota: null, comparte_datos: true }]), { status: 200 })
      if (u.includes('/businesses?id=eq.')) return new Response(JSON.stringify([{ name: 'Casa Rural' }]), { status: 200 })
      if (u.includes('/notification_outbox?id=eq.') && (init?.method ?? 'GET') === 'GET') return new Response(JSON.stringify([{ estado: 'enviado' }]), { status: 200 })
      return base(url, init)
    }) as typeof fetch
    const r = await reintentarAvisos(m.deps)
    expect(r).toEqual({ intentados: 1, enviados: 1 })
    expect(estadoDe(m.patches, 'r1')).toMatchObject({ estado: 'enviado', intentos: 2 })
  })
})
