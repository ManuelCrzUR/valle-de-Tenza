import { useCallback, useEffect, useState } from 'react'
import { Button } from '../ui'
import { enlaceTel, enlaceWhatsapp, numeroWhatsapp } from '../../../shared/contacto'
import { supabase } from '../../lib/supabase'

interface Solicitud {
  request_id: string
  business_id: string
  business_name: string
  nombre: string
  correo: string | null
  telefono: string | null
  fecha: string
  personas: number
  nota: string | null
  created_at: string
}

const REFRESCO_MS = 60_000

/** `fecha` es un `date` (AAAA-MM-DD): se formatea en UTC para no correrla por zona horaria. */
function fechaLegible(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  if (!a || !m || !d) return fecha
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, d)))
}

function recibidaEl(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(iso))
}

export function SolicitudesRecibidas() {
  const [items, setItems] = useState<Solicitud[] | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async () => {
    if (!supabase) return
    setCargando(true)
    const { data, error: err } = await supabase.rpc('mis_solicitudes')
    setCargando(false)
    if (err) {
      setError('No pude cargar tus solicitudes. Revisa tu conexión e inténtalo de nuevo.')
      return
    }
    setError('')
    setItems((data ?? []) as Solicitud[])
  }, [])

  useEffect(() => {
    void cargar()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void cargar()
    }, REFRESCO_MS)
    return () => window.clearInterval(id)
  }, [cargar])

  return (
    <section className="solicitudes" aria-labelledby="solicitudes-titulo">
      <div className="solicitudes-cabecera">
        <h2 id="solicitudes-titulo" className="t-h2">Solicitudes recibidas</h2>
        <Button variant="secondary" onClick={() => void cargar()} disabled={cargando}>
          {cargando ? 'Actualizando…' : 'Actualizar'}
        </Button>
      </div>
      <p className="solicitudes-privacidad">Estos datos son personales: úsalos solo para responder esta solicitud (Ley 1581 de 2012).</p>
      <div aria-live="polite">
        {error && <p className="solicitudes-error" role="alert">{error}</p>}
        {!error && items === null && <p>Cargando solicitudes…</p>}
        {!error && items?.length === 0 && (
          <p>Aún no tienes solicitudes. Llegan aquí cuando un viajero te incluye en su plan y acepta compartir sus datos.</p>
        )}
      </div>
      <ul className="solicitudes-lista">
        {(items ?? []).map((s) => {
          const fecha = fechaLegible(s.fecha)
          const wa = numeroWhatsapp(s.telefono)
          const tel = enlaceTel(s.telefono)
          const asunto = `Tu solicitud del ${fecha} en ${s.business_name}`
          return (
            <li key={`${s.request_id}-${s.business_id}`} className="panel solicitud-card">
              <h3 className="solicitud-negocio">{s.business_name}</h3>
              <p><strong>{fecha}</strong> · {s.personas} {s.personas === 1 ? 'persona' : 'personas'}</p>
              <p>Viajero: {s.nombre}</p>
              {s.nota && <p className="solicitud-nota">Nota: {s.nota}</p>}
              <p className="solicitud-recibida">Recibida el {recibidaEl(s.created_at)}</p>
              <div className="solicitud-acciones">
                {wa && (
                  <a className="vd-btn vd-btn-secondary" target="_blank" rel="noopener noreferrer"
                    href={enlaceWhatsapp(wa, `Hola ${s.nombre}, te escribimos de ${s.business_name} por tu solicitud del ${fecha}.`)}>
                    WhatsApp al viajero
                  </a>
                )}
                {tel && <a className="vd-btn vd-btn-secondary" href={tel}>Llamar</a>}
                {s.correo && (
                  <a className="vd-btn vd-btn-secondary" href={`mailto:${s.correo}?subject=${encodeURIComponent(asunto)}`}>
                    Escribir correo
                  </a>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
