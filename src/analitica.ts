import { track } from '@vercel/analytics'
import type { BeforeSendEvent } from '@vercel/analytics'

// Analítica sin datos personales. Solo se envían las claves de esta lista blanca y valores simples
// (texto corto de catálogo o número). Nunca nombre, contacto, código de reserva, ids de usuario,
// fechas exactas ni texto libre.
export const NOMBRES_EVENTO = ['plan_elegido', 'itinerario_visto', 'reservar_abierto', 'reserva_enviada', 'compartido'] as const
export type NombreEvento = (typeof NOMBRES_EVENTO)[number]

export type DatosEvento = {
  plan?: string
  municipio?: string
  dias?: number
  personas?: number
  transporte?: string
  tipo?: string
}

const CLAVES_PERMITIDAS = ['plan', 'municipio', 'dias', 'personas', 'transporte', 'tipo'] as const

/** Filtra cualquier dato que no esté en la lista blanca o no sea un valor simple. */
export function datosSeguros(datos?: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  if (!datos) return out
  for (const clave of CLAVES_PERMITIDAS) {
    const valor = datos[clave]
    if (typeof valor === 'number' && Number.isFinite(valor)) out[clave] = valor
    else if (typeof valor === 'string' && valor.length > 0 && valor.length <= 40) out[clave] = valor
  }
  return out
}

/** Registra un evento del embudo. Nunca lanza: la analítica no debe romper la pantalla. */
export function evento(nombre: NombreEvento, datos?: DatosEvento): void {
  try {
    track(nombre, datosSeguros(datos as Record<string, unknown>))
  } catch {
    /* sin analítica (bloqueador, red caída): se ignora */
  }
}

/**
 * Quita de las vistas automáticas de página lo que podría identificar a una persona:
 * query string (p. ej. fecha y personas de reservas), código de reserva en /resena/<codigo>
 * y el id de un itinerario compartido en /i/<id>.
 */
export function antesDeEnviar(evt: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(evt.url, 'https://valle-directo.local')
    const ruta = url.pathname
      .replace(/^(\/resena\/)[^/]+/, '$1:codigo')
      .replace(/^(\/i\/)[^/]+/, '$1:id')
    const absoluta = /^https?:\/\//.test(evt.url)
    return { ...evt, url: absoluta ? `${url.origin}${ruta}` : ruta }
  } catch {
    return null
  }
}
