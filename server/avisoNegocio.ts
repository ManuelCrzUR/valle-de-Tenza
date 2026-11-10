// Avisos al negocio cuando un viajero pide una solicitud y acepta compartir sus datos.
// Nunca lanza: cada fallo queda en notification_outbox y la solicitud sigue guardada.
import { enlaceWhatsapp, numeroWhatsapp } from '../shared/contacto.js'
import { PREFIJO_EMPRESA } from '../shared/ids.js'
import { cabecerasServicio, type SolicitudFila } from './almacen.js'
import { enviarCorreoSimple, type CorreoSimple, type Envio } from './correo.js'
import { resendConfig, siteUrl, supabaseConfig, vapidConfig } from './env.js'
import type { ItinerarioDto } from './itinerario.js'
import { puertaEnvio } from './puerta.js'
import { escapeHtml } from './texto.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_NEGOCIOS = 10
const MAX_INTENTOS = 3

export type EstadoAviso = 'pendiente' | 'enviado' | 'fallido' | 'omitido_sin_configuracion' | 'bloqueado_dominio' | 'sin_destino'
export type CanalAviso = 'correo' | 'push'

export interface Suscripcion { endpoint: string; p256dh: string; auth: string }
export type ResultadoPush = { ok: true } | { ok: false; status?: number; error: string }

export interface DepsAviso {
  fetchImpl: typeof fetch
  supabase: { url: string; clave: string }
  resend?: { clave: string; desde: string; destinatarioPrueba: string }
  siteUrl?: string
  vapid?: { publica: string; privada: string; asunto: string }
  enviarCorreo?: (c: CorreoSimple) => Promise<Envio>
  enviarPush?: (s: Suscripcion, payload: string, opts: { ttl: number }) => Promise<ResultadoPush>
}

/** Dependencias reales a partir del entorno; null si Supabase no está configurado. */
export function depsAvisoDeEntorno(): DepsAviso | null {
  const sb = supabaseConfig()
  if (!sb.configurado) return null
  const r = resendConfig()
  const v = vapidConfig()
  return {
    fetchImpl: fetch,
    supabase: { url: sb.url, clave: sb.clave },
    resend: r.configurado ? { clave: r.clave, desde: r.desde, destinatarioPrueba: r.destinatarioPrueba } : undefined,
    siteUrl: siteUrl() || undefined,
    vapid: v.configurado ? { publica: v.publica, privada: v.privada, asunto: v.asunto } : undefined,
  }
}

/** ids `business:<uuid>` únicos de las paradas, la comida y el hospedaje, más el negocio directo. */
export function negociosDeSolicitud(itinerario: ItinerarioDto | null | undefined, negocioDirecto?: string | null): string[] {
  const vistos = new Set<string>()
  const candidatos: unknown[] = []
  if (negocioDirecto) candidatos.push(negocioDirecto)
  for (const d of itinerario?.dias ?? []) {
    candidatos.push(...(d.paradas ?? []), d.comida)
  }
  candidatos.push(itinerario?.hospedaje)
  for (const c of candidatos) {
    if (typeof c !== 'string' || !c.startsWith(PREFIJO_EMPRESA)) continue
    const uuid = c.slice(PREFIJO_EMPRESA.length).toLowerCase()
    if (!UUID.test(uuid)) continue
    vistos.add(uuid)
    if (vistos.size >= MAX_NEGOCIOS) break
  }
  return [...vistos].map((u) => `${PREFIJO_EMPRESA}${u}`)
}

