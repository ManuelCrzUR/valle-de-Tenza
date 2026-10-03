import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' para servir bajo usuario.github.io/<repo>/
export default defineConfig({
  base: './',
  plugins: [react()],
})
