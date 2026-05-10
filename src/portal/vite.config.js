import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.YTAI_API_PORT ?? '9521';
const portalPort = Number(process.env.YTAI_PORTAL_PORT ?? 9522);

export default defineConfig({
  plugins: [react()],
  server: {
    port: portalPort,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true
      },
      '/healthcheck': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../../dist/public',
    emptyOutDir: true
  }
});
