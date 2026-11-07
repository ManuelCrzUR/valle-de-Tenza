import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { authConfigurado, supabase } from '../lib/supabase'

interface Ctx {
  configurado: boolean
  listo: boolean
  usuario: User | null
  sesion: Session | null
}

const SesionCtx = createContext<Ctx | null>(null)

export function SesionProvider({ children }: { children: ReactNode }) {
  const [listo, setListo] = useState(!authConfigurado)
  const [sesion, setSesion] = useState<Session | null>(null)

  useEffect(() => {
    if (!supabase) return
    let activo = true
    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return
      setSesion(data.session)
      setListo(true)
    }).catch(() => { if (activo) setListo(true) })
    const { data } = supabase.auth.onAuthStateChange((_evento, siguiente) => {
      setSesion(siguiente)
      setListo(true)
    })
    return () => {
      activo = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<Ctx>(() => ({
    configurado: authConfigurado,
    listo,
    usuario: sesion?.user ?? null,
    sesion,
  }), [listo, sesion])

  return <SesionCtx.Provider value={value}>{children}</SesionCtx.Provider>
}

export function useSesion(): Ctx {
  const ctx = useContext(SesionCtx)
  if (!ctx) throw new Error('useSesion fuera de SesionProvider')
  return ctx
}
