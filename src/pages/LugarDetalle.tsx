import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button, Chip } from '../components/ui'
import { LinkButton } from '../components/LinkButton'
import { Montanas } from '../components/Montanas'
import { Foto } from '../components/Foto'
import { fotoDeLugar } from '../data/fotos'
import { DatosLugar } from '../components/mapa/DatosLugar'
import { etiquetaSubtipo, CATEGORIA_POR_ID, NOMBRE_MUNICIPIO, TIPOS_RESERVA, getLugar, tieneUbicacion, tipoReserva, useCatalogo } from '../data/lugares'
import { fechaLarga } from '../state/contenido'
import { LUGAR_NEGOCIO, useOperacion } from '../state/reservas'
import { useItinerario } from '../state/itinerario'
import NoEncontrado from './NoEncontrado'
import { usePagina } from '../usePagina'
import '../styles/lugares.css'

export default function LugarDetalle() {
  const { id } = useParams()
  const { lugares } = useCatalogo()
  const lugar = lugares.find((l) => l.id === id) ?? getLugar(id)
  const { negocios } = useOperacion()
  const negocio = !lugar && id?.startsWith(LUGAR_NEGOCIO) ? negocios.find((n) => n.lugarId === id) : undefined
  const { elegir } = useItinerario()
  const go = useNavigate()
  usePagina(lugar?.nombre ?? negocio?.nombre ?? 'Lugar no encontrado')

  if (negocio) {
    const tipo = TIPOS_RESERVA.find((t) => t.id === negocio.tipo)?.etiqueta ?? negocio.tipo
    const cat = negocio.tipo === 'hotel' ? 'dormir' : negocio.tipo === 'restaurante' ? 'gastro' : negocio.tipo === 'caminata' ? 'aventura' : 'cultura'
    return (
      <div className="wrap pagina detalle">
        <Link to={`/lugares?cat=${cat}`} className="atras"><ArrowLeft size={20} aria-hidden /> Volver a lugares</Link>
        <Chip tone="strong">{tipo}</Chip>
        <h1 id="titulo" tabIndex={-1} className="t-h1">{negocio.nombre}</h1>
        <dl className="ficha-datos detalle-datos">
          <div><dt>Dónde</dt><dd>{NOMBRE_MUNICIPIO[negocio.municipio] ?? negocio.municipio}</dd></div>
          {negocio.descripcion && <div><dt>Sobre el lugar</dt><dd>{negocio.descripcion}</dd></div>}
          <div><dt>Cupo diario</dt><dd>{negocio.cupoDiario} {negocio.cupoDiario === 1 ? 'persona' : 'personas'} por día</dd></div>
        </dl>
        <div className="detalle-acciones">
          <LinkButton to={`/reservar/${negocio.lugarId}`} variant="cta">Reservar</LinkButton>
        </div>
      </div>
    )
  }
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
      <div className="detalle-datos"><DatosLugar lugar={lugar} /></div>
      {lugar.acceso && (
        <section className="detalle-acceso" aria-labelledby="h-acceso">
          <h2 id="h-acceso" className="t-h3">Cómo llegar a este lugar</h2>
          <p className="detalle-acceso-texto">{lugar.acceso}</p>
          <p className="detalle-acceso-ver">{lugar.verificadoEn ? `Verificado el ${fechaLarga(lugar.verificadoEn)}` : 'Sin verificar'}</p>
        </section>
      )}
      <div className="detalle-acciones">
        {tipoReserva(lugar) && <LinkButton to={`/reservar/${lugar.id}`} variant="cta">Reservar</LinkButton>}
        {tieneUbicacion(lugar) && <LinkButton to={`/mapa?lugar=${lugar.id}`} variant="secondary">Ver en el mapa</LinkButton>}
        {plan && <Button variant="secondary" icon="itinerario" onClick={() => { elegir(plan); go('/itinerario') }}>Armar itinerario con este plan</Button>}
      </div>
    </div>
  )
}
