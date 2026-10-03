import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button, Chip } from '../components/ui'
import { Montanas } from '../components/Montanas'
import { getLugar } from '../data/planes'
import { useItinerario } from '../state/itinerario'
import NoEncontrado from './NoEncontrado'
import { usePagina } from '../usePagina'

export default function LugarDetalle() {
  const { id } = useParams()
  const lugar = getLugar(id)
  const { elegir } = useItinerario()
  const go = useNavigate()
  usePagina(lugar?.nombre ?? 'Lugar no encontrado')
  if (!lugar) return <NoEncontrado />
  return (
    <div className="wrap pagina detalle">
      <Link to={`/lugares?cat=${lugar.plan.id}`} className="atras"><ArrowLeft size={20} aria-hidden /> Volver a lugares</Link>
      <Montanas variante={lugar.plan.id} className="detalle-arte" />
      <Chip tone="soft">{lugar.detalle}</Chip>
      <h1 id="titulo" tabIndex={-1} className="t-h1">{lugar.nombre}</h1>
      <p className="sub">Hace parte de la ruta «{lugar.plan.titulo}». Pronto tendrás aquí más información del lugar y de quienes lo atienden.</p>
      <Button variant="cta" icon="itinerario" onClick={() => { elegir(lugar.plan.id); go('/itinerario') }}>Armar itinerario con este plan</Button>
    </div>
  )
}
