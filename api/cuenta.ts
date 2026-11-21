import { supabaseConfig } from '../server/env.js'
import { eliminarCuenta } from '../server/cuenta.js'
import { crearLimite, ipCliente, json } from '../server/http.js'

const limitado = crearLimite({ max: 5, ventanaMs: 60 * 60 * 1000 })
const noPermitido = () => new Response(JSON.stringify({ error: 'metodo', mensaje: 'Solo POST.' }), {
  status: 405,
  headers: { 'content-type': 'application/json; charset=utf-8', allow: 'POST', 'cache-control': 'no-store' },
})

export async function POST(request: Request): Promise<Response> {
  if (limitado(ipCliente(request))) return json({ error: 'limite', mensaje: 'Demasiados intentos desde esta red. No se borró nada.' }, 429)
  return eliminarCuenta(request, { config: supabaseConfig() })
}

export const GET = noPermitido
export const PUT = noPermitido
export const PATCH = noPermitido
export const DELETE = noPermitido
