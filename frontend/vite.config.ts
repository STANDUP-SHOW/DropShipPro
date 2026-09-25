import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Regex on purpose: a plain '/api' prefix also caught /api-power, the
      // public page, and proxied it to the backend (502 in preview, 25/09/2026).
      '^/api/': 'http://localhost:4000',
    },
  },
})
