import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './ui'
import '../styles/offline.css'

// Registra el service worker y avisa cuando hay una versión nueva (registerType: 'prompt'): se actualiza solo si la persona lo pide.
export function AvisoVersion() {
  const { needRefresh: [hay, setHay], updateServiceWorker } = useRegisterSW()
  return (
    <div aria-live="polite" className="vd-avisos">
      {hay && (
        <div className="vd-aviso-version wrap" role="status">
          <span>Hay una versión nueva.</span>
          <Button variant="primary" onClick={() => void updateServiceWorker(true)}>Actualizar</Button>
          <Button variant="ghost" onClick={() => setHay(false)}>Después</Button>
        </div>
      )}
    </div>
  )
}
