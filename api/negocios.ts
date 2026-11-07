import { listarFichasPublicas } from '../server/empresas.js'
import { json } from '../server/http.js'

export async function GET(): Promise<Response> {
  const lista = await listarFichasPublicas()
  return json(lista)
}
