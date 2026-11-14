import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import type { Lugar } from '../../data/lugares'
import { reducirCarga, cargaInicial, puedeAnimar } from './mapaListo'
import type { CargaMapa, EventoMapa } from './mapaListo'

export type ParadaMapa = { n: number; lugar: Lugar & { lat: number; lon: number } }   // n = posición en el recorrido (1, 2, 3…)

const MS_POR_TRAMO = 1100
const PAUSA_INICIAL = 1500   // vista general + vuelo al primer nodo antes de empezar a dibujar
const ZOOM_SEGUIR = 14.5
const RESPIRO = 250   // tras ser visible y con teselas, espera a que termine el scroll suave antes de animar
const ESPERA_TILES_MS = 8000
const reduceMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Un solo ícono por número/estado: si cambiara de identidad en cada fotograma, Leaflet recrearía el pin y reiniciaría su animación.
const iconos = new Map<string, L.DivIcon>()
function icono(n: number, sel: boolean): L.DivIcon {
  const clave = `${n}|${sel}`
  let i = iconos.get(clave)
  if (!i) { i = L.divIcon({ html: `<span class="pin pin-ruta${sel ? ' pin-sel' : ''}">${n}</span>`, className: 'pin-wrap', iconSize: [44, 44], iconAnchor: [22, 22] }); iconos.set(clave, i) }
  return i
}

// true cuando ≥ umbral del elemento está en pantalla (se queda en true una vez alcanzado, hasta que `reinicio` cambie).
// Sin IntersectionObserver devuelve true de inmediato.
function useVisible(el: Element | null, reinicio: unknown, umbral = 0.6): boolean {
  const sinIO = typeof IntersectionObserver === 'undefined'
  const [vista, setVista] = useState<unknown>(null)
  useEffect(() => {
    if (sinIO || !el) return
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting && e.intersectionRatio >= umbral - 0.01)) { setVista(reinicio); io.disconnect() }
    }, { threshold: [0, umbral, 1] })
    io.observe(el)
    return () => io.disconnect()
  }, [el, reinicio, umbral, sinIO])
  return sinIO || vista === reinicio
}

// Arranque de cada corrida: espera a que el mapa sea visible y un respiro. Con movimiento reducido no espera.
function useArranque(el: Element | null, corrida: number, activo: boolean): boolean {
  const visible = useVisible(el, corrida)
  const [listoPara, setListoPara] = useState<number | null>(null)
  useEffect(() => {
    if (!activo || !visible) return
    const t = setTimeout(() => setListoPara(corrida), RESPIRO)
    return () => clearTimeout(t)
  }, [activo, visible, corrida])
  return !activo || listoPara === corrida
}

// Entrega el contenedor DOM del mapa al componente padre (para observar su visibilidad sin envolver el MapContainer).
function Contenedor({ alListo }: { alListo: (el: HTMLElement) => void }) {
  const map = useMap()
  useEffect(() => { alListo(map.getContainer()) }, [map, alListo])
  return null
}

// Progreso 0…(n-1): la parte entera es el último nodo alcanzado; la fracción, el avance hacia el siguiente.
function useRecorrido(total: number, corrida: number, completo: boolean, listo: boolean) {
  const [prog, setProg] = useState(() => (completo || reduceMovimiento() ? Math.max(0, total - 1) : 0))
  useEffect(() => {
    const fin = Math.max(0, total - 1)
    if (!listo && !completo) { setProg(0); return }
    if (completo || reduceMovimiento() || fin === 0) { setProg(fin); return }
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
  }, [total, corrida, completo, listo])
  return prog
}

