import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import type { Lugar } from '../../data/lugares'

export type ParadaMapa = { n: number; lugar: Lugar & { lat: number; lon: number } }   // n = posición en el recorrido (1, 2, 3…)

const MS_POR_TRAMO = 1100
const PAUSA_INICIAL = 500
const reduceMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Un solo ícono por número/estado: si cambiara de identidad en cada fotograma, Leaflet recrearía el pin y reiniciaría su animación.
const iconos = new Map<string, L.DivIcon>()
function icono(n: number, sel: boolean): L.DivIcon {
  const clave = `${n}|${sel}`
  let i = iconos.get(clave)
  if (!i) { i = L.divIcon({ html: `<span class="pin pin-ruta${sel ? ' pin-sel' : ''}">${n}</span>`, className: 'pin-wrap', iconSize: [44, 44], iconAnchor: [22, 22] }); iconos.set(clave, i) }
  return i
}

// Progreso 0…(n-1): la parte entera es el último nodo alcanzado; la fracción, el avance hacia el siguiente.
function useRecorrido(total: number, corrida: number) {
  const [prog, setProg] = useState(() => (reduceMovimiento() ? Math.max(0, total - 1) : 0))
  useEffect(() => {
    const fin = Math.max(0, total - 1)
    if (reduceMovimiento() || fin === 0) { setProg(fin); return }
    setProg(0)
    let raf = 0
    const t0 = performance.now() + PAUSA_INICIAL
    const paso = (ahora: number) => {
      const p = Math.min(fin, Math.max(0, (ahora - t0) / MS_POR_TRAMO))
      setProg(p)
      if (p < fin) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [total, corrida])
  return prog
}

function Encuadrar({ paradas, seleccionado }: { paradas: ParadaMapa[]; seleccionado: ParadaMapa | undefined }) {
  const map = useMap()
  const clave = paradas.map((p) => p.lugar.id).join()
  useEffect(() => {
    if (!paradas.length) return
    // El mapa se monta dentro de Suspense y su contenedor puede no tener su tamaño final todavía: se encuadra al montar y otra vez al instante.
    const encuadrar = () => {
      map.invalidateSize()
      map.fitBounds(L.latLngBounds(paradas.map((p) => [p.lugar.lat, p.lugar.lon] as [number, number])), { padding: [64, 64], maxZoom: 15, animate: false })
    }
    encuadrar()
    const t = setTimeout(encuadrar, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, map])
  useEffect(() => {
    if (!seleccionado) return
    const destino: [number, number] = [seleccionado.lugar.lat, seleccionado.lugar.lon]
    if (reduceMovimiento()) map.setView(destino, Math.max(map.getZoom(), 14), { animate: false })
    else map.flyTo(destino, Math.max(map.getZoom(), 14), { duration: 0.6 })
  }, [seleccionado, map])
  return null
}

// Mapa de «Mi ruta»: nodos numerados y una línea que se dibuja del primero al último, pasando por todos.
export default function MapaRuta({ paradas, seleccionadoId, onElegir, corrida }: { paradas: ParadaMapa[]; seleccionadoId: string | null; onElegir: (id: string) => void; corrida: number }) {
  const prog = useRecorrido(paradas.length, corrida)
  const alcanzado = Math.floor(prog + 1e-6)
  const seleccionado = useMemo(() => paradas.find((p) => p.lugar.id === seleccionadoId), [paradas, seleccionadoId])

  // Línea hasta el último nodo alcanzado + el tramo parcial hacia el siguiente.
  const linea = useMemo(() => {
    const pts: [number, number][] = paradas.slice(0, alcanzado + 1).map((p) => [p.lugar.lat, p.lugar.lon])
    const sig = paradas[alcanzado + 1]
    if (sig && pts.length) {
      const f = prog - alcanzado, [a, b] = pts[pts.length - 1]
      pts.push([a + (sig.lugar.lat - a) * f, b + (sig.lugar.lon - b) * f])
    }
    return pts
  }, [paradas, alcanzado, prog])
  const animando = paradas.length > 1 && prog < paradas.length - 1
  const cabeza = linea[linea.length - 1]

  return (
    <MapContainer className="mapa-leaflet" center={[5.03, -73.42]} zoom={11} zoomSnap={0.25} zoomControl={false} scrollWheelZoom aria-label="Mapa de tu ruta por el Valle de Tenza">
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">Colaboradores de OpenStreetMap</a>' />
      <ZoomControl position="bottomright" zoomInTitle="Acercar" zoomOutTitle="Alejar" />
      <Encuadrar paradas={paradas} seleccionado={seleccionado} />
      {linea.length > 1 && <Polyline positions={linea} interactive={false} className="ruta-linea" pathOptions={{ weight: 5, dashArray: '10 9', lineCap: 'round', lineJoin: 'round' }} />}
      {animando && cabeza && <CircleMarker center={cabeza} radius={8} interactive={false} className="ruta-cabeza" />}
      {paradas.slice(0, alcanzado + 1).map((p) => (
        <Marker key={p.lugar.id} position={[p.lugar.lat, p.lugar.lon]} icon={icono(p.n, p.lugar.id === seleccionadoId)} title={`${p.n}. ${p.lugar.nombre}`} alt={`${p.n}. ${p.lugar.nombre}`}
          zIndexOffset={p.lugar.id === seleccionadoId ? 1000 : p.n} eventHandlers={{ click: () => onElegir(p.lugar.id) }} />
      ))}
    </MapContainer>
  )
}
