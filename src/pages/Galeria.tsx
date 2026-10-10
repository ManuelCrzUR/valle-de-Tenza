import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { Option } from '../components/ui'
import { FOTOS_LISTA } from '../data/fotos'
import { MUNICIPIOS, NOMBRE_MUNICIPIO } from '../data/lugares'
import { usePagina } from '../usePagina'
import '../styles/galeria.css'

const base = import.meta.env.BASE_URL
const CON_FOTOS = MUNICIPIOS.filter((m) => FOTOS_LISTA.some((f) => f.municipio === m.slug))

export default function Galeria() {
  usePagina('Galería del Valle')
  const [params, setParams] = useSearchParams()
  const mun = params.get('mun') ?? ''
  const fotos = FOTOS_LISTA.filter((f) => !mun || f.municipio === mun)
  const [abierta, setAbierta] = useState<number | null>(null)   // posición dentro de `fotos`
  const dlg = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const actual = abierta === null ? undefined : fotos[abierta]

  useEffect(() => {
    const d = dlg.current
    if (!d) return
    if (actual && !d.open) d.showModal()
    if (!actual && d.open) d.close()
  }, [actual])
  const cerrar = () => { setAbierta(null); opener.current?.focus() }
  const mover = (d: number) => setAbierta((i) => (i === null ? i : (i + d + fotos.length) % fotos.length))

  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Galería del Valle</h1>
      <p className="sub">{FOTOS_LISTA.length} rincones de los municipios del Valle de Tenza. Toca una foto para verla grande.</p>
      <div className="opts" role="group" aria-label="Municipio">
        <Option selected={!mun} onClick={() => setParams({}, { replace: true })}>Todos</Option>
        {CON_FOTOS.map((m) => <Option key={m.slug} selected={mun === m.slug} onClick={() => setParams({ mun: m.slug }, { replace: true })}>{m.nombre}</Option>)}
      </div>
      <p className="galeria-conteo" role="status">{fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}</p>
      <ul className="galeria" key={mun}>
        {fotos.map((f, i) => (
          <li key={f.n} className="aparece" style={{ '--i': Math.min(i, 12) } as CSSProperties}>
            <button type="button" className="galeria-foto" onClick={(e) => { opener.current = e.currentTarget; setAbierta(i) }} aria-label={`Ver grande: ${f.pie}`}>
              <img src={`${base}${f.archivo}`} alt="" loading="lazy" decoding="async" />
              <span className="galeria-pie"><strong>{f.pie}</strong><small>{NOMBRE_MUNICIPIO[f.municipio]}</small></span>
            </button>
          </li>
        ))}
      </ul>

      <dialog ref={dlg} className="visor" aria-label={actual?.pie ?? 'Foto'} onClose={() => abierta !== null && cerrar()}
        onClick={(e) => { if (e.target === dlg.current) cerrar() }}>
        {actual && (
          <figure>
            <img src={`${base}${actual.archivo}`} alt={actual.pie} />
            <figcaption>
              <strong>{actual.pie}</strong><br />
              Foto: {actual.url ? <a href={actual.url} target="_blank" rel="noopener noreferrer">{actual.fuente}</a> : actual.fuente}
            </figcaption>
          </figure>
        )}
        <div className="visor-barra">
          <button type="button" className="vd-btn vd-btn-secondary" onClick={() => mover(-1)}>Anterior</button>
          <span aria-live="polite">{abierta !== null ? abierta + 1 : 0} de {fotos.length}</span>
          <button type="button" className="vd-btn vd-btn-secondary" onClick={() => mover(1)}>Siguiente</button>
        </div>
        <button type="button" className="visor-x" onClick={cerrar} aria-label="Cerrar foto"><X size={24} aria-hidden /></button>
      </dialog>
    </div>
  )
}