function Enfocar({ id, seq, paradas }: { id: string | null; seq: number; paradas: ParadaMapa[] }) {
  const map = useMap()
  useEffect(() => {
    if (!id) return
    const p = paradas.find((x) => x.lugar.id === id)
    if (!p) return
    const destino: [number, number] = [p.lugar.lat, p.lugar.lon]
    if (reduceMovimiento()) map.setView(destino, 14, { animate: false })
    else map.flyTo(destino, 14, { duration: 0.9 })
  }, [id, seq, map, paradas])
  return null
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
function Seguir({ paradas, cabeza, empezo, animando, corrida, listo, seleccionadoId }: { listo: boolean; seleccionadoId: string | null; paradas: ParadaMapa[]; cabeza: [number, number] | undefined; empezo: boolean; animando: boolean; corrida: number }) {
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
    if (quieto || !listo) return
    const t = setTimeout(() => { if (sigue.current) map.flyTo([paradas[0].lugar.lat, paradas[0].lugar.lon], ZOOM_SEGUIR, { duration: 0.8 }) }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corrida, listo, map])

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

function aplicarInteraccion(map: L.Map, activa: boolean) {
  const accion = activa ? 'enable' : 'disable'
  map.dragging[accion]()
  map.scrollWheelZoom[accion]()
  map.doubleClickZoom[accion]()
  map.touchZoom[accion]()
  map.boxZoom[accion]()
  map.keyboard[accion]()
}

// Teselas del área visible + tamaño estable. Crear el mapa no cuenta como listo.
function VigiaBase({ clave, alEstado }: { clave: string; alEstado: (s: CargaMapa) => void }) {
  const map = useMap()
  const estado = useRef(cargaInicial())
  useEffect(() => {
    let vivo = true
    let timerTamano = 0
    let timerTope = 0
    const emitir = (ev: EventoMapa) => {
      if (!vivo) return
      estado.current = reducirCarga(estado.current, ev)
      alEstado(estado.current)
      aplicarInteraccion(map, estado.current.fase === 'listo')
    }
    emitir({ tipo: 'ruta' })
    const capa = () => {
      let encontrada: L.TileLayer | undefined
      map.eachLayer((l) => { if (l instanceof L.TileLayer) encontrada = l })
      return encontrada
    }
    const alTile = (ev: L.LeafletEvent) => emitir(ev.type === 'tileerror' ? { tipo: 'tileMal' } : { tipo: 'tileOk' })
    const alCola = () => emitir({ tipo: 'colaVacia' })
    const enganchar = (layer: L.TileLayer) => {
      layer.on('tileload', alTile)
      layer.on('tileerror', alTile)
      layer.on('load', alCola)
    }
    const soltar = (layer: L.TileLayer) => {
      layer.off('tileload', alTile)
      layer.off('tileerror', alTile)
      layer.off('load', alCola)
    }
    let layer = capa()
    let enganchada = false
    const asegurar = () => {
      if (!layer) layer = capa()
      if (layer && !enganchada) { enganchar(layer); enganchada = true }
    }
    asegurar()
    const observar = () => {
      const r = map.getContainer().getBoundingClientRect()
      const sirve = r.width >= 40 && r.height >= 40
      window.clearTimeout(timerTamano)
      if (!sirve) { emitir({ tipo: 'tamano', estable: false }); return }
      timerTamano = window.setTimeout(() => {
        if (!vivo) return
        map.invalidateSize()
        asegurar()
        emitir({ tipo: 'tamano', estable: true })
        const ok = map.getContainer().querySelectorAll('img.leaflet-tile-loaded').length
        for (let i = estado.current.tilesOk; i < ok; i++) emitir({ tipo: 'tileOk' })
        if (map.getContainer().querySelectorAll('img.leaflet-tile-loading').length === 0) emitir({ tipo: 'colaVacia' })
      }, 140)
    }
    const ro = new ResizeObserver(observar)
    ro.observe(map.getContainer())
    observar()
    timerTope = window.setTimeout(() => { if (vivo && estado.current.fase !== 'listo') emitir({ tipo: 'timeout' }) }, ESPERA_TILES_MS)
    return () => {
      vivo = false
      window.clearTimeout(timerTamano)
      window.clearTimeout(timerTope)
      ro.disconnect()
      if (layer) soltar(layer)
      aplicarInteraccion(map, true)
    }
  }, [map, clave, alEstado])
  return null
}

// Mapa de «Mi ruta»: nodos numerados y una línea que se dibuja del primero al último, pasando por todos.
export default function MapaRuta({ paradas, seleccionadoId, onElegir, corrida, foco, onBase }: { paradas: ParadaMapa[]; seleccionadoId: string | null; onElegir: (id: string) => void; corrida: number; foco?: { id: string; seq: number } | null; onBase?: (fase: 'cargando' | 'listo' | 'error') => void }) {
  const [contenedor, setContenedor] = useState<HTMLElement | null>(null)
  const [carga, setCarga] = useState<CargaMapa>(cargaInicial)
  const [epoch, setEpoch] = useState(0)
  const avisar = useRef(onBase)
  avisar.current = onBase
  const alEstado = useRef((s: CargaMapa) => {
    setCarga(s)
    avisar.current?.(s.fase)
  })
    const clave = `${corrida}|${epoch}|${paradas.map((p) => p.lugar.id).join()}`
  const visible = useVisible(contenedor, clave)
  const base = reducirCarga(carga, { tipo: 'visible', valor: visible })
  const tilesListos = puedeAnimar(base)
  const quiereRecorrido = tilesListos && !foco && !reduceMovimiento() && paradas.length > 1
  const respiro = useArranque(contenedor, corrida, quiereRecorrido)
  const listo = tilesListos && (!quiereRecorrido || respiro)
  const prog = useRecorrido(paradas.length, corrida, !!foco, listo)
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
    <div className="mapa-marco">
    <MapContainer className="mapa-leaflet" center={[5.03, -73.42]} zoom={11} zoomSnap={0.25} zoomControl={false} scrollWheelZoom aria-label="Mapa de tu ruta por el Valle de Tenza">
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">Colaboradores de OpenStreetMap</a>' />
      <ZoomControl position="bottomright" zoomInTitle="Acercar" zoomOutTitle="Alejar" />
      <Contenedor alListo={setContenedor} />
      <VigiaBase clave={clave} alEstado={alEstado.current} />
      {!foco && <Encuadrar paradas={paradas} seleccionado={tilesListos ? seleccionado : undefined} />}
      {!foco && <Seguir paradas={paradas} cabeza={cabeza} empezo={prog > 0} animando={animando} corrida={corrida} listo={listo} seleccionadoId={seleccionadoId} />}
      {foco && tilesListos && <Enfocar id={foco.id} seq={foco.seq} paradas={paradas} />}
      {linea.length > 1 && <Polyline positions={linea} interactive={false} className="ruta-linea" pathOptions={{ weight: 5, dashArray: '10 9', lineCap: 'round', lineJoin: 'round' }} />}
      {animando && cabeza && <CircleMarker center={cabeza} radius={8} interactive={false} className="ruta-cabeza" />}
      {paradas.slice(0, alcanzado + 1).map((p) => (
        <Marker key={p.lugar.id} position={[p.lugar.lat, p.lugar.lon]} icon={icono(p.n, p.lugar.id === seleccionadoId)} title={`${p.n}. ${p.lugar.nombre}`} alt={`${p.n}. ${p.lugar.nombre}`}
          zIndexOffset={p.lugar.id === seleccionadoId ? 1000 : p.n} eventHandlers={{ click: () => onElegir(p.lugar.id) }} />
      ))}
    </MapContainer>
    {carga.fase !== 'listo' && (
      <div className="mapa-carga" role="status">
        {carga.fase === 'error' ? (
          <>
            <p>El mapa base no cargó. El recorrido no empieza sobre el fondo vacío.</p>
            <button type="button" className="vd-btn vd-btn-secondary" onClick={() => setEpoch((n) => n + 1)}>Reintentar</button>
          </>
        ) : <p>Cargando el mapa…</p>}
      </div>
    )}
    </div>
  )
}
