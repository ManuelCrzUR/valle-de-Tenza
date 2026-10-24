import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { ChevronUp } from 'lucide-react'

export type PosHoja = 0 | 1 | 2   // 0 recogida, 1 media, 2 completa
const NOMBRE_POS = ['recogida', 'media', 'completa'] as const
const PEEK = 76          // px: asa + resumen
const MARGEN_TOPE = 48   // px de mapa que quedan visibles con la hoja completa
const MEDIA = 0.45       // fracción del alto disponible

// Hoja deslizable desde abajo (móvil). Tres posiciones; se arrastra con puntero/touch y también con el botón
// del asa (clic = siguiente posición; flechas arriba/abajo; Escape = recoger). Sin librerías.
export function HojaMapa({ pos, onPos, resumen, children }: { pos: PosHoja; onPos: (p: PosHoja) => void; resumen: string; children: ReactNode }) {
  const hoja = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ y0: number; h0: number; max: number; mov: boolean; muestras: { t: number; h: number }[] } | null>(null)
  const sinClic = useRef(false)
  const [altoPx, setAltoPx] = useState<number | null>(null)   // solo mientras se arrastra

  useEffect(() => { setAltoPx(null) }, [pos])

  const alturas = (max: number) => [PEEK, Math.round(max * MEDIA), max - MARGEN_TOPE]
  const iniciar = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = hoja.current
    const padre = el?.parentElement
    if (!el || !padre) return
    e.currentTarget.setPointerCapture(e.pointerId)
    arrastre.current = { y0: e.clientY, h0: el.offsetHeight, max: padre.clientHeight, mov: false, muestras: [{ t: e.timeStamp, h: el.offsetHeight }] }
  }
  const mover = (e: PointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current
    if (!a) return
    const dy = e.clientY - a.y0
    if (!a.mov && Math.abs(dy) < 6) return
    a.mov = true
    const h = Math.min(a.max - MARGEN_TOPE, Math.max(PEEK, a.h0 - dy))
    a.muestras.push({ t: e.timeStamp, h })
    if (a.muestras.length > 5) a.muestras.shift()
    setAltoPx(h)
  }
  const terminar = (e: PointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current
    arrastre.current = null
    if (!a?.mov) return
    sinClic.current = true            // el clic que sigue al arrastre no debe cambiar la posición
    setTimeout(() => { sinClic.current = false }, 0)
    const ult = a.muestras[a.muestras.length - 1]
    const prim = a.muestras[0]
    const vel = ult.t > prim.t ? (ult.h - prim.h) / (ult.t - prim.t) : 0   // px/ms, positivo = sube
    const proyectada = ult.h + vel * 120
    const alts = alturas(a.max)
    let mejor: PosHoja = 0
    alts.forEach((h, i) => { if (Math.abs(h - proyectada) < Math.abs(alts[mejor] - proyectada)) mejor = i as PosHoja })
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    setAltoPx(null)
    onPos(mejor)
  }
  const clic = () => { if (!sinClic.current) onPos(((pos + 1) % 3) as PosHoja) }
  const tecla = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); onPos(Math.min(2, pos + 1) as PosHoja) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); onPos(Math.max(0, pos - 1) as PosHoja) }
    else if (e.key === 'Escape' && pos > 0) { e.preventDefault(); onPos(0) }
  }

  return (
    <div ref={hoja} className={`hoja-m hoja-m-${pos}${altoPx !== null ? ' hoja-m-arrastra' : ''}`} style={altoPx !== null ? { height: altoPx } : undefined} onKeyDown={tecla}>
      <button type="button" className="hoja-m-asa" aria-expanded={pos > 0} aria-controls="hoja-m-cuerpo"
        onPointerDown={iniciar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={terminar} onClick={clic}>
        <span className="hoja-m-grip" aria-hidden="true" />
        <span className="hoja-m-resumen">
          <strong>{resumen}</strong>
          <ChevronUp size={20} aria-hidden className="hoja-m-flecha" />
        </span>
        <span className="sr-only">Panel de lugares, {NOMBRE_POS[pos]}. Flechas arriba y abajo lo cambian de tamaño.</span>
      </button>
      <div id="hoja-m-cuerpo" className="hoja-m-cuerpo" inert={pos === 0}>{children}</div>
    </div>
  )
}
