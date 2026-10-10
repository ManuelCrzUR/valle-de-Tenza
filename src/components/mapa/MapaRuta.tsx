import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import type { Lugar } from '../../data/lugares'

export type ParadaMapa = { n: number; lugar: Lugar & { lat: number; lon: number } }   // n = posición en el recorrido (1, 2, 3…)

const MS_POR_TRAMO = 1100
const PAUSA_INICIAL = 1500   // vista general + vuelo al primer nodo antes de empezar a dibujar
const ZOOM_SEGUIR = 14.5
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

// La cámara acompaña a la línea: vista general → vuelo al nodo 1 → sigue la cabeza → al terminar, vuelve a mostrar toda la ruta.
// Si la persona toca o mueve el mapa, deja de seguir (hasta que repita el recorrido).
function Seguir({ paradas, cabeza, empezo, animando, corrida, seleccionadoId }: { seleccionadoId: string | null; paradas: ParadaMapa[]; cabeza: [number, number] | undefined; empezo: boolean; animando: boolean; corrida: number }) {
  const map = useMap()
  const sigue = useRef(true)
  const animo = useRef(false)
  const quieto = reduceMovimiento() || paradas.length < 2

  useEffect(() => {
    const parar = () => { sigue.current = false }
    const c = map.getContainer()
    map.on('dragstart', parar)
    c.addEventListener('wheel', parar, { passive: true }); c.addEventListener('dblclick', parar); c.addEventListener('touchstart', parar, { passive: true })
    return () => { map.off('dragstart', parar); c.removeEventListener('wheel', parar); c.removeEventListener('dblclick', parar); c.removeEventListener('touchstart', parar) }
  }, [map])

  // Elegir una parada en la lista tiene prioridad sobre el seguimiento.
  useEffect(() => { if (seleccionadoId) sigue.current = false }, [seleccionadoId])

  // Cada recorrido empieza con la vista general y vuela al primer nodo.
  useEffect(() => {
    sigue.current = true
    if (quieto) return
    const t = setTimeout(() => { if (sigue.current) map.flyTo([paradas[0].lugar.lat, paradas[0].lugar.lon], ZOOM_SEGUIR, { duration: 0.8 }) }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corrida, map])

  // Mientras se dibuja, el centro del mapa va con la cabeza de la línea.
  const lat = cabeza?.[0], lon = cabeza?.[1]
  useEffect(() => {
    if (quieto || !animando || !empezo || !sigue.current || lat === undefined || lon === undefined) return
    animo.current = true
    map.setView([lat, lon], ZOOM_SEGUIR, { animate: false })
  }, [lat, lon, animando, empezo, quieto, map])

  // Al llegar al último nodo, se aleja para mostrar toda la ruta.
  useEffect(() => {
    if (animando || !animo.current) return
    animo.current = false
    if (!sigue.current) return
    const t = setTimeout(() => map.flyToBounds(L.latLngBounds(paradas.map((p) => [p.lugar.lat, p.lugar.lon] as [number, number])), { padding: [64, 64], maxZoom: 15, duration: 1.2 }), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animando, map])
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
      <Seguir paradas={paradas} cabeza={cabeza} empezo={prog > 0} animando={animando} corrida={corrida} seleccionadoId={seleccionadoId} />
      {linea.length > 1 && <Polyline positions={linea} interactive={false} className="ruta-linea" pathOptions={{ weight: 5, dashArray: '10 9', lineCap: 'round', lineJoin: 'round' }} />}
      {animando && cabeza && <CircleMarker center={cabeza} radius={8} interactive={false} className="ruta-cabeza" />}
      {paradas.slice(0, alcanzado + 1).map((p) => (
        <Marker key={p.lugar.id} position={[p.lugar.lat, p.lugar.lon]} icon={icono(p.n, p.lugar.id === seleccionadoId)} title={`${p.n}. ${p.lugar.nombre}`} alt={`${p.n}. ${p.lugar.nombre}`}
          zIndexOffset={p.lugar.id === seleccionadoId ? 1000 : p.n} eventHandlers={{ click: () => onElegir(p.lugar.id) }} />
      ))}
    </MapContainer>
  )
}
