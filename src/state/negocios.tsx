import { useEffect, useState } from 'react'
import type { CategoriaId } from '../data/lugares'

export interface NegocioPublico {
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

export function useNegocios(): NegocioPublico[] {
  const [lista, setLista] = useState<NegocioPublico[]>([])
  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/negocios', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { negocios: [] }))
      .then((d: { negocios?: NegocioPublico[] }) => {
        if (Array.isArray(d.negocios)) setLista(d.negocios.filter((n) => typeof n?.id === 'string' && n.id.startsWith('business:')))
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [])
  return lista
}
