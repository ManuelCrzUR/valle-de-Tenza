import { useSyncExternalStore } from 'react'

// true mientras la consulta de medios (ej. '(min-width: 1024px)') se cumple; se actualiza al redimensionar.
export function useMedia(consulta: string): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(consulta); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => window.matchMedia(consulta).matches,
    () => false,
  )
}
