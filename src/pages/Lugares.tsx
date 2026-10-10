import type { CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Option, PlaceCard } from '../components/ui'
import { Montanas } from '../components/Montanas'
import { LUGARES, CATEGORIAS } from '../data/lugares'
import { usePagina } from '../usePagina'

export default function Lugares() {
  usePagina('Qué lugares hay')
  const [params, setParams] = useSearchParams()
  const go = useNavigate()
  
  // Categoría seleccionada actual (por defecto la primera de la lista)
  const catActual = params.get('cat') || CATEGORIAS[0].id

  // Filtramos los lugares según la categoría seleccionada en el menú
  const lugaresFiltrados = LUGARES.filter(
    (l) => l.categoria === catActual
  )

  return (
    <div className="wrap pagina">
      <div className="lugares-cab">
        <div className="lugares-texto">
          <h1 id="titulo" tabIndex={-1} className="t-h1">Qué lugares hay</h1>
          <p className="sub">Explora el Valle por categoría.</p>
          <div className="opts" role="group" aria-label="Categoría">
            {CATEGORIAS.map((c) => (
              <Option 
                key={c.id} 
                selected={c.id === catActual} 
                onClick={() => setParams({ cat: c.id }, { replace: true })}
              >
                {c.etiqueta}
              </Option>
            ))}
          </div>
        </div>
        <Montanas key={catActual} variante={catActual} className="lugares-arte" />
      </div>
      <div className="grid" key={catActual}>
        {lugaresFiltrados.length > 0 ? (
          lugaresFiltrados.map((x, i) => (
            <div key={x.id} className="aparece grid-item" style={{ '--i': i } as CSSProperties}>
              <PlaceCard 
                chip={x.subtipo} 
                title={x.nombre} 
                meta={`En «${x.municipio}»`} 
                onClick={() => go(`/lugares/${x.id}`)} 
              />
            </div>
          ))
        ) : (
          <p className="sub" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem' }}>
            No hay lugares registrados en esta categoría todavía.
          </p>
        )}
      </div>
    </div>
  )
}
