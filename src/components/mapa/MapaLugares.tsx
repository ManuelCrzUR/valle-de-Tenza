import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { List, SlidersHorizontal } from 'lucide-react'
import { CATEGORIAS, LUGARES, tieneUbicacion } from '../../data/lugares'
import type { CategoriaId, Lugar } from '../../data/lugares'
import { useMedia } from '../../useMedia'
import { LeyendaMapa } from './LeyendaMapa'
import { Resultados } from './Resultados'
import { FichaLugar } from './FichaLugar'
import { Hoja } from './Hoja'
import MapaLeaflet from './MapaLeaflet'

const TODAS = CATEGORIAS.map((c) => c.id)

export default function MapaLugares() {
  const [params, setParams] = useSearchParams()
  const escritorio = useMedia('(min-width: 1024px)')
  const [panel, setPanel] = useState<'leyenda' | 'lista'>('leyenda')
  const [hojaAbierta, setHojaAbierta] = useState(false)

  // Estado en la URL: ?mun=tenza&cat=restaurante,salud&lugar=<id>  (se puede compartir)
  const municipio = params.get('mun') ?? ''
  const catParam = params.get('cat')
  const activas = useMemo(() => new Set<CategoriaId>(catParam === null ? TODAS : (catParam.split(',').filter((c) => TODAS.includes(c as CategoriaId)) as CategoriaId[])), [catParam])
  const seleccionId = params.get('lugar')
  const seleccion = LUGARES.find((l) => l.id === seleccionId)

  const cambiar = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(cambios)) v === null || v === '' ? p.delete(k) : p.set(k, v)
    setParams(p, { replace: true })
  }
  const fijarCats = (ids: CategoriaId[]) => cambiar({ cat: ids.length === TODAS.length ? null : ids.length ? ids.join(',') : 'ninguna' })

  const delMunicipio = useMemo(() => LUGARES.filter((l) => !municipio || l.municipio === municipio), [municipio])
  const conteo = useMemo(() => {
    const c: Partial<Record<CategoriaId, number>> = {}
    for (const l of delMunicipio) c[l.categoria] = (c[l.categoria] ?? 0) + 1
    return c
  }, [delMunicipio])
  const visibles = useMemo(() => delMunicipio.filter((l) => activas.has(l.categoria)), [delMunicipio, activas])
  const puntos = useMemo(() => visibles.filter(tieneUbicacion), [visibles])

  const elegir = (id: string) => cambiar({ lugar: id })
  const volverALista = () => { cambiar({ lugar: null }); setPanel('lista') }

  const leyenda = (
    <LeyendaMapa activas={activas} conteo={conteo} municipio={municipio}
      onToggle={(id) => fijarCats(activas.has(id) ? TODAS.filter((c) => c !== id && activas.has(c)) : TODAS.filter((c) => c === id || activas.has(c)))}
      onTodas={() => fijarCats(TODAS)} onNinguna={() => fijarCats([])} onMunicipio={(m) => cambiar({ mun: m, lugar: null })} />
  )
  const lista = <Resultados lugares={visibles} seleccionado={seleccionId} onElegir={elegir} />
  const ficha = (l: Lugar) => <FichaLugar lugar={l} onVolver={volverALista} />

  const mapa = <MapaLeaflet puntos={puntos} seleccionadoId={seleccion && tieneUbicacion(seleccion) ? seleccion.id : null} onElegir={elegir} />
  const sinUbicar = visibles.length - puntos.length

  if (escritorio) {
    return (
      <div className="mapa-app">
        <aside className="mapa-aside panel" aria-label="Leyenda y lugares">
          {seleccion ? ficha(seleccion) : (
            <>
              <div className="opts mapa-tabs" role="group" aria-label="Panel">
                <button type="button" className="vd-opt" aria-pressed={panel === 'leyenda'} onClick={() => setPanel('leyenda')}><SlidersHorizontal size={20} aria-hidden /> Leyenda</button>
                <button type="button" className="vd-opt" aria-pressed={panel === 'lista'} onClick={() => setPanel('lista')}><List size={20} aria-hidden /> Lista ({visibles.length})</button>
              </div>
              {panel === 'leyenda' ? leyenda : lista}
            </>
          )}
        </aside>
        <div className="mapa-lienzo">
          {mapa}
          <p className="mapa-contador" role="status">{puntos.length} en el mapa{sinUbicar > 0 ? ` · ${sinUbicar} sin ubicación (ver lista)` : ''}</p>
        </div>
      </div>
    )
  }

  const abierta = Boolean(seleccion) || hojaAbierta
  const cerrar = () => { cambiar({ lugar: null }); setHojaAbierta(false) }  // la X siempre cierra la hoja entera
  return (
    <div className="mapa-app mapa-movil">
      <div className="mapa-lienzo">
        {mapa}
        <p className="mapa-contador" role="status">{puntos.length} en el mapa{sinUbicar > 0 ? ` · ${sinUbicar} sin ubicación` : ''}</p>
        <div className="mapa-botones">
          <button type="button" className="vd-btn vd-btn-primary" onClick={() => { setPanel('leyenda'); setHojaAbierta(true) }}><SlidersHorizontal size={20} aria-hidden /> Leyenda</button>
          <button type="button" className="vd-btn vd-btn-primary" onClick={() => { setPanel('lista'); setHojaAbierta(true) }}><List size={20} aria-hidden /> Lista ({visibles.length})</button>
        </div>
      </div>
      {abierta && (
        <Hoja titulo={seleccion ? 'Detalle del lugar' : panel === 'lista' ? 'Lista de lugares' : 'Leyenda y filtros'} onCerrar={cerrar}>
          {seleccion ? ficha(seleccion) : panel === 'lista' ? lista : leyenda}
        </Hoja>
      )}
    </div>
  )
}
