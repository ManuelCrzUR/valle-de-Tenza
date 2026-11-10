import { NOMBRE_MAX, NOTA_MAX, PERSONAS_MAX } from '../shared/constantes.js'
import type { ItinerarioDto } from './itinerario.js'
import { validarPropuesta } from './itinerario.js'
import type { Almacen, EstadoCorreo, SolicitudFila } from './almacen.js'
import { dossierDe, instantaneasDe, type Dossier } from './dossier.js'
import type { Envio } from './correo.js'
import { puertaEnvio } from './puerta.js'
import { correoValido, hoyColombia } from './texto.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface EntradaSolicitud {
  idempotencyKey?: string
  nombre?: string
  correo?: string
  telefono?: string
  fecha?: string
  personas?: number
  nota?: string
  comparteDatos?: boolean
  /** id business:<uuid> de la ficha desde donde se pidió */
  negocio?: string
  itinerario?: unknown
}

export interface ResultadoSolicitud {
  ok: true
  persistido: boolean
  nueva: boolean
  modo: 'demo' | 'supabase'
  comprobante: EstadoCorreo | 'no_enviado'
  id: string | null
  mensaje: string
  negociosAvisados?: number
}

function sumarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + meses, d))
  return dt.toISOString().slice(0, 10)
}

export function validarSolicitud(entrada: EntradaSolicitud, opts: { dominio?: string; hoy?: string }) {
  const hoy = opts.hoy ?? hoyColombia()
  const clave = (entrada.idempotencyKey ?? '').trim()
  if (!UUID.test(clave)) return { ok: false as const, error: 'Falta una clave de idempotencia válida.' }
  const nombre = (entrada.nombre ?? '').trim()
  if (nombre.length < 2 || nombre.length > NOMBRE_MAX) return { ok: false as const, error: 'Escribe tu nombre.' }
  const correo = correoValido(entrada.correo ?? '', opts.dominio ?? '')
  if (!correo.ok) return correo
  const tel = (entrada.telefono ?? '').trim()
  if (tel && (tel.replace(/\D/g, '').length < 7 || tel.replace(/\D/g, '').length > 15)) return { ok: false as const, error: 'El teléfono debe tener entre 7 y 15 dígitos.' }
  const fecha = (entrada.fecha ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < hoy || fecha > sumarMeses(hoy, 18)) return { ok: false as const, error: 'Elige una fecha de hoy en adelante, dentro de 18 meses.' }
  const personas = Number(entrada.personas)
  if (!Number.isInteger(personas) || personas < 1 || personas > PERSONAS_MAX) return { ok: false as const, error: `Indica entre 1 y ${PERSONAS_MAX} personas.` }
  const nota = (entrada.nota ?? '').trim().slice(0, NOTA_MAX)
  const propuesto = entrada.itinerario as { plan?: unknown; municipio?: unknown; dias?: unknown; hospedaje?: unknown } | undefined
  if (!propuesto) return { ok: false as const, error: 'Falta el itinerario.' }
  const it = validarPropuesta(propuesto, [], instantaneasDe(entrada.itinerario))
  if (!it.ok) return { ok: false as const, error: 'El itinerario tiene lugares que no están en el catálogo.' }
  return { ok: true as const, valor: { clave, nombre, correo: correo.correo, telefono: tel || null, fecha, personas, nota, comparteDatos: entrada.comparteDatos === true, itinerario: it.dto } }
}

const demosVistos = new Map<string, string>()

