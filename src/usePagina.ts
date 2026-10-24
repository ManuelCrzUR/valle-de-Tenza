import { useEffect } from 'react'

// Título (y descripción, si se da) del documento, scroll arriba y foco en el h1 (#titulo) al entrar a una pantalla.
export function usePagina(titulo: string, descripcion?: string) {
  useEffect(() => {
    document.title = `${titulo} · Valle Directo`
    if (descripcion) document.querySelector('meta[name="description"]')?.setAttribute('content', descripcion)
    window.scrollTo(0, 0)
    document.getElementById('titulo')?.focus({ preventScroll: true })
  }, [titulo, descripcion])
}
