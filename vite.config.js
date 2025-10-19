import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@pages': fileURLToPath(new URL('./src/pages', import.meta.url)),
      '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/shared/features', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/shared/ui', import.meta.url)),
      '@styles': fileURLToPath(new URL('./src/shared/styles', import.meta.url)),
      '@services': fileURLToPath(new URL('./src/services', import.meta.url)),
      '@lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
    },
  },
  server: {
    host: true, // bind to 0.0.0.0 so localhost resolves consistently (IPv4/IPv6)
    port: 5173,
    // Allow dev server access from tunnels like localhost.run and Cloudflare
    // Add any additional domains you use for tunneling here
    allowedHosts: [
      '.localhost.run',
      '.lhr.life', // some localhost.run tunnels resolve under this domain
      '.trycloudflare.com',
    ],
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
