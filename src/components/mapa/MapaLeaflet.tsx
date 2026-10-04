import { useEffect, useMemo } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { MapContainer, Marker, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { esAproximado } from '../../data/lugares'
import type { Lugar } from '../../data/lugares'
import { CategoriaIcono } from './iconos'

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

export default function MapaLeaflet({ puntos, seleccionadoId, onElegir }: { puntos: Punto[]; seleccionadoId: string | null; onElegir: (id: string) => void }) {
  const seleccionado = useMemo(() => puntos.find((p) => p.id === seleccionadoId), [puntos, seleccionadoId])
  return (
    <MapContainer className="mapa-leaflet" center={[5.03, -73.42]} zoom={11} zoomControl={false} scrollWheelZoom aria-label="Mapa de lugares del Valle de Tenza">
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">Colaboradores de OpenStreetMap</a>' />
      <ZoomControl position="bottomright" zoomInTitle="Acercar" zoomOutTitle="Alejar" />
      <Ajustar puntos={puntos} seleccionado={seleccionado} />
      <MarkerClusterGroup
        chunkedLoading showCoverageOnHover={false} maxClusterRadius={46} disableClusteringAtZoom={17}
        iconCreateFunction={(c: { getChildCount(): number }) => L.divIcon({ html: `<span class="pin pin-cluster">${c.getChildCount()}</span>`, className: 'pin-wrap', iconSize: [44, 44], iconAnchor: [22, 22] })}
      >
        {puntos.filter((p) => p.id !== seleccionadoId).map((p) => (
          <Marker key={p.id} position={[p.lat, p.lon]} icon={icono(p, false)} title={p.nombre} alt={p.nombre} eventHandlers={{ click: () => onElegir(p.id) }} />
        ))}
      </MarkerClusterGroup>
      {/* El lugar elegido va fuera del grupo: así nunca queda escondido dentro de un círculo con número. */}
      {seleccionado && <Marker key={`sel-${seleccionado.id}`} position={[seleccionado.lat, seleccionado.lon]} icon={icono(seleccionado, true)} title={seleccionado.nombre} alt={seleccionado.nombre} zIndexOffset={1000} />}
    </MapContainer>
  )
}
