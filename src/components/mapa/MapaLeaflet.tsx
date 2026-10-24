import { useEffect, useMemo } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { esAproximado, useCatalogo } from '../../data/lugares'
import type { Lugar } from '../../data/lugares'
import { CategoriaIcono } from './iconos'
import { AlertaIcono } from './iconosAlerta'
import { NOMBRE_TIPO_ALERTA } from '../../state/logistica'
import type { Alerta } from '../../state/logistica'

type Punto = Lugar & { lat: number; lon: number }
const reduceMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const iconos = new Map<string, L.DivIcon>()

// Marcador = círculo con el ícono de la categoría (se distingue por ícono, no solo por color).
function icono(l: Lugar, seleccionado: boolean): L.DivIcon {
  const clave = `${l.categoria}|${l.esServicio}|${esAproximado(l)}|${seleccionado}`
  let i = iconos.get(clave)
  if (!i) {
    const clases = ['pin', l.esServicio && 'pin-servicio', esAproximado(l) && 'pin-aprox', seleccionado && 'pin-sel'].filter(Boolean).join(' ')
    i = L.divIcon({ html: `<span class="${clases}">${renderToStaticMarkup(<CategoriaIcono id={l.categoria} size={22} />)}</span>`, className: 'pin-wrap', iconSize: [44, 44], iconAnchor: [22, 22] })
    iconos.set(clave, i)
  }
  return i
}

const iconosAlerta = new Map<string, L.DivIcon>()
function iconoAlerta(a: Alerta): L.DivIcon {
  let i = iconosAlerta.get(a.tipo)
  if (!i) {
    i = L.divIcon({ html: `<span class="pin pin-alerta">${renderToStaticMarkup(<AlertaIcono tipo={a.tipo} size={22} />)}</span>`, className: 'pin-wrap', iconSize: [44, 44], iconAnchor: [22, 22] })
    iconosAlerta.set(a.tipo, i)
  }
  return i
}
const fechaAviso = (f: string) => new Date(f).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

function Ajustar({ puntos, seleccionado }: { puntos: Punto[]; seleccionado: Punto | undefined }) {
  const map = useMap()
  const clave = puntos.map((p) => p.id).join()
  // Al cambiar los filtros, encuadra lo que se ve.
  useEffect(() => {
    if (!puntos.length) return
    map.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lon] as [number, number])), { padding: [56, 56], maxZoom: 15, animate: !reduceMovimiento() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, map])
  // Al elegir un lugar, se acerca a él.
  useEffect(() => {
    if (!seleccionado) return
    const destino: [number, number] = [seleccionado.lat, seleccionado.lon]
    const zoom = Math.max(map.getZoom(), 17)
    if (reduceMovimiento()) map.setView(destino, zoom, { animate: false })
    else map.flyTo(destino, zoom, { duration: 0.6 })
  }, [seleccionado, map])
  return null
}

export default function MapaLeaflet({ puntos, seleccionadoId, onElegir, alertas = [] }: { puntos: Punto[]; seleccionadoId: string | null; onElegir: (id: string) => void; alertas?: Alerta[] }) {
  const { municipios } = useCatalogo()
  // Las alertas con municipio se pintan en su centro; si hay varias en el mismo, se separan un poco para que todas se puedan tocar.
  const avisos = useMemo(() => {
    const porMun = new Map<string, number>()
    return alertas.flatMap((a) => {
      const c = municipios.find((m) => m.slug === a.municipio)?.centro
      if (!c) return []
      const n = porMun.get(a.municipio!) ?? 0
      porMun.set(a.municipio!, n + 1)
      return [{ a, pos: [c[0] + 0.004 * n, c[1] + 0.006 * n] as [number, number] }]
    })
  }, [alertas, municipios])
  const seleccionado = useMemo(() => puntos.find((p) => p.id === seleccionadoId), [puntos, seleccionadoId])
  return (
    <MapContainer className="mapa-leaflet" center={[5.03, -73.42]} zoom={11} zoomControl={false} scrollWheelZoom aria-label="Mapa de lugares del Valle de Tenza">
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">Colaboradores de OpenStreetMap</a>' />
      <ZoomControl position="bottomright" zoomInTitle="Acercar" zoomOutTitle="Alejar" />
      <Ajustar puntos={puntos} seleccionado={seleccionado} />
      <MarkerClusterGroup
        chunkedLoading showCoverageOnHover={false} maxClusterRadius={46}
        iconCreateFunction={(c: { getChildCount(): number }) => L.divIcon({ html: `<span class="pin pin-cluster">${c.getChildCount()}</span>`, className: 'pin-wrap', iconSize: [44, 44], iconAnchor: [22, 22] })}
      >
        {puntos.filter((p) => p.id !== seleccionadoId).map((p) => (
          <Marker key={p.id} position={[p.lat, p.lon]} icon={icono(p, false)} title={p.nombre} alt={p.nombre} eventHandlers={{ click: () => onElegir(p.id) }} />
        ))}
      </MarkerClusterGroup>
      {/* El lugar elegido va fuera del grupo: así nunca queda escondido dentro de un círculo con número. */}
      {seleccionado && <Marker key={`sel-${seleccionado.id}`} position={[seleccionado.lat, seleccionado.lon]} icon={icono(seleccionado, true)} title={seleccionado.nombre} alt={seleccionado.nombre} zIndexOffset={1000} />}
      {avisos.map(({ a, pos }) => (
        <Marker key={a.id} position={pos} icon={iconoAlerta(a)} title={`${NOMBRE_TIPO_ALERTA[a.tipo]}: ${a.mensaje}`} alt={`${NOMBRE_TIPO_ALERTA[a.tipo]}: ${a.mensaje}`} zIndexOffset={900}>
          <Popup>
            <strong>{NOMBRE_TIPO_ALERTA[a.tipo]}</strong><br />
            {a.mensaje}<br />
            <small>Desde el {fechaAviso(a.desde)}{a.hasta ? ` hasta el ${fechaAviso(a.hasta)}` : ''}</small>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