export function fechaLegible(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

interface DatosAviso {
  requestId: string
  nombre: string
  telefono: string | null
  correo: string
  fecha: string
  personas: number
  nota: string | null
}

export function contenidoCorreo(d: DatosAviso, negocio: string, sitio?: string): { asunto: string; html: string; texto: string } {
  const fecha = fechaLegible(d.fecha)
  const asunto = `Nueva solicitud para ${negocio} — ${fecha}`.replace(/[\r\n]+/g, ' ')
  const num = numeroWhatsapp(d.telefono)
  const wa = num ? enlaceWhatsapp(num, `Hola ${d.nombre}, te escribimos de ${negocio} por tu solicitud del ${fecha}.`) : null
  const panel = sitio ? `${sitio}/prestadores` : null
  const e = escapeHtml
  const filas: [string, string][] = [
    ['Nombre', d.nombre],
    ['Teléfono', d.telefono ?? 'No indicó'],
    ['Correo', d.correo],
    ['Fecha', fecha],
    ['Personas', String(d.personas)],
    ['Nota', d.nota || 'Sin nota'],
  ]
  const html = [
    `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#222">`,
    `<h1 style="font-size:20px">Nueva solicitud para ${e(negocio)}</h1>`,
    `<p>Un viajero aceptó compartir sus datos contigo. Esto es una solicitud, no una reserva confirmada.</p>`,
    `<table style="border-collapse:collapse;width:100%">`,
    ...filas.map(([k, v]) => `<tr><th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd">${e(k)}</th><td style="padding:6px 8px;border-bottom:1px solid #ddd">${e(v)}</td></tr>`),
    `</table>`,
    wa ? `<p><a href="${e(wa)}" style="display:inline-block;padding:12px 18px;background:#1a7f4b;color:#fff;border-radius:8px;text-decoration:none">Responder por WhatsApp</a></p>` : '',
    panel ? `<p><a href="${e(panel)}">Ver en tu panel</a></p>` : '',
    `<p style="font-size:12px;color:#666">Usa estos datos solo para responder esta solicitud (Ley 1581 de 2012).</p>`,
    `</div>`,
  ].join('')
  const texto = [
    `Nueva solicitud para ${negocio}`,
    'Un viajero aceptó compartir sus datos contigo. Es una solicitud, no una reserva confirmada.',
    '',
    ...filas.map(([k, v]) => `${k}: ${v}`),
    wa ? `\nResponder por WhatsApp: ${wa}` : '',
    panel ? `\nPanel: ${panel}` : '',
  ].join('\n')
  return { asunto, html, texto }
}

/** Sin datos personales: solo negocio, fecha y número de personas. */
export function cargaPush(negocio: string, fecha: string, personas: number): string {
  return JSON.stringify({
    titulo: 'Nueva solicitud',
    cuerpo: `${negocio}: ${fechaLegible(fecha)}, ${personas} ${personas === 1 ? 'persona' : 'personas'}`,
    url: '/prestadores',
  })
}

function rest(deps: DepsAviso, ruta: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...cabecerasServicio(deps.supabase.clave), ...(init.headers as Record<string, string> | undefined) }
  return deps.fetchImpl(`${deps.supabase.url}/rest/v1${ruta}`, { ...init, headers })
}

const recortar = (s: string) => s.slice(0, 200)

