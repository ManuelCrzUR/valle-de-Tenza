import { useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { MUNICIPIOS } from '../../data/lugares'

const icono = L.divIcon({ className: 'prestador-pin', iconSize: [18, 18], iconAnchor: [9, 9] })

function Clic({ onCambio }: { onCambio: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onCambio(e.latlng.lat, e.latlng.lng) } })
  return null
}

function Centrar({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map.setView([lat, lng]) }, [lat, lng, map])
  return null
}

export function PinEmpresa({ lat, lng, onCambio }: { lat: number | null; lng: number | null; onCambio: (lat: number, lng: number) => void }) {
  const centro = MUNICIPIOS.find((m) => m.slug === 'tenza')?.centro ?? [5.076, -73.42]
  const pos: [number, number] = lat != null && lng != null ? [lat, lng] : [centro[0], centro[1]]
  return (
    <MapContainer center={pos} zoom={13} className="prestador-mapa" scrollWheelZoom={false}>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Centrar lat={pos[0]} lng={pos[1]} />
      <Clic onCambio={onCambio} />
      {lat != null && lng != null && (
        <Marker
          position={[lat, lng]}
          draggable
          icon={icono}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target as { getLatLng: () => { lat: number; lng: number } }
              const p = marker.getLatLng()
              onCambio(p.lat, p.lng)
            },
          }}
        />
      )}
    </MapContainer>
  )
}
