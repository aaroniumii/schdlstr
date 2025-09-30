// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',      // escucha en todas las interfaces
    port: 5173,
    strictPort: true,     // evita cambiar de puerto si 5173 está ocupado
    allowedHosts: ['schdlstr.aaroniumii.com'],
    hmr: {
      host: 'schdlstr.aaroniumii.com',
      protocol: 'wss',
      port: 5173
    },
    proxy: {
      '/schedule': 'http://localhost:8000',
      '/scheduled': 'http://localhost:8000'
    }
  }
})


