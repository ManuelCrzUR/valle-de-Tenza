import type { CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Option, PlaceCard } from '../components/ui'
import { Montanas } from '../components/Montanas'
import { PLANES, getPlan } from '../data/planes'
import { usePagina } from '../usePagina'

export default function Lugares() {
  usePagina('Qué lugares hay')
  const [params, setParams] = useSearchParams()
  const go = useNavigate()
  const plan = getPlan(params.get('cat')) ?? PLANES[0]
  return (
    <div className="wrap pagina">
      <div className="lugares-cab">
        <div className="lugares-texto">
          <h1 id="titulo" tabIndex={-1} className="t-h1">Qué lugares hay</h1>
          <p className="sub">Explora el Valle por categoría.</p>
          <div className="opts" role="group" aria-label="Categoría">
            {PLANES.map((p) => (
              <Option key={p.id} icon={p.icono} selected={p.id === plan.id} onClick={() => setParams({ cat: p.id }, { replace: true })}>{p.categoria}</Option>
            ))}
          </div>
        </div>
        <Montanas key={plan.id} variante={plan.id} className="lugares-arte" />
      </div>
      <div className="grid" key={plan.id}>
        {plan.paradas.map((x, i) => (
          <div key={x.id} className="aparece grid-item" style={{ '--i': i } as CSSProperties}>
            <PlaceCard chip={x.detalle} title={x.nombre} meta={`En «${plan.opcion}»`} onClick={() => go(`/lugares/${x.id}`)} />
          </div>
        ))}
      </div>
    </div>
  )
}
