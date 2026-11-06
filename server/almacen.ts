import type { ItinerarioDto } from './itinerario'
import { supabaseConfig } from './env'

export type EstadoCorreo = 'pendiente' | 'enviado' | 'fallido' | 'omitido_sin_configuracion'

export interface Outbox {
  id: string
  idempotencyKey: string
  estado: EstadoCorreo
  providerId: string | null
  intentos: number
  ultimoError: string | null
  destinatario: string
}

export interface SolicitudFila {
  id: string
  idempotencyKey: string
  nombre: string
  correo: string
  telefono: string | null
  fecha: string
  personas: number
  nota: string | null
  itinerario: ItinerarioDto
  outbox: Outbox
}

export interface NuevaSolicitud {
  idempotencyKey: string
  nombre: string
  correo: string
  telefono: string | null
  fecha: string
  personas: number
  nota: string | null
  itinerario: ItinerarioDto
}

export interface Almacen {
  buscar(idempotencyKey: string): Promise<SolicitudFila | null>
  crear(nueva: NuevaSolicitud): Promise<SolicitudFila>
  marcarOutbox(id: string, patch: Partial<Pick<Outbox, 'estado' | 'providerId' | 'intentos' | 'ultimoError'>>): Promise<void>
  pendientes(limite: number): Promise<SolicitudFila[]>
}

export function cabecerasServicio(clave: string): Record<string, string> {
  return {
    apikey: clave,
    authorization: `Bearer ${clave}`,
    'content-type': 'application/json',
  }
}

function filaDe(row: Record<string, unknown>): SolicitudFila {
  const out = (row.outbox ?? {}) as Record<string, unknown>
  return {
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    nombre: String(row.nombre),
    correo: String(row.correo),
    telefono: row.telefono == null ? null : String(row.telefono),
    fecha: String(row.fecha).slice(0, 10),
    personas: Number(row.personas),
    nota: row.nota == null ? null : String(row.nota),
    itinerario: row.itinerario as ItinerarioDto,
    outbox: {
      id: String(out.id ?? ''),
      idempotencyKey: String(out.idempotency_key ?? ''),
      estado: (out.estado as EstadoCorreo) ?? 'pendiente',
      providerId: out.provider_id == null ? null : String(out.provider_id),
      intentos: Number(out.intentos ?? 0),
      ultimoError: out.ultimo_error == null ? null : String(out.ultimo_error),
      destinatario: String(out.destinatario ?? row.correo),
    },
  }
}

export function almacenSupabase(fetchImpl: typeof fetch = fetch): Almacen {
  const cfg = supabaseConfig()
  if (!cfg.configurado) throw new Error('supabase_no_configurado')
  const base = `${cfg.url}/rest/v1`
  const headers = cabecerasServicio(cfg.clave)
  return {
    async buscar(clave) {
      const r = await fetchImpl(`${base}/reservation_requests?idempotency_key=eq.${encodeURIComponent(clave)}&select=*,email_outbox(*)`, { headers })
      if (!r.ok) throw new Error(`supabase_${r.status}`)
      const data = (await r.json()) as Record<string, unknown>[]
      const row = data[0]
      if (!row) return null
      const box = Array.isArray(row.email_outbox) ? row.email_outbox[0] : row.email_outbox
      return filaDe({ ...row, outbox: box })
    },
    async crear(nueva) {
      const r = await fetchImpl(`${base}/rpc/crear_solicitud`, {
        method: 'POST',
        headers: { ...headers, prefer: 'return=representation' },
        body: JSON.stringify({ payload: {
          idempotency_key: nueva.idempotencyKey,
          nombre: nueva.nombre,
          correo: nueva.correo,
          telefono: nueva.telefono,
          fecha: nueva.fecha,
          personas: nueva.personas,
          nota: nueva.nota,
          itinerario: nueva.itinerario,
          plan: nueva.itinerario.plan,
          municipio: nueva.itinerario.municipio,
          fuente: nueva.itinerario.modo,
          modelo: nueva.itinerario.modelo,
          avisos: nueva.itinerario.avisos,
        } }),
      })
      if (!r.ok) throw new Error(`supabase_${r.status}`)
      const data = (await r.json()) as Record<string, unknown>
      return filaDe(data)
    },
    async marcarOutbox(id, patch) {
      const body: Record<string, unknown> = {}
      if (patch.estado) body.estado = patch.estado
      if ('providerId' in patch) body.provider_id = patch.providerId
      if (patch.intentos != null) body.intentos = patch.intentos
      if ('ultimoError' in patch) body.ultimo_error = patch.ultimoError
      if (patch.estado === 'enviado') body.sent_at = new Date().toISOString()
      const r = await fetchImpl(`${base}/email_outbox?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...headers, prefer: 'return=minimal' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(`supabase_${r.status}`)
    },
    async pendientes(limite) {
      const r = await fetchImpl(`${base}/reservation_requests?select=*,email_outbox!inner(*)&email_outbox.estado=in.(pendiente,fallido)&email_outbox.intentos=lt.3&limit=${limite}`, { headers })
      if (!r.ok) throw new Error(`supabase_${r.status}`)
      const data = (await r.json()) as Record<string, unknown>[]
      return data.map((row) => {
        const box = Array.isArray(row.email_outbox) ? row.email_outbox[0] : row.email_outbox
        return filaDe({ ...row, outbox: box })
      })
    },
  }
}

let seq = 0
export function almacenMemoria(eventos?: string[]): Almacen {
  const porClave = new Map<string, SolicitudFila>()
  const porId = new Map<string, SolicitudFila>()
  return {
    async buscar(clave) { return porClave.get(clave) ?? null },
    async crear(nueva) {
      eventos?.push('itinerario')
      eventos?.push('solicitud')
      eventos?.push('outbox')
      const id = `sol_${++seq}`
      const fila: SolicitudFila = {
        id,
        idempotencyKey: nueva.idempotencyKey,
        nombre: nueva.nombre,
        correo: nueva.correo,
        telefono: nueva.telefono,
        fecha: nueva.fecha,
        personas: nueva.personas,
        nota: nueva.nota,
        itinerario: nueva.itinerario,
        outbox: {
          id: `out_${id}`,
          idempotencyKey: `recibo:${id}`,
          estado: 'pendiente',
          providerId: null,
          intentos: 0,
          ultimoError: null,
          destinatario: nueva.correo,
        },
      }
      porClave.set(nueva.idempotencyKey, fila)
      porId.set(id, fila)
      return fila
    },
    async marcarOutbox(id, patch) {
      const fila = [...porId.values()].find((f) => f.outbox.id === id)
      if (!fila) throw new Error('outbox_ausente')
      Object.assign(fila.outbox, {
        estado: patch.estado ?? fila.outbox.estado,
        providerId: patch.providerId === undefined ? fila.outbox.providerId : patch.providerId,
        intentos: patch.intentos ?? fila.outbox.intentos,
        ultimoError: patch.ultimoError === undefined ? fila.outbox.ultimoError : patch.ultimoError,
      })
    },
    async pendientes(limite) {
      return [...porId.values()].filter((f) => (f.outbox.estado === 'pendiente' || f.outbox.estado === 'fallido') && f.outbox.intentos < 3).slice(0, limite)
    },
  }
}
