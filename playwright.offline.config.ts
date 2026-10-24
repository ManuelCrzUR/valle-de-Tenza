import { defineConfig, devices } from '@playwright/test'

// Prueba de «ver sin señal»: necesita el build (con service worker), así que usa `vite preview` y no el servidor de desarrollo.
// Variables como en playwright.config.ts (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY de `npx supabase status -o env`).
// Las teselas de OSM se simulan: no se descarga nada real en la prueba.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'offline.spec.ts',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5192', trace: 'retain-on-failure', viewport: { width: 375, height: 800 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 800 } } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 5192 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5192',
    reuseExistingServer: true,
    timeout: 180_000,
    env: { VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? '', VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? '' },
  },
})
