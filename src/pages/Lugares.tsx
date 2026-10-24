import type { CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Option, PlaceCard } from '../components/ui'
import { Montanas } from '../components/Montanas'
import { Foto } from '../components/Foto'
import { FOTOS, FOTO_FILTRO, FOTO_MUNICIPIO, fotoPropiaDeLugar } from '../data/fotos'
import { km } from '../data/generarPlan'
import { etiquetaSubtipo, CATEGORIA_POR_ID, NOMBRE_MUNICIPIO, metros, tieneUbicacion, useCatalogo } from '../data/lugares'
import type { Lugar, MunicipioMapa, TipoReserva } from '../data/lugares'
import { PLANES } from '../data/planes'
import { LUGAR_NEGOCIO, cupoVerificadoHoy, negocioDeLugar, useOperacion } from '../state/reservas'
import type { Negocio } from '../state/reservas'
import { minutos, tramoActual, useLogistica } from '../state/logistica'
import { useItinerario } from '../state/itinerario'
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

const sinTilde = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function recortar(t: string, max = 110): string {
  const limpio = t.replace(/\s+/g, ' ').trim()
  if (limpio.length <= max) return limpio
  return `${limpio.slice(0, max).replace(/\s+\S*$/, '')}…`
}
// Una línea de «por qué ir»: la descripción; si no hay, cómo se llega.
const porQueIr = (l: Lugar) => { const t = l.extra?.descripcion?.trim() || l.acceso?.trim(); return t ? recortar(t) : undefined }
// Con información = acceso, descripción o foto propia. Los verificados van primero; luego los que más datos tienen.
function puntaje(l: Lugar, n: Negocio | undefined): number {
  return (n?.verificado ? 100 : 0) + (l.acceso ? 4 : 0) + (l.extra?.descripcion ? 2 : 0) + (fotoPropiaDeLugar(l) ? 1 : 0)
}

export default function Lugares() {
  usePagina('Qué lugares hay')
  const [params, setParams] = useSearchParams()
  const go = useNavigate()
  const { negocios } = useOperacion()
  const { lugares: LUGARES, municipios: MUNICIPIOS } = useCatalogo()
  const { itinerario, eleccion } = useItinerario()
  useLogistica({ tramos: false })   // solo para volver a pintar si los tiempos ya estaban en caché; aquí no se piden tramos
  const base = itinerario?.municipio || eleccion?.municipio || ''
  const centroBase = MUNICIPIOS.find((m: MunicipioMapa) => m.slug === base)?.centro ?? null
  const cat = FILTROS.find((f) => f.id === params.get('cat'))?.id ?? 'aventura'
  const mun = MUNICIPIOS.some((m) => m.slug === params.get('mun')) ? params.get('mun')! : ''
  const cambiar = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(cambios)) v ? p.set(k, v) : p.delete(k)
    setParams(p, { replace: true })
  }

  const lugares = LUGARES
    .filter((l) => (cat === 'dormir' ? l.categoria === 'alojamiento' : l.plan === cat) && (!mun || l.municipio === mun))
    .map((l, i) => ({ l, i, p: puntaje(l, negocioDeLugar(negocios, l.id)) }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((x) => x.l)
  const nuevos = negocios.filter((n) => n.lugarId.startsWith(LUGAR_NEGOCIO) && FILTRO_DE_TIPO[n.tipo] === cat && (!mun || n.municipio === mun))
  const total = lugares.length + nuevos.length
  const filtroActual = FILTROS.find((f) => f.id === cat)!
  const foto = FOTO_MUNICIPIO[mun] ?? FOTO_FILTRO[cat]   // el municipio elegido manda; Gastronomía sin municipio conserva la ilustración

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
                <option value="">Los {MUNICIPIOS.length} municipios</option>
                {MUNICIPIOS.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}
              </select>
            </label>
          </div>
        </div>
        {foto ? <Foto key={foto} n={foto} className="lugares-arte" /> : <Montanas key={cat} variante={cat === 'dormir' ? 'cultura' : cat} className="lugares-arte" />}
      </div>
      <p className="lugares-conteo" role="status">{total} {total === 1 ? 'lugar' : 'lugares'}</p>
      {total === 0 ? (
        <div className="lugares-vacio">
          <h2 className="t-h3">Aún no hay lugares aquí</h2>
          <p>No encontramos lugares de «{filtroActual.texto}»{mun ? ` en ${NOMBRE_MUNICIPIO[mun]}` : ''}. Prueba con otro municipio o categoría.</p>
          {mun && <Option onClick={() => cambiar({ mun: '' })}>Ver los {MUNICIPIOS.length} municipios</Option>}
        </div>
      ) : (
        <div className="grid" key={`${cat}-${mun}`}>
          {lugares.map((l, i) => {
            const reserva = negocioDeLugar(negocios, l.id)
            const tipo = CATEGORIA_POR_ID[l.categoria].singular
            const sub = l.subtipo ? etiquetaSubtipo(l.subtipo) : ''
            const chip = sub && sinTilde(sub) !== sinTilde(tipo) ? `${tipo} · ${sub}` : tipo   // sin «Atracción / Atracción»
            const fotoId = fotoPropiaDeLugar(l)
            // Distancia desde el municipio base del itinerario: línea recta desde su centro; por carretera solo si ya estaba en caché.
            let desde: string | null = null
            if (base && l.municipio !== base && centroBase) {
              const punto: [number, number] | null = tieneUbicacion(l) ? [l.lat, l.lon] : MUNICIPIOS.find((m: MunicipioMapa) => m.slug === l.municipio)?.centro ?? null
              const tr = tramoActual(`mun:${base}`, `mun:${l.municipio}`)
              if (tr) desde = `a ${minutos(tr.duracion_s)} min por carretera de ${NOMBRE_MUNICIPIO[base]}`
              else if (punto) desde = `a ~${km(metros(centroBase, punto))} de ${NOMBRE_MUNICIPIO[base]} (en línea recta)`
            }
            return (
              <div key={l.id} className="aparece grid-item" style={{ '--i': Math.min(i, 12) } as CSSProperties}>
                <PlaceCard
                  chip={chip}
                  image={fotoId ? `${import.meta.env.BASE_URL}${FOTOS[fotoId].archivo}` : undefined}
                  imageAlt={fotoId ? FOTOS[fotoId].pie : undefined}
                  title={l.nombre}
                  description={porQueIr(l)}
                  meta={<>
                    {NOMBRE_MUNICIPIO[l.municipio]}{desde ? ` · ${desde}` : ''}
                    {reserva && <><br /><strong className="lugar-cupo">{cupoVerificadoHoy(reserva) ? 'Cupo verificado hoy' : 'Cupo por confirmar'}</strong></>}
                  </>}
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
