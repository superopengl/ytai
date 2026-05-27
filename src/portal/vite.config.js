import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// `.env` lives at the workspace root (two dirs up from src/portal). Vite's
// `loadEnv` normally only exposes `VITE_*` vars, so we pass our `YTAI_`
// prefix explicitly — keeps everything in the YTAI_ namespace the API uses.
const workspaceRoot = resolve(__dirname, '../..');

// http-proxy reuses keep-alive sockets aggressively; when several /speak
// POSTs fire in parallel (one per sentence as Brain streams) it can grab a
// connection Fastify just closed and surface "socket hang up". Disabling
// the keep-alive agent on the proxy makes every proxied request open a
// fresh socket — small perf hit, eliminates the race.
function noKeepAliveProxy(apiPort) {
  return {
    target: `http://localhost:${apiPort}`,
    changeOrigin: true,
    agent: false
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, 'YTAI_');
  const apiPort = env.YTAI_API_PORT ?? '9521';
  const portalPort = Number(env.YTAI_PORTAL_PORT ?? 9522);
  const proxy = noKeepAliveProxy(apiPort);

  return {
    plugins: [react()],
    define: {
      // Exposed to client code as `__YTAI_GOOGLE_CLIENT_ID__`. Source comes
      // from the workspace-root `.env` so the same file works for both the
      // API and the build without a `VITE_*` rename. process.env fallback
      // covers CI / release.sh where the var is exported (no .env file).
      __YTAI_GOOGLE_CLIENT_ID__: JSON.stringify(
        env.YTAI_GOOGLE_CLIENT_ID || process.env.YTAI_GOOGLE_CLIENT_ID || ''
      )
    },
    server: {
      port: portalPort,
      proxy: {
        '/api': proxy,
        '/healthcheck': proxy
      }
    },
    build: {
      outDir: '../../dist/public',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Pin shared deps to stable vendor chunks. Two goals:
          //   1. The main entry (HomePage path) only carries react + antd
          //      core + the icons HomePage actually uses; everything else
          //      ships as separate files that load in parallel.
          //   2. Lazy chunks (GoogleSignInButton, HeroBackdrop, route
          //      pages) dedup against these instead of duplicating antd
          //      and friends into themselves.
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('react-router')) return 'vendor-router';
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'vendor-react';
            }
            // antd internally imports @ant-design/icons, and the icons
            // package re-imports antd theme utilities — splitting them
            // into separate chunks creates a top-level TDZ ("Cannot
            // access 'X' before initialization") in prod. Keep them
            // co-located in one vendor chunk so the cycle resolves in
            // a single module-init pass.
            if (
              id.includes('@ant-design/icons') ||
              id.includes('/antd/') ||
              id.includes('/rc-')
            ) {
              return 'vendor-antd';
            }
          }
        }
      }
    }
  };
});
