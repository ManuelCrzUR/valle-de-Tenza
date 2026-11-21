import { idEmpresa, idEstatico, esEmpresa } from '../shared/ids.js'
import type { CategoriaId } from '../src/data/lugares.js'
import { lugarDesdePublico } from '../src/data/empresaLugar.js'
import type { Lugar } from '../src/data/lugares.js'
import { SLUGS, porId, publico } from './catalogo.js'
import type { LugarPublico } from './catalogo.js'
import { supabaseConfig } from './env.js'
import { norm, sinDatosPersonales } from './texto.js'
import { DIAS_SEMANA } from '../shared/contacto.js'
import type { Horario } from '../shared/contacto.js'

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
  phone?: string | null
  whatsapp?: string | null
  website?: string | null
  instagram?: string | null
  facebook?: string | null
  price_from_cop?: number | null
  price_note?: string | null
  hours?: unknown
  hours_note?: string | null
  services?: unknown
  menu_path?: string | null
  info_updated_at?: string | null
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
  phone: string | null
  whatsapp: string | null
  website: string | null
  instagram: string | null
  facebook: string | null
  priceFromCop: number | null
  priceNote: string | null
  hours: Horario | null
  hoursNote: string | null
  services: string[]
  menuUrl: string | null
  infoUpdatedAt: string | null
  prices: { item: string; priceCop: number | null; note: string | null }[]
}

const COLUMNAS_FICHA = 'id,name,category,municipality,description,contact,lat,lng,website,instagram,facebook,price_from_cop,price_note,hours,hours_note,services,menu_path,info_updated_at,phone,whatsapp'

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, max)
  return t || null
}

function enteroCop(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 50_000_000 ? v : null
}

function urlHttps(v: unknown, max: number): string | null {
  const t = texto(v, max)
  return t && t.startsWith('https://') ? t : null
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

export function horarioSeguro(v: unknown): Horario | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const salida: Horario = {}
  for (const { id } of DIAS_SEMANA) {
    const d = (v as Record<string, unknown>)[id]
    if (!d || typeof d !== 'object') continue
    const { abre, cierra, cerrado } = d as Record<string, unknown>
    if (cerrado === true) salida[id] = { cerrado: true }
    else if (typeof abre === 'string' && typeof cierra === 'string' && HORA.test(abre) && HORA.test(cierra)) salida[id] = { abre, cierra }
  }
  return Object.keys(salida).length ? salida : null
}

const USUARIO_INSTAGRAM = /^[A-Za-z0-9._]{1,30}$/

function fechaIso(v: unknown): string | null {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null
}

export async function listarFichasPublicas(fetchImpl: typeof fetch = fetch): Promise<{ configurado: boolean; negocios: FichaPublica[] }> {
  const cfg = supabaseConfig()
  if (!cfg.configurado) return { configurado: false, negocios: [] }
  try {
    const headers = { apikey: cfg.clave, authorization: `Bearer ${cfg.clave}` }
    const r = await fetchImpl(
      `${cfg.url}/rest/v1/businesses_public?select=${COLUMNAS_FICHA}`,
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
    const precios = new Map<string, FichaPublica['prices']>()
    if (ids.length) {
      const pr = await fetchImpl(
        `${cfg.url}/rest/v1/business_prices?business_id=in.(${ids.join(',')})&order=sort_order&select=business_id,item,price_cop,note`,
        { headers, signal: AbortSignal.timeout(4000) },
      )
      if (pr.ok) {
        const lista = (await pr.json()) as { business_id?: string; item?: string; price_cop?: number | null; note?: string | null }[]
        if (Array.isArray(lista)) {
          for (const p of lista) {
            const item = texto(p?.item, 120)
            if (!p?.business_id || !item) continue
            const grupo = precios.get(p.business_id) ?? []
            grupo.push({ item, priceCop: enteroCop(p.price_cop), note: texto(p.note, 160) })
            precios.set(p.business_id, grupo)
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
        phone: texto(row.phone, 30),
        whatsapp: texto(row.whatsapp, 30),
        website: urlHttps(row.website, 200),
        instagram: typeof row.instagram === 'string' && USUARIO_INSTAGRAM.test(row.instagram.trim().replace(/^@/, '')) ? row.instagram.trim().replace(/^@/, '') : null,
        facebook: urlHttps(row.facebook, 200),
        priceFromCop: enteroCop(row.price_from_cop),
        priceNote: texto(row.price_note, 200),
        hours: horarioSeguro(row.hours),
        hoursNote: texto(row.hours_note, 200),
        services: Array.isArray(row.services) ? row.services.flatMap((x) => { const t = texto(x, 60); return t ? [t] : [] }).slice(0, 30) : [],
        menuUrl: urlMenuPublico(cfg.url, row.menu_path),
        infoUpdatedAt: fechaIso(row.info_updated_at),
        prices: precios.get(row.id) ?? [],
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
      `${cfg.url}/rest/v1/businesses_public?select=id,name,category,municipality,description,lat,lng`,
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

const RUTA_MENU = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-zA-Z0-9._-]+\.pdf$/

export function urlMenuPublico(baseUrl: string, menuPath: string | null | undefined): string | null {
  if (!menuPath || !RUTA_MENU.test(menuPath)) return null
  return `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/business-menus/${menuPath}`
}
