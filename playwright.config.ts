import { defineConfig, devices } from '@playwright/test'

// Prueba de cierre de la Fase 1. Requiere Supabase local en marcha (`npx supabase start`) y estas variables,
// que salen de `npx supabase status -o env`:
//   VITE_SUPABASE_URL (= API_URL), VITE_SUPABASE_ANON_KEY (= ANON_KEY),
//   API_URL, SERVICE_ROLE_KEY y MAILPIT_URL (o INBUCKET_URL) para leer el correo y limpiar datos.
export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: 'offline.spec.ts',   // necesita build + service worker: npm run e2e:offline
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5186', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite --port 5186 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5186',
    reuseExistingServer: true,
    env: { VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? '', VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? '' },
  },
})
