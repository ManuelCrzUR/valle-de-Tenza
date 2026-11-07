import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { LinkButton } from '../components/LinkButton'
import { Foto } from '../components/Foto'
import { FOTOS } from '../data/fotos'
import '../styles/galeria.css'
import { Chip } from '../components/ui'
import { usePagina } from '../usePagina'

const PASOS = [
  ['Cuéntalo', 'Escribe o habla: municipio, días y si quieres naturaleza, comida o cultura.'],
  ['Revisa el plan', 'Las paradas salen del catálogo real. Puedes quitarlas o pedir un cambio.'],
  ['Míralo en el mapa', 'Una línea une las paradas en orden. Es un esquema, no una carretera.'],
  ['Envía la solicitud', 'Pides el plan. No confirma cupo, no cobra y no reserva.'],
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
            <LinkButton to="/plan" variant="cta" icon="itinerario">Armar mi plan</LinkButton>
            <Link to="/lugares" className="vd-btn vd-btn-ghost">Qué lugares hay</Link>
          </div>
        </div>
        <Foto n={3} className="hero-arte" />
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
        <Chip tone="soft">Solicitud, no reserva</Chip>
        <p className="t-h2">El plan usa lugares del catálogo. Enviar la solicitud no aparta cupo ni confirma una reserva.</p>
        <p><Link to="/prestadores">Tengo un negocio en el Valle</Link></p>
      </section>
    </>
  )
}
