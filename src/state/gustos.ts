import { useEffect, useState } from 'react'
import { GUSTOS_VACIOS, normalizarGustos } from '../../shared/gustos'
import type { Gustos } from '../../shared/gustos'
import { MUNICIPIOS } from '../data/lugares'

// Gustos del viajero: solo en este dispositivo (localStorage), sin datos personales.
const CLAVE = 'vd-gustos-v1'
const EVENTO = 'vd-gustos-cambio'
const SLUGS = MUNICIPIOS.map((m) => m.slug)

const vacios = (): Gustos => ({ ...GUSTOS_VACIOS, intereses: [], evitar: [] })
let memoria: Gustos = vacios()

export function leerGustos(): Gustos {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (crudo) memoria = normalizarGustos(JSON.parse(crudo), SLUGS)
  } catch { /* sin almacenamiento: se usa la memoria */ }
  return memoria
}

export function guardarGustos(g: Gustos): void {
  memoria = normalizarGustos(g, SLUGS)
  try { localStorage.setItem(CLAVE, JSON.stringify(memoria)) } catch { /* en memoria */ }
  try { window.dispatchEvent(new Event(EVENTO)) } catch { /* ignorar */ }
}

export function borrarGustos(): void {
  memoria = vacios()
  try { localStorage.removeItem(CLAVE) } catch { /* ignorar */ }
  try { window.dispatchEvent(new Event(EVENTO)) } catch { /* ignorar */ }
}

/** Quita un gusto por la clave que entrega `etiquetasGustos`. */
export function quitarGusto(clave: string): void {
  const g = leerGustos()
  const n: Gustos = { ...g, intereses: [...g.intereses], evitar: [...g.evitar] }
  if (clave.startsWith('interes:')) n.intereses = n.intereses.filter((i) => i !== clave.slice(8))
  else if (clave.startsWith('evitar:')) n.evitar = n.evitar.filter((e) => e !== clave.slice(7))
  else if (clave === 'ritmo') n.ritmo = null
  else if (clave === 'presupuesto') n.presupuesto = null
  else if (clave === 'conNinos') n.conNinos = null
  else if (clave === 'mascotas') n.mascotas = null
  else if (clave === 'movilidadReducida') n.movilidadReducida = null
  else if (clave === 'municipio') n.municipio = null
  guardarGustos(n)
}

export function useGustos(): Gustos {
  const [g, setG] = useState<Gustos>(leerGustos)
  useEffect(() => {
    const alCambiar = () => setG(leerGustos())
    window.addEventListener(EVENTO, alCambiar)
    window.addEventListener('storage', alCambiar)
    return () => { window.removeEventListener(EVENTO, alCambiar); window.removeEventListener('storage', alCambiar) }
  }, [])
  return g
}
