import { json } from './http.js'

export const BUCKETS_CUENTA = ['business-photos', 'business-menus'] as const

export interface ConfigCuenta { configurado: boolean; url: string; clave: string }
export interface OpcionesCuenta { config: ConfigCuenta; fetchImpl?: typeof fetch }

class FalloSupabase extends Error {}

const PAGINA = 100
const MAX_PAGINAS = 50
const PROFUNDIDAD_MAX = 3

/** Token del encabezado Authorization: Bearer. Nunca se lee un id del cuerpo. */
export function tokenDe(request: Request): string | null {
  const m = /^Bearer\s+([\w.~+/-]+=*)$/i.exec(request.headers.get('authorization') ?? '')
  return m && m[1].length >= 20 && m[1].length <= 4000 ? m[1] : null
}

/** Pregunta a Supabase Auth a quién pertenece el token. Devuelve solo el uid (el correo no sale de aquí). */
async function uidDelToken(token: string, o: Required<OpcionesCuenta>): Promise<string | null> {
  let r: Response
  try {
    r = await o.fetchImpl(`${o.config.url}/auth/v1/user`, { headers: { apikey: o.config.clave, authorization: `Bearer ${token}` } })
  } catch { throw new FalloSupabase('auth_inaccesible') }
  if (r.status === 401 || r.status === 403) return null
  if (!r.ok) throw new FalloSupabase('auth_error')
  const datos = (await r.json().catch(() => null)) as { id?: unknown } | null
  return typeof datos?.id === 'string' && /^[0-9a-f-]{36}$/i.test(datos.id) ? datos.id : null
}

function cabeceras(o: Required<OpcionesCuenta>) {
  return { apikey: o.config.clave, authorization: `Bearer ${o.config.clave}`, 'content-type': 'application/json' }
}

/** Rutas completas de todos los archivos bajo `prefijo`, recorriendo subcarpetas y páginas. */
async function listarArchivos(bucket: string, prefijo: string, o: Required<OpcionesCuenta>, nivel = 0): Promise<string[]> {
  const rutas: string[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    let r: Response
    try {
      r = await o.fetchImpl(`${o.config.url}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers: cabeceras(o),
        body: JSON.stringify({ prefix: prefijo, limit: PAGINA, offset: pagina * PAGINA }),
      })
    } catch { throw new FalloSupabase('storage_inaccesible') }
    if (!r.ok) throw new FalloSupabase('storage_lista')
    const filas = (await r.json().catch(() => null)) as { name?: unknown; id?: unknown }[] | null
    if (!Array.isArray(filas)) throw new FalloSupabase('storage_lista')
    for (const f of filas) {
      if (typeof f.name !== 'string' || !f.name) continue
      const ruta = `${prefijo}/${f.name}`
      if (f.id) rutas.push(ruta)
      else if (nivel < PROFUNDIDAD_MAX) rutas.push(...(await listarArchivos(bucket, ruta, o, nivel + 1)))
    }
    if (filas.length < PAGINA) break
  }
  return rutas
}

async function borrarArchivos(bucket: string, rutas: string[], o: Required<OpcionesCuenta>): Promise<void> {
  for (let i = 0; i < rutas.length; i += PAGINA) {
    let r: Response
    try {
      r = await o.fetchImpl(`${o.config.url}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: cabeceras(o),
        body: JSON.stringify({ prefixes: rutas.slice(i, i + PAGINA) }),
      })
    } catch { throw new FalloSupabase('storage_inaccesible') }
    if (!r.ok) throw new FalloSupabase('storage_borra')
  }
}

/**
 * Elimina la cuenta de quien presenta el token: primero sus archivos de Storage y después el usuario
 * (las FKs en cascada borran negocios, fotos, avisos y solicitudes ligadas). Si Storage falla no se borra
 * el usuario, para que se pueda reintentar sin dejar archivos huérfanos.
 */
export async function eliminarCuenta(request: Request, opciones: OpcionesCuenta): Promise<Response> {
  const o = { fetchImpl: opciones.fetchImpl ?? fetch, config: opciones.config }
  if (!o.config.configurado) return json({ error: 'no_configurado', mensaje: 'La eliminación de cuentas no está configurada en este entorno. No se borró nada.' }, 503)
  const token = tokenDe(request)
  if (!token) return json({ error: 'sin_sesion', mensaje: 'Inicia sesión para eliminar tu cuenta. No se borró nada.' }, 401)
  try {
    const uid = await uidDelToken(token, o)
    if (!uid) return json({ error: 'sesion_invalida', mensaje: 'Tu sesión venció o no es válida. No se borró nada.' }, 401)
    for (const bucket of BUCKETS_CUENTA) await borrarArchivos(bucket, await listarArchivos(bucket, uid, o), o)
    let r: Response
    try {
      r = await o.fetchImpl(`${o.config.url}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: cabeceras(o) })
    } catch { throw new FalloSupabase('auth_inaccesible') }
    if (!r.ok && r.status !== 404) throw new FalloSupabase('auth_borra')
    return json({ ok: true })
  } catch (e) {
    const motivo = e instanceof FalloSupabase ? e.message : 'desconocido'
    return json({ error: 'supabase', motivo, mensaje: 'No pude completar la eliminación. Puedes intentarlo de nuevo; si persiste, escríbenos.' }, 502)
  }
}
