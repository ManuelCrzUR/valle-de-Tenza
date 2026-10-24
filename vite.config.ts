import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

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

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    apiDev(),
    // Offline: sw/sw.js (precache del shell y fuentes, caché de fotos y catálogo). Usa el public/manifest.webmanifest existente.
    // Las páginas prerenderizadas y las fotos NO se precachean. Se registra desde AvisoVersion (virtual:pwa-register/react).
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'sw',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        globPatterns: ['index.html', 'assets/**/*.{js,css}', 'fonts/*.woff2'],
        globIgnores: ['**/fotos/**', '**/lugares/**', '**/municipios/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  test: { exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'] },
})
