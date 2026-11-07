// Reproduce el arranque de Vercel: tsc emite ESM y Node carga los .js sin empaquetar.
// Si falta la extensión .js, Node falla con ERR_MODULE_NOT_FOUND, igual que /api/estado.
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const salida = resolve(raiz, 'dist-runtime')
rmSync(salida, { recursive: true, force: true })

for (const nombre of ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL']) {
  delete process.env[nombre]
}

try {
  execFileSync('npx', ['tsc', '-p', 'tsconfig.runtime.json', '--outDir', salida], { cwd: raiz, stdio: 'inherit' })
  const cargar = (rel) => import(pathToFileURL(resolve(salida, rel)).href)
  const estado = await cargar('api/estado.js')
  const res = await estado.GET()
  const cuerpo = await res.json()
  if (res.status !== 200 || typeof cuerpo.openai !== 'boolean' || !cuerpo.modo) {
    throw new Error(`estado inesperado ${res.status} ${JSON.stringify(cuerpo)}`)
  }
  await cargar('api/itinerario.js')
  await cargar('api/solicitudes.js')
  await cargar('api/dossier.js')
  await cargar('api/transcribir.js')
  await cargar('api/voz.js')
  await cargar('api/chat.js')
  const itinerario = await cargar('api/itinerario.js')
  const pedido = new Request('http://local/api/itinerario', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mensaje: 'dos días de naturaleza en Chivor', chips: { plan: 'aventura', municipio: 'chivor', dias: 2 } }),
  })
  const ruta = await itinerario.POST(pedido)
  const plan = await ruta.json()
  if (ruta.status !== 200 || plan.itinerario?.modo !== 'demo') {
    throw new Error(`itinerario inesperado ${ruta.status} ${JSON.stringify(plan).slice(0, 300)}`)
  }
  const ids = (plan.itinerario.lugares ?? []).map((l) => l.id)
  if (!ids.length || ids.some((id) => String(id).includes('guateque'))) throw new Error('ids no anclados al catálogo')
  console.log('runtime ok', cuerpo.modo, ids.length, 'lugares')
} finally {
  rmSync(salida, { recursive: true, force: true })
}
