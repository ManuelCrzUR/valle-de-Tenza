import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Chip } from '../components/ui'
import { LinkButton } from '../components/LinkButton'
import { Montanas } from '../components/Montanas'
import { Foto } from '../components/Foto'
import { fotoDeLugar } from '../data/fotos'
import { DatosLugar } from '../components/mapa/DatosLugar'
import { etiquetaSubtipo, CATEGORIA_POR_ID, getLugar, tieneUbicacion } from '../data/lugares'
import { lugarDeFicha } from '../data/empresaLugar'
import { useNegocios } from '../state/negocios'
import NoEncontrado from './NoEncontrado'
import { usePagina } from '../usePagina'
import '../styles/lugares.css'

export default function LugarDetalle() {
  const { id } = useParams()
  const negocios = useNegocios()
  const negocio = negocios.find((n) => n.id === id)
  const lugar = getLugar(id) ?? (negocio ? lugarDeFicha(negocio) : undefined)
  usePagina(lugar?.nombre ?? 'Lugar no encontrado')
  if (!lugar) return <NoEncontrado />

  const plan = lugar.plan
  const foto = fotoDeLugar(lugar)
  const volver = plan ?? (lugar.categoria === 'alojamiento' ? 'dormir' : 'aventura')
  return (
    <div className="wrap pagina detalle">
      <Link to={`/lugares?cat=${volver}`} className="atras"><ArrowLeft size={20} aria-hidden /> Volver a lugares</Link>
      {foto ? <Foto key={foto} n={foto} className="detalle-arte" /> : <Montanas variante={plan ?? 'cultura'} className="detalle-arte" />}
      <Chip tone="soft">{CATEGORIA_POR_ID[lugar.categoria].singular}{lugar.subtipo && lugar.categoria === 'alojamiento' ? ` · ${etiquetaSubtipo(lugar.subtipo)}` : ''}</Chip>
      <h1 id="titulo" tabIndex={-1} className="t-h1">{lugar.nombre}</h1>
      {negocio?.coverUrl && <img className="detalle-arte" src={negocio.coverUrl} alt="" />}
      {negocio && <p>{negocio.description}</p>}
      {negocio?.contact && <p>Contacto público: {negocio.contact}</p>}
      {negocio && <p>Empresa publicada por su titular. No confirma cupo ni reserva.</p>}
      <div className="detalle-datos"><DatosLugar lugar={lugar} /></div>
      <div className="detalle-acciones">
        <LinkButton to={negocio ? '/plan' : `/plan?lugar=${lugar.id}`} variant="cta" icon="itinerario">{negocio ? 'Pedirlo en el plan' : 'Incluir en mi plan'}</LinkButton>
        {tieneUbicacion(lugar) && <LinkButton to={`/mapa?lugar=${lugar.id}`} variant="secondary">Ver en el mapa</LinkButton>}
      </div>
    </div>
  )
}
