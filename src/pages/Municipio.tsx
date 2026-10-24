import { Link, useParams } from 'react-router-dom'
import { Car } from 'lucide-react'
import { CATEGORIAS, CATEGORIA_POR_ID, useCatalogo } from '../data/lugares'
import { duracionLarga, minutos, useLogistica } from '../state/logistica'
import type { RutaTransporte } from '../state/logistica'
import { eventosEntre, rangoFechas, useEventos } from '../state/contenido'
import { Atribucion } from '../components/Atribucion'
import NoEncontrado from './NoEncontrado'
import { TarjetaRuta } from './ComoLlegar'
import { usePagina } from '../usePagina'
import '../styles/como-llegar.css'
import '../styles/lugares.css'

const POR_CONFIRMAR = <em className="cl-pc">por confirmar</em>
const fechaLocal = (d: Date) => d.toLocaleDateString('en-CA')

export default function Municipio() {
  const { slug } = useParams()
  const { lugares, municipios } = useCatalogo()
  const { rutas, tramoEntre, cargando } = useLogistica()
  const eventos = useEventos()
  const mun = municipios.find((m) => m.slug === slug)
  const propios = lugares.filter((l) => l.municipio === slug)
  const visitables = propios.filter((l) => !CATEGORIA_POR_ID[l.categoria].servicio)
  usePagina(mun ? `${mun.nombre}, Valle de Tenza` : 'Municipio no encontrado',
    mun ? `Qué hacer en ${mun.nombre}, Valle de Tenza (Boyacá): ${visitables.length} lugares para visitar, cómo llegar y próximos eventos.` : undefined)
  if (!mun) return <NoEncontrado />

  const nombre = (s: string) => (s === 'bogota' ? 'Bogotá' : municipios.find((m) => m.slug === s)?.nombre ?? s)
  const conteo = CATEGORIAS.map((c) => ({ c, n: propios.filter((l) => l.categoria === c.id).length })).filter((x) => x.n > 0)
  // Destacados: primero los que tienen descripción propia o plan; luego por nombre.
  const peso = (l: (typeof visitables)[number]) => (l.extra?.descripcion ? 2 : 0) + (l.plan ? 1 : 0)
  const destacados = [...visitables].sort((a, b) => peso(b) - peso(a) || a.nombre.localeCompare(b.nombre, 'es')).slice(0, 8)
  const carro = tramoEntre('bogota', `mun:${mun.slug}`)
  const aqui: RutaTransporte[] = rutas.filter((r) => r.origen === mun.slug || r.destino === mun.slug)
  const hoy = new Date()
  const proximos = eventosEntre(fechaLocal(hoy), fechaLocal(new Date(hoy.getTime() + 60 * 864e5)), mun.slug, eventos)

  return (
    <div className="wrap pagina cl">
      <h1 id="titulo" tabIndex={-1} className="t-h1">{mun.nombre}</h1>
      <p className="sub">Municipio del Valle de Tenza, Boyacá. {visitables.length ? `${visitables.length} lugares para visitar en el mapa.` : 'Todavía no tenemos lugares para visitar registrados aquí.'}</p>

      <section className="cl-seccion" aria-labelledby="h-mu-hay">
        <h2 id="h-mu-hay" className="t-h2">Qué hay</h2>
        {conteo.length > 0 && (
          <ul className="cl-destinos" aria-label={`Lugares en ${mun.nombre} por categoría`}>
            {conteo.map(({ c, n }) => <li key={c.id}><span>{c.etiqueta}</span><strong>{n}</strong></li>)}
          </ul>
        )}
        {destacados.length > 0 && (
          <>
            <h3 className="t-h3">Para empezar</h3>
            <ul className="cl-destinos" aria-label="Lugares destacados">
              {destacados.map((l) => (
                <li key={l.id}><Link to={`/lugares/${l.id}`}>{l.nombre}</Link><span>{CATEGORIA_POR_ID[l.categoria].singular}</span></li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="cl-seccion" aria-labelledby="h-mu-llegar">
        <h2 id="h-mu-llegar" className="t-h2"><Car size={24} aria-hidden /> Cómo llegar</h2>
        <p className="cl-carro">
          Desde Bogotá en carro: {carro ? <><strong>unos {duracionLarga(minutos(carro.duracion_s))}</strong> ({Math.round(carro.distancia_m / 1000)} km)</> : cargando ? 'consultando…' : POR_CONFIRMAR}.
        </p>
        {aqui.length > 0
          ? <ul className="cl-lista">{aqui.map((r) => <TarjetaRuta key={r.id} ruta={r} nombre={nombre} />)}</ul>
          : <p className="it-aviso">Rutas de transporte público hacia {mun.nombre}: {POR_CONFIRMAR}.</p>}
        <p className="cl-nota">Tiempo estimado sin tráfico ni paradas. Más rutas y avisos de la vía en <Link to="/como-llegar">Cómo llegar</Link>.</p>
      </section>

      {proximos.length > 0 && (
        <section className="cl-seccion" aria-labelledby="h-mu-eventos">
          <h2 id="h-mu-eventos" className="t-h2">Eventos próximos</h2>
          <ul className="cl-destinos">
            {proximos.map((e) => <li key={e.id}><span>{e.nombre}</span><strong>{rangoFechas(e)}</strong></li>)}
          </ul>
        </section>
      )}
      <Atribucion />
    </div>
  )
}