async function huella(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

export async function crearSolicitud(entrada: EntradaSolicitud, deps: {
  almacen: Almacen | null
  dominio?: string
  hoy?: string
  enviar?: (fila: SolicitudFila) => Promise<Envio>
  eventos?: string[]
  remitente?: string
  destinatarioPrueba?: string
}): Promise<{ ok: true; resultado: ResultadoSolicitud } | { ok: false; status: number; error: string }> {
  const v = validarSolicitud(entrada, { dominio: deps.dominio, hoy: deps.hoy })
  if (!v.ok) return { ok: false, status: 400, error: v.error }
  const canon = JSON.stringify(v.valor)
  if (!deps.almacen) {
    const h = await huella(canon)
    const previa = demosVistos.get(v.valor.clave)
    if (previa && previa !== h) return { ok: false, status: 409, error: 'Esa clave de idempotencia ya se usó con otros datos.' }
    demosVistos.set(v.valor.clave, h)
    return {
      ok: true,
      resultado: {
        ok: true, persistido: false, nueva: !previa, modo: 'demo', comprobante: 'no_enviado', id: null,
        mensaje: 'Modo demostración: la solicitud no se guardó en Supabase y no se envió correo. No es una reserva.',
      },
    }
  }
  const ya = await deps.almacen.buscar(v.valor.clave)
  if (ya) {
    return {
      ok: true,
      resultado: {
        ok: true, persistido: true, nueva: false, modo: 'supabase', comprobante: ya.outbox.estado, id: ya.id,
        mensaje: mensajeDe(ya.outbox.estado, false),
      },
    }
  }
  const guardado: ItinerarioDto = { ...v.valor.itinerario, modo: 'ajuste', modelo: null, resumen: '' }
  const fila = await deps.almacen.crear({
    idempotencyKey: v.valor.clave,
    nombre: v.valor.nombre,
    correo: v.valor.correo,
    telefono: v.valor.telefono,
    fecha: v.valor.fecha,
    personas: v.valor.personas,
    nota: v.valor.nota,
    comparteDatos: v.valor.comparteDatos,
    itinerario: guardado,
  })
  if (!deps.enviar) {
    await deps.almacen.marcarOutbox(fila.outbox.id, { estado: 'omitido_sin_configuracion', intentos: 0, ultimoError: null })
    return { ok: true, resultado: { ok: true, persistido: true, nueva: true, modo: 'supabase', comprobante: 'omitido_sin_configuracion', id: fila.id, mensaje: mensajeDe('omitido_sin_configuracion', true) } }
  }
  if (deps.remitente) {
    const puerta = puertaEnvio(deps.remitente, fila.correo, deps.destinatarioPrueba ?? '')
    if (!puerta.ok) {
      await deps.almacen.marcarOutbox(fila.outbox.id, { estado: 'bloqueado_dominio', intentos: 0, ultimoError: puerta.error })
      return { ok: true, resultado: { ok: true, persistido: true, nueva: true, modo: 'supabase', comprobante: 'bloqueado_dominio', id: fila.id, mensaje: puerta.mensaje } }
    }
  }
  let envio: Envio
  try { envio = await deps.enviar(fila) } catch { envio = { ok: false, error: 'correo_excepcion' } }
  if (envio.ok) {
    await deps.almacen.marcarOutbox(fila.outbox.id, { estado: 'enviado', providerId: envio.id, intentos: 1, ultimoError: null })
    return { ok: true, resultado: { ok: true, persistido: true, nueva: true, modo: 'supabase', comprobante: 'enviado', id: fila.id, mensaje: mensajeDe('enviado', true) } }
  }
  await deps.almacen.marcarOutbox(fila.outbox.id, { estado: 'fallido', intentos: 1, ultimoError: envio.error, providerId: null })
  return { ok: true, resultado: { ok: true, persistido: true, nueva: true, modo: 'supabase', comprobante: 'fallido', id: fila.id, mensaje: mensajeDe('fallido', true) } }
}

function mensajeDe(estado: EstadoCorreo | 'no_enviado', nueva: boolean): string {
  const base = 'No es una reserva confirmada ni un cupo verificado.'
  if (estado === 'enviado') return `Solicitud guardada y comprobante enviado. ${base}`
  if (estado === 'omitido_sin_configuracion') return `Solicitud guardada. El correo no se envió porque Resend no está configurado. ${base}`
  if (estado === 'fallido') return `Solicitud guardada. El correo falló. Si esta pantalla aún tiene el enlace de descarga, puedes reintentar el envío sin crear otra solicitud. ${base}`
  if (estado === 'bloqueado_dominio') return `La solicitud quedó guardada. El correo no se envió porque el remitente de prueba no puede escribir a ese destinatario, y no se cambió el correo del formulario. ${base}`
  if (estado === 'pendiente') return `Solicitud guardada. El comprobante sigue pendiente. ${base}`
  return nueva ? `Modo demostración. ${base}` : `La misma solicitud ya se había registrado. ${base}`
}

export async function reintentarOutbox(almacen: Almacen, enviar: (fila: SolicitudFila) => Promise<Envio>, limite = 20): Promise<{ intentos: number; enviados: number }> {
  const filas = await almacen.pendientes(limite)
  let enviados = 0
  for (const fila of filas) {
    const envio = await enviar(fila)
    const intentos = fila.outbox.intentos + 1
    if (envio.ok) {
      enviados++
      await almacen.marcarOutbox(fila.outbox.id, { estado: 'enviado', providerId: envio.id, intentos, ultimoError: null })
    } else {
      await almacen.marcarOutbox(fila.outbox.id, { estado: 'fallido', intentos, ultimoError: envio.error })
    }
  }
  return { intentos: filas.length, enviados }
}

const REINTENTABLES: EstadoCorreo[] = ['bloqueado_dominio', 'fallido', 'omitido_sin_configuracion']

export interface ResultadoReintento {
  ok: true
  comprobante: EstadoCorreo
  reenviado: boolean
  mensaje: string
}

export async function reintentarComprobante(token: string, deps: {
  tokens: { buscar(hash: string): Promise<{ requestId: string; expira: string } | null> }
  almacen: Almacen
  ahora?: number
  remitente?: string
  destinatarioPrueba?: string
  enviar?: (fila: SolicitudFila) => Promise<Envio>
}): Promise<{ ok: true; resultado: ResultadoReintento } | { ok: false; status: number; error: string; mensaje: string }> {
  const hash = await huella(token)
  const acceso = await deps.tokens.buscar(hash)
  const ahora = deps.ahora ?? Date.now()
  if (!acceso || Date.parse(acceso.expira) <= ahora) {
    return { ok: false, status: 403, error: 'enlace_vencido', mensaje: 'El enlace de esta solicitud venció o no sirve. No reenvié nada y no creé otra solicitud.' }
  }
  const fila = await deps.almacen.buscarPorId(acceso.requestId)
  if (!fila) return { ok: false, status: 403, error: 'enlace_vencido', mensaje: 'No encontré esa solicitud. No reenvié nada.' }
  if (fila.outbox.estado === 'enviado') {
    return { ok: true, resultado: { ok: true, comprobante: 'enviado', reenviado: false, mensaje: 'El comprobante ya se había enviado al correo original. No lo envié otra vez.' } }
  }
  if (fila.outbox.estado === 'pendiente') {
    return { ok: true, resultado: { ok: true, comprobante: 'pendiente', reenviado: false, mensaje: 'Ya hay un envío de este comprobante en curso. No creé otra solicitud ni cambié el destinatario.' } }
  }
  if (!REINTENTABLES.includes(fila.outbox.estado)) {
    return { ok: false, status: 409, error: 'no_reintentable', mensaje: 'Ese comprobante no se puede reintentar desde aquí.' }
  }
  const intentos = fila.outbox.intentos + 1
  const gano = await deps.almacen.reclamar(fila.outbox.id, fila.outbox.estado, fila.outbox.intentos)
  if (!gano) {
    const fresco = await deps.almacen.buscarPorId(fila.id)
    if (fresco?.outbox.estado === 'enviado') {
      return { ok: true, resultado: { ok: true, comprobante: 'enviado', reenviado: false, mensaje: 'El comprobante ya se había enviado al correo original. No lo envié otra vez.' } }
    }
    return { ok: true, resultado: { ok: true, comprobante: fresco?.outbox.estado ?? 'pendiente', reenviado: false, mensaje: 'Ya hay un envío de este comprobante en curso. No creé otra solicitud ni cambié el destinatario.' } }
  }
  if (!deps.enviar || !deps.remitente) {
    await deps.almacen.marcarOutbox(fila.outbox.id, { estado: 'omitido_sin_configuracion', intentos, ultimoError: null })
    return { ok: true, resultado: { ok: true, comprobante: 'omitido_sin_configuracion', reenviado: false, mensaje: 'La solicitud sigue guardada. El correo no se envió porque Resend no está configurado.' } }
  }
  const puerta = puertaEnvio(deps.remitente, fila.correo, deps.destinatarioPrueba ?? '')
  if (!puerta.ok) {
    await deps.almacen.marcarOutbox(fila.outbox.id, { estado: 'bloqueado_dominio', intentos, ultimoError: puerta.error })
    return { ok: true, resultado: { ok: true, comprobante: 'bloqueado_dominio', reenviado: false, mensaje: puerta.mensaje } }
  }
  let envio: Envio
  try { envio = await deps.enviar(fila) } catch { envio = { ok: false, error: 'correo_excepcion' } }
  if (envio.ok) {
    await deps.almacen.marcarOutbox(fila.outbox.id, { estado: 'enviado', providerId: envio.id, intentos, ultimoError: null })
    return { ok: true, resultado: { ok: true, comprobante: 'enviado', reenviado: true, mensaje: 'Comprobante enviado al correo original de la solicitud. No es una reserva confirmada ni un cupo verificado.' } }
  }
  await deps.almacen.marcarOutbox(fila.outbox.id, { estado: 'fallido', intentos, ultimoError: envio.error, providerId: null })
  return { ok: true, resultado: { ok: true, comprobante: 'fallido', reenviado: false, mensaje: 'La solicitud sigue guardada. El correo volvió a fallar y el destinatario no cambió.' } }
}

export function codigoSolicitud(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase()
}

export function datosReciboDe(fila: SolicitudFila): Dossier {
  return dossierDe({
    ejemplo: false,
    codigo: codigoSolicitud(fila.id),
    nombre: fila.nombre,
    fecha: fila.fecha,
    personas: fila.personas,
    nota: fila.nota ?? '',
    itinerario: fila.itinerario,
  })
}
