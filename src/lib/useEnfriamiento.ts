import { useCallback, useEffect, useState } from 'react'
import { ENFRIAMIENTO_CORREO_S } from './enlaceAuth'

/** Cuenta regresiva en segundos para bloquear un botón (reenvío de correo) tras usarlo. */
export function useEnfriamiento(segundos = ENFRIAMIENTO_CORREO_S) {
  const [restan, setRestan] = useState(0)
  useEffect(() => {
    if (restan <= 0) return
    const t = window.setTimeout(() => setRestan((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [restan])
  const iniciar = useCallback(() => setRestan(segundos), [segundos])
  return { restan, iniciar }
}
