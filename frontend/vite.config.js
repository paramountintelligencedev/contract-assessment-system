import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_API_URL is injected at build time by deploy.sh:
//   VITE_API_URL=https://xxxx.cloudfront.net npm run build
//
// Falls back to localhost for local development.
export default defineConfig({
  plugins: [react()],
  define: {
    // Makes import.meta.env.VITE_API_URL available in source
  },
  server: {
    // Local dev proxy — avoids CORS issues when running against local backend
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
