import { readFile } from 'node:fs/promises'
import path from 'node:path'

const PATRON = /^fotos\/\d{1,3}\.jpg$/
const MAX_BYTES = 2 * 1024 * 1024

/** Devuelve un cargador de fotos del catálogo (solo `fotos/N.jpg`). Primero disco local, luego el sitio. Nunca lanza. */
export function cargadorFotos(sitio?: string): (archivo: string) => Promise<Uint8Array | null> {
  const base = sitio ? sitio.replace(/\/+$/, '') : ''
  return async (archivo: string) => {
    if (typeof archivo !== 'string' || !PATRON.test(archivo)) return null
    try {
      const buf = await readFile(path.join(process.cwd(), 'public', archivo))
      if (buf.length <= MAX_BYTES) return new Uint8Array(buf)
    } catch { /* sigue con la red */ }
    if (!/^https?:\/\//.test(base)) return null
    const control = new AbortController()
    const t = setTimeout(() => control.abort(), 4000)
    try {
      const r = await fetch(`${base}/${archivo}`, { signal: control.signal })
      if (!r.ok || !(r.headers.get('content-type') ?? '').toLowerCase().startsWith('image/jpeg')) return null
      const largo = Number(r.headers.get('content-length') ?? 0)
      if (largo > MAX_BYTES) return null
      const datos = new Uint8Array(await r.arrayBuffer())
      return datos.length > 0 && datos.length <= MAX_BYTES ? datos : null
    } catch {
      return null
    } finally {
      clearTimeout(t)
    }
  }
}

/** Origen del sitio: `SITIO_URL` tiene prioridad; si no, el de la petición. */
export function sitioDe(request: Request): string {
  const env = (process.env.SITIO_URL ?? '').trim().replace(/\/+$/, '')
  if (/^https?:\/\/[^\s]+$/.test(env)) return env
  try {
    const url = new URL(request.url)
    // La cabecera Host trae el puerto real (el servidor de desarrollo reconstruye la URL sin él).
    const host = request.headers.get('host')?.trim() ?? ''
    if (/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) {
      const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
      return `${proto === 'http' || proto === 'https' ? proto : url.protocol.replace(':', '')}://${host}`
    }
    return url.origin
  } catch { return '' }
}
