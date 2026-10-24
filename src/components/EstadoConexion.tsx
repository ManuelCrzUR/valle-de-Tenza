import { WifiOff } from 'lucide-react'
import { useOnline, useRutaGuardada } from '../state/offline'
import '../styles/offline.css'

// Indicador global de conexión. Con ruta guardada lo dice, para que se sepa que lo que se ve viene del teléfono.
export function EstadoConexion() {
  const enLinea = useOnline()
  const guardada = useRutaGuardada()
  return (
    <div aria-live="polite" className="vd-avisos">
      {!enLinea && (
        <p className="vd-sin-conexion wrap" role="status">
          <WifiOff size={20} aria-hidden />
          {guardada ? 'Sin conexión — viendo tu ruta guardada' : 'Sin conexión'}
        </p>
      )}
    </div>
  )
}