async function actualizar(deps: DepsAviso, id: string, estado: EstadoAviso, intentos: number, error: string | null, providerId?: string | null) {
  const body: Record<string, unknown> = { estado, intentos, ultimo_error: error == null ? null : recortar(error) }
  if (providerId !== undefined) body.provider_id = providerId
  if (estado === 'enviado') body.sent_at = new Date().toISOString()
  try {
    await rest(deps, `/notification_outbox?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify(body) })
  } catch { /* el registro es de mejor esfuerzo */ }
}

interface Pendiente { id: string; canal: CanalAviso; intentos: number; businessId: string; negocio: string }

async function entregarCorreo(deps: DepsAviso, d: DatosAviso, p: Pendiente): Promise<void> {
  const intentos = p.intentos + 1
  if (!deps.resend) return actualizar(deps, p.id, 'omitido_sin_configuracion', intentos, null)
  let para: string | null = null
  try {
    const r = await rest(deps, '/rpc/destinatario_aviso', { method: 'POST', body: JSON.stringify({ p_business: p.businessId }) })
    if (r.ok) {
      const v = (await r.json()) as unknown
      para = typeof v === 'string' && v.includes('@') ? v : null
    } else {
      return actualizar(deps, p.id, 'fallido', intentos, `destinatario_${r.status}`)
    }
  } catch {
    return actualizar(deps, p.id, 'fallido', intentos, 'destinatario_excepcion')
  }
  if (!para) return actualizar(deps, p.id, 'sin_destino', intentos, null)
  const puerta = puertaEnvio(deps.resend.desde, para, deps.resend.destinatarioPrueba)
  if (!puerta.ok) return actualizar(deps, p.id, 'bloqueado_dominio', intentos, puerta.error)
  const c = contenidoCorreo(d, p.negocio, deps.siteUrl)
  const enviar = deps.enviarCorreo ?? enviarCorreoSimple
  let envio: Envio
  try {
    envio = await enviar({
      fetchImpl: deps.fetchImpl,
      clave: deps.resend.clave,
      desde: deps.resend.desde,
      para,
      asunto: c.asunto,
      html: c.html,
      texto: c.texto,
      idempotencyKey: `aviso:${d.requestId}:${p.businessId}`,
    })
  } catch { envio = { ok: false, error: 'correo_excepcion' } }
  if (envio.ok) return actualizar(deps, p.id, 'enviado', intentos, null, envio.id)
  return actualizar(deps, p.id, 'fallido', intentos, envio.error)
}

async function enviarPushPorDefecto(vapid: NonNullable<DepsAviso['vapid']>, s: Suscripcion, payload: string, opts: { ttl: number }): Promise<ResultadoPush> {
  try {
    const wp = (await import('web-push')).default
    wp.setVapidDetails(vapid.asunto, vapid.publica, vapid.privada)
    await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: opts.ttl })
    return { ok: true }
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    return { ok: false, status, error: status ? `push_${status}` : 'push_excepcion' }
  }
}

async function entregarPush(deps: DepsAviso, d: DatosAviso, p: Pendiente): Promise<void> {
  const intentos = p.intentos + 1
  if (!deps.vapid) return actualizar(deps, p.id, 'omitido_sin_configuracion', intentos, null)
  let subs: Suscripcion[]
  try {
    const r = await rest(deps, '/rpc/suscripciones_de_negocio', { method: 'POST', body: JSON.stringify({ p_business: p.businessId }) })
    if (!r.ok) return actualizar(deps, p.id, 'fallido', intentos, `suscripciones_${r.status}`)
    const filas = (await r.json()) as { endpoint?: string; p256dh?: string; auth?: string }[]
    subs = (Array.isArray(filas) ? filas : []).filter((f) => f.endpoint && f.p256dh && f.auth) as Suscripcion[]
  } catch {
    return actualizar(deps, p.id, 'fallido', intentos, 'suscripciones_excepcion')
  }
  if (!subs.length) return actualizar(deps, p.id, 'sin_destino', intentos, null)
  const vapid = deps.vapid
  const enviar = deps.enviarPush ?? ((s, c, o) => enviarPushPorDefecto(vapid, s, c, o))
  const carga = cargaPush(p.negocio, d.fecha, d.personas)
  let ok = 0
  let ultimo: string | null = null
  for (const s of subs) {
    let r: ResultadoPush
    try { r = await enviar(s, carga, { ttl: 86400 }) } catch { r = { ok: false, error: 'push_excepcion' } }
    if (r.ok) { ok++; continue }
    if (r.status === 404 || r.status === 410) {
      try { await rest(deps, `/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } }) } catch { /* nada */ }
      continue
    }
    ultimo = r.error
  }
  if (ok > 0) return actualizar(deps, p.id, 'enviado', intentos, null)
  if (ultimo) return actualizar(deps, p.id, 'fallido', intentos, ultimo)
  // todas las suscripciones habían caducado y se borraron
  return actualizar(deps, p.id, 'sin_destino', intentos, null)
}

async function entregar(deps: DepsAviso, d: DatosAviso, p: Pendiente): Promise<void> {
  try {
    if (p.canal === 'correo') await entregarCorreo(deps, d, p)
    else await entregarPush(deps, d, p)
  } catch {
    await actualizar(deps, p.id, 'fallido', p.intentos + 1, 'aviso_excepcion')
  }
}

function datosDe(fila: Pick<SolicitudFila, 'id' | 'nombre' | 'telefono' | 'correo' | 'fecha' | 'personas' | 'nota'>): DatosAviso {
  return { requestId: fila.id, nombre: fila.nombre, telefono: fila.telefono, correo: fila.correo, fecha: fila.fecha, personas: fila.personas, nota: fila.nota }
}

/**
 * Encola y entrega los avisos de una solicitud ya guardada. Solo si el viajero dio su consentimiento.
 * Nunca lanza. Devuelve cuántos negocios se encolaron.
 */
