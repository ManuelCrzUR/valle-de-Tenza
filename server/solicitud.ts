import { NOMBRE_MAX, NOTA_MAX, PERSONAS_MAX } from '../shared/constantes'
import type { ItinerarioDto } from './itinerario'
import { validarPropuesta } from './itinerario'
import type { Almacen, EstadoCorreo, SolicitudFila } from './almacen'
import { dossierDe, type Dossier } from './dossier'
import type { Envio } from './correo'
import { correoValido, hoyColombia } from './texto'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface EntradaSolicitud {
  idempotencyKey?: string
  nombre?: string
  correo?: string
  telefono?: string
  fecha?: string
  personas?: number
  nota?: string
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
  const it = validarPropuesta(propuesto)
  if (!it.ok) return { ok: false as const, error: 'El itinerario tiene lugares que no están en el catálogo.' }
  return { ok: true as const, valor: { clave, nombre, correo: correo.correo, telefono: tel || null, fecha, personas, nota, itinerario: it.dto } }
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
    itinerario: guardado,
  })
  if (!deps.enviar) {
    await deps.almacen.marcarOutbox(fila.outbox.id, { estado: 'omitido_sin_configuracion', intentos: 0, ultimoError: null })
    return { ok: true, resultado: { ok: true, persistido: true, nueva: true, modo: 'supabase', comprobante: 'omitido_sin_configuracion', id: fila.id, mensaje: mensajeDe('omitido_sin_configuracion', true) } }
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
  if (estado === 'fallido') return `Solicitud guardada. El correo falló y no se reintenta desde el navegador. ${base}`
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
