import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind to 0.0.0.0 so localhost resolves consistently (IPv4/IPv6)
    port: 5173,
    proxy: (() => {
      const backendPort = process.env.BACKEND_PORT || process.env.PORT || '5001';
      return {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
      };
    })(),
  },
})
