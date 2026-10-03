import { useEffect } from 'react'

// Título del documento, scroll arriba y foco en el h1 (#titulo) al entrar a una pantalla.
export function usePagina(titulo: string) {
  useEffect(() => {
    document.title = `${titulo} · Valle Directo`
    window.scrollTo(0, 0)
    document.getElementById('titulo')?.focus({ preventScroll: true })
  }, [titulo])
}
