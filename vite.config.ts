import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo sirve /api/chat con la misma función que usa Vercel (lee .env.local).
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', process.cwd(), ''))
      server.middlewares.use('/api/chat', async (req, res) => {
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
        const sinCuerpo = req.method === 'GET' || req.method === 'HEAD'
        const mod = await server.ssrLoadModule('/api/chat.ts')
        const out: Response = req.method === 'POST'
          ? await mod.POST(new Request('http://localhost/api/chat', { method: 'POST', headers, body: sinCuerpo ? undefined : Buffer.concat(chunks) }))
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
