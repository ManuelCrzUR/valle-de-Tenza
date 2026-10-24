import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { LinkButton } from '../components/LinkButton'
import { Foto } from '../components/Foto'
import { FOTOS } from '../data/fotos'
import '../styles/galeria.css'
import { Chip } from '../components/ui'
import { NOMBRE_MUNICIPIO } from '../data/lugares'
import { eventosEntre, fechaLarga, finDeSemana, rangoFechas, useEventos } from '../state/contenido'
import { usePagina } from '../usePagina'

const PASOS = [
  ['Elige tu plan', 'Naturaleza, gastronomía o cultura. Tú decides por dónde empezar.'],
  ['Recibe tu itinerario', 'Arma una ruta con lugares reales del Valle: paradas cercanas entre sí, dónde comer y dónde dormir.'],
  ['Mira tu ruta', 'Verla en el mapa, parada por parada.'],
  ['Reserva y pregunta', 'Reserva hospedaje, comida y actividades directo con los negocios y pregunta lo que falte al chatbot o a un embajador.'],
]

export default function Inicio() {
  usePagina('Viaja al Valle de Tenza')
  const todos = useEventos()
  const hoyF = new Date().toLocaleDateString('en-CA')
  const fin = finDeSemana()
  // Los del fin de semana (vie a dom) y los que ya están en curso hoy.
  const eventos = [...new Map([...eventosEntre(fin.desde, fin.hasta, undefined, todos), ...eventosEntre(hoyF, hoyF, undefined, todos)].map((e) => [e.id, e])).values()]
    .sort((a, b) => a.desde.localeCompare(b.desde))
  return (
    <>
      <section className="hero wrap">
        <div className="hero-texto">
          <p className="overline aparece" style={{ '--i': 0 } as CSSProperties}>Valle de Tenza, Boyacá</p>
          <h1 id="titulo" tabIndex={-1} className="t-display aparece" style={{ '--i': 1 } as CSSProperties}>¿Quieres viajar al Valle de Tenza este fin de semana?</h1>
          <p className="lead aparece" style={{ '--i': 2 } as CSSProperties}>Sin perder horas buscando información dispersa. Elige tu plan y te armamos el itinerario.</p>
          <div className="hero-acciones aparece" style={{ '--i': 3 } as CSSProperties}>
            <LinkButton to="/itinerario" variant="cta" icon="itinerario">Armar mi itinerario</LinkButton>
            <Link to="/lugares" className="vd-btn vd-btn-ghost">Qué lugares hay</Link>
            <Link to="/como-llegar" className="vd-btn vd-btn-ghost">Cómo llegar</Link>
          </div>
        </div>
        <Foto n={3} className="hero-arte" />
      </section>

      {eventos.length > 0 && (
        <section className="wrap seccion" aria-labelledby="h-eventos">
          <h2 id="h-eventos" className="t-h2">Este fin de semana en el Valle</h2>
          <ul className="eventos">
            {eventos.map((e) => (
              <li key={e.id} className="evento">
                <h3 className="t-h3">{e.nombre}</h3>
                <p className="evento-meta"><Chip tone="strong">{NOMBRE_MUNICIPIO[e.municipio] ?? e.municipio}</Chip> <span>{rangoFechas(e)}</span></p>
                {e.descripcion && <p>{e.descripcion}</p>}
                {e.verificadoEn && <p className="evento-ver">Verificado el {fechaLarga(e.verificadoEn)}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="wrap seccion">
        <h2 className="t-h2">Así funciona</h2>
        <ol className="pasos">
          {PASOS.map(([t, d], i) => (
            <li key={t} className="aparece" style={{ '--i': i } as CSSProperties}>
              <span className="paso-n" aria-hidden>{i + 1}</span>
              <div><h3 className="t-h3">{t}</h3><p>{d}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="wrap seccion">
        <h2 className="t-h2">Rincones del Valle</h2>
        <div className="rincones">
          {([1, 5, 12, 17, 9, 14] as const).map((n) => (
            <Link key={n} to={`/galeria?mun=${FOTOS[n].municipio}`} aria-label={`Ver la galería de ${FOTOS[n].pie}`}>
              <img src={`${import.meta.env.BASE_URL}${FOTOS[n].archivo}`} alt={FOTOS[n].pie} loading="lazy" decoding="async" />
            </Link>
          ))}
        </div>
        <LinkButton to="/galeria" variant="secondary">Ver las 19 fotos</LinkButton>
      </section>

      <section className="wrap seccion promesa">
        <Chip tone="strong">Reserva directa</Chip>
        <p className="t-h2">Los negocios actualizan su cupo cada día; si no lo hacen, te lo decimos. La plata del viaje se queda en los negocios del Valle.</p>
      </section>

      <section className="wrap seccion seccion-prest">
        <h2 className="t-h2">¿Tienes un hospedaje, restaurante o guías en el Valle?</h2>
        <p className="sub">Recibe solicitudes de reserva directas de viajeros, sin intermediarios externos.</p>
        <LinkButton to="/prestadores" variant="secondary">Conoce Valle Directo para prestadores</LinkButton>
      </section>
    </>
  )
}
