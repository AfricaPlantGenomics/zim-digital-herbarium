import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/specimens': 'http://localhost:8000',
      '/images':    'http://localhost:8000',
      '/meta':      'http://localhost:8000',
      '/health':    'http://localhost:8000',
    },
  },
})
