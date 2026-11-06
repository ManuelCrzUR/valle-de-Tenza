export const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

/** IP del cliente. En Vercel, `x-real-ip` es la del visitante. Si solo hay X-Forwarded-For, se usa la última (la que agrega el proxy), no la primera. */
export function ipCliente(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim()
  if (real) return real.slice(0, 80)
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const partes = xff.split(',').map((s) => s.trim()).filter(Boolean)
    const ultima = partes[partes.length - 1]
    if (ultima) return ultima.slice(0, 80)
  }
  return 'local'
}

export function crearLimite({ max, ventanaMs }: { max: number; ventanaMs: number }) {
  const visitas = new Map<string, number[]>()
  return (ip: string, ahora = Date.now()): boolean => {
    const recientes = (visitas.get(ip) ?? []).filter((t) => ahora - t < ventanaMs)
    recientes.push(ahora)
    visitas.set(ip, recientes)
    if (visitas.size > 5000) {
      for (const [k, v] of visitas) if (!v.some((t) => ahora - t < ventanaMs)) visitas.delete(k)
    }
    return recientes.length > max
  }
}
