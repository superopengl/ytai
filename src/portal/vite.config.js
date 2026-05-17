import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.YTAI_API_PORT ?? '9521';
const portalPort = Number(process.env.YTAI_PORTAL_PORT ?? 9522);

// http-proxy reuses keep-alive sockets aggressively; when several /speak
// POSTs fire in parallel (one per sentence as Brain streams) it can grab a
// connection Fastify just closed and surface "socket hang up". Disabling
// the keep-alive agent on the proxy makes every proxied request open a
// fresh socket — small perf hit, eliminates the race.
const noKeepAliveProxy = {
  target: `http://localhost:${apiPort}`,
  changeOrigin: true,
  agent: false
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: portalPort,
    proxy: {
      '/api': noKeepAliveProxy,
      '/healthcheck': noKeepAliveProxy
    }
  },
  build: {
    outDir: '../../dist/public',
    emptyOutDir: true
  }
});
