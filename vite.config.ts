import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo sirve /api/* con las mismas funciones que Vercel (lee .env.local).
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', process.cwd(), ''))
      server.middlewares.use('/api/', async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost')
        const ruta = url.pathname.replace(/\/$/, '')
        const archivo = `/api${ruta}.ts`
        const chunks: Buffer[] = []
        let bytes = 0
        for await (const c of req) {
          const b = c as Buffer
          bytes += b.length
          if (bytes > 4_000_000) { res.statusCode = 413; res.end('audio_grande'); return }
          chunks.push(b)
        }
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
        const sinCuerpo = req.method === 'GET' || req.method === 'HEAD'
        let mod: { POST?: (r: Request) => Promise<Response>; GET?: (r: Request) => Promise<Response> }
        try { mod = await server.ssrLoadModule(archivo) } catch { res.statusCode = 404; res.end('no'); return }
        const peticion = new Request(`http://localhost/api${ruta}`, { method: req.method, headers, body: sinCuerpo ? undefined : Buffer.concat(chunks) })
        const out: Response = req.method === 'POST' && mod.POST
          ? await mod.POST(peticion)
          : req.method === 'GET' && mod.GET
            ? await mod.GET(peticion)
            : new Response(null, { status: 405 })
        res.statusCode = out.status
        out.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(Buffer.from(await out.arrayBuffer()))
      })
    },
  }
}

// base './' para servir bajo usuario.github.io/<repo>/
export default defineConfig({
  base: './',
  plugins: [react(), apiDev()],
})
