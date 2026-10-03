import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { LinkButton } from '../components/LinkButton'
import { Montanas } from '../components/Montanas'
import { Chip } from '../components/ui'
import { usePagina } from '../usePagina'

const PASOS = [
  ['Elige tu plan', 'Naturaleza, gastronomía o cultura. Tú decides por dónde empezar.'],
  ['Recibe tu itinerario', 'Un hospedaje con cupo verificado hoy y las paradas en orden.'],
  ['Mira tu ruta', 'Un esquema de tu recorrido, sin buscadores ni catálogos.'],
  ['Pregunta lo que falte', 'El chatbot responde a cualquier hora; un embajador te atiende en horario de oficina.'],
]

export default function Inicio() {
  usePagina('Viaja al Valle de Tenza')
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
          </div>
        </div>
        <Montanas className="hero-arte" />
      </section>

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

      <section className="wrap seccion promesa">
        <Chip tone="strong" icon="cupo-verificado">Cupo verificado hoy</Chip>
        <p className="t-h2">Todo lo que ves en la app es cierto ese día. La plata del viaje se queda en los negocios del Valle.</p>
      </section>
    </>
  )
}
