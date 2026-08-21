import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.VITE_PORT) || 5178;
  const base = env.VITE_BASE || '/';
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:5080';

  return {
    base,
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port,
      strictPort: true,
      proxy: {
        '/api': {
          changeOrigin: true,
          target: apiTarget,
        },
      },
    },
    preview: {
      port,
    },
  };
});
