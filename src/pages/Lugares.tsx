import type { CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Option, PlaceCard } from '../components/ui'
import { Montanas } from '../components/Montanas'
import { CATEGORIA_POR_ID, LUGARES, MUNICIPIOS, NOMBRE_MUNICIPIO } from '../data/lugares'
import type { TipoReserva } from '../data/lugares'
import { PLANES } from '../data/planes'
import { LUGAR_NEGOCIO, negocioDeLugar, useDemo } from '../state/demo'
import { usePagina } from '../usePagina'
import '../styles/lugares.css'

type Filtro = 'aventura' | 'gastro' | 'cultura' | 'dormir'
const FILTROS: { id: Filtro; texto: string; icono: 'naturaleza' | 'gastronomia' | 'cultura' | 'hospedaje' }[] = [
  ...PLANES.map((p) => ({ id: p.id as Filtro, texto: p.categoria, icono: p.icono })),
  { id: 'dormir', texto: 'Dónde dormir', icono: 'hospedaje' },
]
// Regla para los negocios nuevos de prestadores (no están en el mapa y no tienen plan):
// hotel -> dormir, restaurante -> gastro, caminata -> aventura, actividad -> cultura.
const FILTRO_DE_TIPO: Record<TipoReserva, Filtro> = { hotel: 'dormir', restaurante: 'gastro', caminata: 'aventura', actividad: 'cultura' }

export default function Lugares() {
  usePagina('Qué lugares hay')
  const [params, setParams] = useSearchParams()
  const go = useNavigate()
  const { negocios } = useDemo()
  const cat = FILTROS.find((f) => f.id === params.get('cat'))?.id ?? 'aventura'
  const mun = MUNICIPIOS.some((m) => m.slug === params.get('mun')) ? params.get('mun')! : ''
  const cambiar = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(cambios)) v ? p.set(k, v) : p.delete(k)
    setParams(p, { replace: true })
  }

  const lugares = LUGARES.filter((l) => (cat === 'dormir' ? l.categoria === 'alojamiento' : l.plan === cat) && (!mun || l.municipio === mun))
  const nuevos = negocios.filter((n) => n.lugarId.startsWith(LUGAR_NEGOCIO) && FILTRO_DE_TIPO[n.tipo] === cat && (!mun || n.municipio === mun))
  const total = lugares.length + nuevos.length
  const filtroActual = FILTROS.find((f) => f.id === cat)!

  return (
    <div className="wrap pagina">
      <div className="lugares-cab">
        <div className="lugares-texto">
          <h1 id="titulo" tabIndex={-1} className="t-h1">Qué lugares hay</h1>
          <p className="sub">Explora el Valle por categoría.</p>
          <div className="lugares-filtros">
            <div className="opts" role="group" aria-label="Categoría">
              {FILTROS.map((f) => <Option key={f.id} icon={f.icono} selected={f.id === cat} onClick={() => cambiar({ cat: f.id })}>{f.texto}</Option>)}
            </div>
            <label className="lugares-mun">
              <span className="vd-field-label">Municipio</span>
              <select className="vd-input" value={mun} onChange={(e) => cambiar({ mun: e.target.value })}>
                <option value="">Los 7 municipios</option>
                {MUNICIPIOS.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}
              </select>
            </label>
          </div>
        </div>
        <Montanas key={cat} variante={cat === 'dormir' ? 'cultura' : cat} className="lugares-arte" />
      </div>
      <p className="lugares-conteo" role="status">{total} {total === 1 ? 'lugar' : 'lugares'}</p>
      {total === 0 ? (
        <div className="lugares-vacio">
          <h2 className="t-h3">Aún no hay lugares aquí</h2>
          <p>No encontramos lugares de «{filtroActual.texto}»{mun ? ` en ${NOMBRE_MUNICIPIO[mun]}` : ''}. Prueba con otro municipio o categoría.</p>
          {mun && <Option onClick={() => cambiar({ mun: '' })}>Ver los 7 municipios</Option>}
        </div>
      ) : (
        <div className="grid" key={`${cat}-${mun}`}>
          {lugares.map((l, i) => {
            const reserva = negocioDeLugar(negocios, l.id)
            return (
              <div key={l.id} className="aparece grid-item" style={{ '--i': Math.min(i, 12) } as CSSProperties}>
                <PlaceCard
                  chip={CATEGORIA_POR_ID[l.categoria].singular}
                  title={l.nombre}
                  description={l.subtipo && l.categoria !== 'alojamiento' ? l.subtipo : l.categoria === 'alojamiento' ? l.subtipo || undefined : undefined}
                  meta={`${NOMBRE_MUNICIPIO[l.municipio]}${reserva ? ' · Recibe reservas' : ''}`}
                  onClick={() => go(`/lugares/${l.id}`)}
                />
              </div>
            )
          })}
          {nuevos.map((n, i) => (
            <div key={n.id} className="aparece grid-item" style={{ '--i': Math.min(lugares.length + i, 12) } as CSSProperties}>
              <PlaceCard chip="Recibe reservas" chipTone="strong" title={n.nombre} description={n.descripcion || undefined} meta={NOMBRE_MUNICIPIO[n.municipio] ?? n.municipio} onClick={() => go(`/lugares/${n.lugarId}`)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
