import { useEffect, useState } from 'react'
import { Button } from '../ui'
import { supabase } from '../../lib/supabase'

type Estado = 'cargando' | 'inactivo' | 'activo' | 'bloqueado' | 'no-soportado'

function soportado(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function claveAUint8(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4)
  const bin = atob((base64url + relleno).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function AvisosPush() {
  const [estado, setEstado] = useState<Estado>(soportado() ? 'cargando' : 'no-soportado')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!soportado()) return
    let vivo = true
    async function leer() {
      if (Notification.permission === 'denied') { if (vivo) setEstado('bloqueado'); return }
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw-avisos.js') ?? await navigator.serviceWorker.getRegistration()
        const sub = await reg?.pushManager.getSubscription()
        if (vivo) setEstado(sub ? 'activo' : 'inactivo')
      } catch {
        if (vivo) setEstado('inactivo')
      }
    }
    void leer()
    return () => { vivo = false }
  }, [])

  async function activar() {
    if (!supabase) return
    setOcupado(true)
    setMensaje('')
    try {
      const r = await fetch('/api/avisos-clave')
      if (r.status === 503) { setMensaje('Los avisos aún no están configurados en el servidor.'); return }
      if (!r.ok) { setMensaje('No pude pedir la clave de avisos. Inténtalo más tarde.'); return }
      const { clave } = await r.json() as { clave?: string }
      if (!clave) { setMensaje('Los avisos aún no están configurados en el servidor.'); return }

      const registro = await navigator.serviceWorker.register('/sw-avisos.js')
      await navigator.serviceWorker.ready
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'inactivo')
        setMensaje('No diste permiso para mostrar avisos.')
        return
      }
      const sub = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveAUint8(clave) })
      const llaves = sub.toJSON().keys
      if (!llaves?.p256dh || !llaves.auth) { setMensaje('El navegador no entregó las llaves del aviso.'); return }
      const { error } = await supabase.from('push_subscriptions').insert({
        endpoint: sub.endpoint, p256dh: llaves.p256dh, auth: llaves.auth, user_agent: navigator.userAgent.slice(0, 200),
      })
      if (error && error.code !== '23505') {
        await sub.unsubscribe().catch(() => undefined)
        setMensaje('No pude guardar la activación. Inténtalo de nuevo.')
        return
      }
      setEstado('activo')
      setMensaje('Avisos activados en este dispositivo.')
    } catch {
      setMensaje('No pude activar los avisos en este dispositivo.')
    } finally {
      setOcupado(false)
    }
  }

  async function desactivar() {
    if (!supabase) return
    setOcupado(true)
    setMensaje('')
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw-avisos.js') ?? await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
      }
      setEstado('inactivo')
      setMensaje('Avisos desactivados en este dispositivo.')
    } catch {
      setMensaje('No pude desactivar los avisos.')
    } finally {
      setOcupado(false)
    }
  }

  const textoEstado: Record<Estado, string> = {
    cargando: 'Revisando el estado…',
    inactivo: 'Estado: inactivo en este dispositivo.',
    activo: 'Estado: activo en este dispositivo.',
    bloqueado: 'Estado: bloqueado. Permite las notificaciones de este sitio en los ajustes del navegador.',
    'no-soportado': '',
  }

  return (
    <section className="avisos-push" aria-labelledby="avisos-titulo">
      <h2 id="avisos-titulo" className="t-h2">Avisos en este dispositivo</h2>
      {estado === 'no-soportado' ? (
        <p>Este navegador no admite avisos. En iPhone, primero agrega la app a la pantalla de inicio (Compartir → Agregar a inicio).</p>
      ) : (
        <>
          <p>{textoEstado[estado]}</p>
          {estado === 'activo'
            ? <Button variant="secondary" onClick={() => void desactivar()} disabled={ocupado}>Desactivar</Button>
            : <Button variant="secondary" onClick={() => void activar()} disabled={ocupado || estado === 'bloqueado' || estado === 'cargando'}>Activar avisos en este dispositivo</Button>}
          <p className="avisos-nota">Recibirás un aviso sin datos personales; los detalles están en este panel.</p>
        </>
      )}
      <p aria-live="polite" role="status">{mensaje}</p>
    </section>
  )
}
