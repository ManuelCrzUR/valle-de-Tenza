// Esqueleto de pantalla mientras carga la ruta. Aparece tras ~150 ms para no parpadear si la carga es instantánea.
export function Cargando() {
  return (
    <div className="wrap pagina skel" role="status" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="skel-bloque skel-titulo" />
      <div className="skel-bloque skel-linea" />
      <div className="skel-bloque skel-linea skel-corta" />
      <div className="skel-bloque skel-panel" />
    </div>
  )
}
