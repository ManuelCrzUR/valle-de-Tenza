import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { siteUrl } from './env.js'

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

/**
 * Origen del sitio, solo desde variables de entorno (SITIO_URL, SITE_URL o VERCEL_PROJECT_PRODUCTION_URL).
 * Nunca usa cabeceras del cliente (Host, x-forwarded-*): evita inyección de host y SSRF.
 * Sin origen configurado devuelve '' y no hay enlaces absolutos ni fotos remotas.
 */
export function sitioDe(_request?: Request): string {
  return siteUrl()
}