export async function avisarNegocios(fila: SolicitudFila, deps: DepsAviso, negocioDirecto?: string | null): Promise<{ negocios: number }> {
  try {
    if (fila.comparteDatos !== true) return { negocios: 0 }
    const ids = negociosDeSolicitud(fila.itinerario, negocioDirecto).map((i) => i.slice(PREFIJO_EMPRESA.length))
    if (!ids.length) return { negocios: 0 }
    // Solo negocios que existen (la FK rechazaría el lote entero)
    const rn = await rest(deps, `/businesses?id=in.(${ids.join(',')})&select=id,name`)
    if (!rn.ok) return { negocios: 0 }
    const nombres = new Map<string, string>()
    for (const b of (await rn.json()) as { id: string; name: string }[]) nombres.set(b.id, b.name)
    const reales = ids.filter((i) => nombres.has(i))
    if (!reales.length) return { negocios: 0 }
    const ignorar = { prefer: 'resolution=ignore-duplicates,return=minimal' }
    await rest(deps, '/request_businesses?on_conflict=request_id,business_id', {
      method: 'POST', headers: ignorar,
      body: JSON.stringify(reales.map((b) => ({ request_id: fila.id, business_id: b }))),
    })
    const canales: CanalAviso[] = ['correo', 'push']
    const ro = await rest(deps, '/notification_outbox?on_conflict=request_id,business_id,canal', {
      method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(reales.flatMap((b) => canales.map((canal) => ({ request_id: fila.id, business_id: b, canal })))),
    })
    if (!ro.ok) return { negocios: reales.length }
    // Con ignore-duplicates solo vuelven las filas nuevas: no se reenvía lo ya encolado
    const nuevas = (await ro.json()) as { id: string; canal: CanalAviso; business_id: string; intentos?: number }[]
    const d = datosDe(fila)
    await Promise.all(nuevas.map((n) => entregar(deps, d, {
      id: n.id, canal: n.canal, intentos: n.intentos ?? 0, businessId: n.business_id, negocio: nombres.get(n.business_id) ?? 'tu negocio',
    })))
    return { negocios: reales.length }
  } catch {
    return { negocios: 0 }
  }
}

/** Reintenta avisos pendientes o fallidos con menos de 3 intentos. Nunca lanza. */
export async function reintentarAvisos(deps: DepsAviso, limite = 20): Promise<{ intentados: number; enviados: number }> {
  try {
    const r = await rest(deps, `/notification_outbox?estado=in.(pendiente,fallido)&intentos=lt.${MAX_INTENTOS}&order=created_at.asc&limit=${limite}&select=id,request_id,business_id,canal,intentos`)
    if (!r.ok) return { intentados: 0, enviados: 0 }
    const filas = (await r.json()) as { id: string; request_id: string; business_id: string; canal: CanalAviso; intentos: number }[]
    let enviados = 0
    for (const f of filas) {
      try {
        const rs = await rest(deps, `/reservation_requests?id=eq.${encodeURIComponent(f.request_id)}&select=id,nombre,telefono,correo,fecha,personas,nota,comparte_datos`)
        const rb = await rest(deps, `/businesses?id=eq.${encodeURIComponent(f.business_id)}&select=name`)
        if (!rs.ok || !rb.ok) continue
        const sol = ((await rs.json()) as Record<string, unknown>[])[0]
        const neg = ((await rb.json()) as { name: string }[])[0]
        if (!sol || !neg) continue
        if (sol.comparte_datos !== true) { await actualizar(deps, f.id, 'omitido_sin_configuracion', f.intentos, 'sin_consentimiento'); continue }
        const d = datosDe({
          id: String(sol.id), nombre: String(sol.nombre), telefono: sol.telefono == null ? null : String(sol.telefono),
          correo: String(sol.correo), fecha: String(sol.fecha).slice(0, 10), personas: Number(sol.personas), nota: sol.nota == null ? null : String(sol.nota),
        })
        await entregar(deps, d, { id: f.id, canal: f.canal, intentos: f.intentos, businessId: f.business_id, negocio: neg.name })
        const chk = await rest(deps, `/notification_outbox?id=eq.${encodeURIComponent(f.id)}&select=estado`)
        if (chk.ok && ((await chk.json()) as { estado: string }[])[0]?.estado === 'enviado') enviados++
      } catch { /* siguiente */ }
    }
    return { intentados: filas.length, enviados }
  } catch {
    return { intentados: 0, enviados: 0 }
  }
}
