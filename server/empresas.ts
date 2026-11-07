import { idEmpresa, idEstatico, esEmpresa } from '../shared/ids.js'
import type { CategoriaId } from '../src/data/lugares.js'
import { lugarDesdePublico } from '../src/data/empresaLugar.js'
import type { Lugar } from '../src/data/lugares.js'
import { SLUGS, porId, publico } from './catalogo.js'
import type { LugarPublico } from './catalogo.js'
import { supabaseConfig } from './env.js'
import { norm, sinDatosPersonales } from './texto.js'

const CATEGORIAS = new Set<CategoriaId>(['alojamiento', 'restaurante', 'comercio', 'atraccion', 'monumento', 'naturaleza', 'operador'])

export interface FilaEmpresa {
  id: string
  name: string
  category: string
  municipality: string
  description: string
  contact?: string | null
  lat: number | null
  lng: number | null
  cover_path?: string | null
}

export function puedeGestionar(actorId: string | null | undefined, ownerId: string): boolean {
  return Boolean(actorId) && actorId === ownerId
}

export function puedeVer(status: string, actorId: string | null | undefined, ownerId: string): boolean {
  return status === 'published' || puedeGestionar(actorId, ownerId)
}

export function filaAPublico(row: FilaEmpresa): LugarPublico | null {
  if (!CATEGORIAS.has(row.category as CategoriaId)) return null
  if (!SLUGS.includes(row.municipality)) return null
  const lat = typeof row.lat === 'number' ? row.lat : null
  const lon = typeof row.lng === 'number' ? row.lng : null
  return {
    id: idEmpresa(row.id),
    nombre: sinDatosPersonales(row.name, 120),
    categoria: row.category as CategoriaId,
    municipio: row.municipality,
    lat,
    lon,
    precision: lat != null && lon != null ? 'exacta' : null,
    descripcion: sinDatosPersonales(row.description, 800),
  }
}

export function resolverCatalogo(id: string, empresas: LugarPublico[]): { canon: string; categoria: string; pub: LugarPublico } | null {
  if (esEmpresa(id)) {
    const empresa = empresas.find((e) => e.id === id)
    return empresa ? { canon: empresa.id, categoria: empresa.categoria, pub: empresa } : null
  }
  const estatico = porId(idEstatico(id))
  if (!estatico) return null
  return { canon: estatico.id, categoria: estatico.categoria, pub: publico(estatico) }
}

export function empresasCoinciden(lista: LugarPublico[], q: { municipio?: string; categoria?: string; texto?: string }): LugarPublico[] {
  const tokens = norm(q.texto ?? '').split(' ').filter((w) => w.length >= 3)
  return lista.filter((e) => {
    if (q.municipio && e.municipio !== q.municipio) return false
    if (q.categoria && e.categoria !== q.categoria) return false
    if (!tokens.length) return true
    const nombre = norm(`${e.nombre} ${e.descripcion ?? ''}`)
    return tokens.some((t) => nombre.includes(t))
  })
}

export function extrasDeEmpresas(empresas: LugarPublico[]): Lugar[] {
  return empresas.filter((e) => esEmpresa(e.id)).map(lugarDesdePublico)
}

export interface FichaPublica {
  id: string
  name: string
  category: CategoriaId
  municipality: string
  description: string
  contact: string | null
  lat: number | null
  lng: number | null
  coverUrl: string | null
}

export async function listarFichasPublicas(fetchImpl: typeof fetch = fetch): Promise<{ configurado: boolean; negocios: FichaPublica[] }> {
  const cfg = supabaseConfig()
  if (!cfg.configurado) return { configurado: false, negocios: [] }
  try {
    const headers = { apikey: cfg.clave, authorization: `Bearer ${cfg.clave}` }
    const r = await fetchImpl(
      `${cfg.url}/rest/v1/businesses?status=eq.published&select=id,name,category,municipality,description,contact,lat,lng`,
      { headers, signal: AbortSignal.timeout(4000) },
    )
    if (!r.ok) return { configurado: true, negocios: [] }
    const rows = (await r.json()) as FilaEmpresa[]
    if (!Array.isArray(rows) || !rows.length) return { configurado: true, negocios: [] }
    const ids = rows.map((row) => row.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    const fotos = new Map<string, string>()
    if (ids.length) {
      const fr = await fetchImpl(
        `${cfg.url}/rest/v1/business_photos?business_id=in.(${ids.join(',')})&is_cover=eq.true&select=business_id,storage_path`,
        { headers, signal: AbortSignal.timeout(4000) },
      )
      if (fr.ok) {
        const lista = (await fr.json()) as { business_id?: string; storage_path?: string }[]
        if (Array.isArray(lista)) {
          for (const foto of lista) {
            if (foto.business_id && foto.storage_path && !fotos.has(foto.business_id)) fotos.set(foto.business_id, foto.storage_path)
          }
        }
      }
    }
    const negocios = rows.flatMap((row) => {
      const pub = filaAPublico(row)
      if (!pub) return []
      const contact = typeof row.contact === 'string' ? row.contact.trim().slice(0, 160) : null
      return [{
        id: pub.id,
        name: row.name.trim().slice(0, 120),
        category: pub.categoria,
        municipality: pub.municipio,
        description: row.description.trim().slice(0, 800),
        contact: contact || null,
        lat: pub.lat,
        lng: pub.lon,
        coverUrl: urlFotoPublica(cfg.url, fotos.get(row.id)),
      }]
    })
    return { configurado: true, negocios }
  } catch {
    return { configurado: true, negocios: [] }
  }
}

export async function listarPublicadas(fetchImpl: typeof fetch = fetch): Promise<LugarPublico[]> {
  const cfg = supabaseConfig()
  if (!cfg.configurado) return []
  try {
    const r = await fetchImpl(
      `${cfg.url}/rest/v1/businesses?status=eq.published&select=id,name,category,municipality,description,lat,lng`,
      { headers: { apikey: cfg.clave, authorization: `Bearer ${cfg.clave}` }, signal: AbortSignal.timeout(4000) },
    )
    if (!r.ok) return []
    const rows = (await r.json()) as FilaEmpresa[]
    if (!Array.isArray(rows)) return []
    return rows.map(filaAPublico).filter((e): e is LugarPublico => !!e)
  } catch {
    return []
  }
}

const RUTA_FOTO = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-zA-Z0-9._-]+$/

export function urlFotoPublica(baseUrl: string, storagePath: string | null | undefined): string | null {
  if (!storagePath || !RUTA_FOTO.test(storagePath)) return null
  return `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/business-photos/${storagePath}`
}
