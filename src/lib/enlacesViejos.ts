// Enlaces de la época de HashRouter (`/#/lugares/abc?x=1`) → ruta normal (`/lugares/abc?x=1`).
// Se importa primero en main.tsx para correr antes de montar el router. Conserva la query de antes del `#`
// (por ejemplo `?code=` del enlace mágico PKCE) y la que viene dentro del hash.
export function migrarEnlaceViejo(loc: Location = location, hist: History = history): boolean {
  if (!loc.hash.startsWith('#/')) return false
  const destino = new URL(loc.hash.slice(1), loc.origin)
  new URLSearchParams(loc.search).forEach((v, k) => { if (!destino.searchParams.has(k)) destino.searchParams.append(k, v) })
  hist.replaceState(null, '', `${destino.pathname}${destino.search}`)
  return true
}
migrarEnlaceViejo()
