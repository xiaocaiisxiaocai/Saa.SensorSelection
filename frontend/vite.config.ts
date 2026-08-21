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
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replaceAll('\\', '/');
            if (!normalizedId.includes('/node_modules/')) return undefined;
            if (normalizedId.includes('/pdfjs-dist/')) return 'vendor-pdf';
            if (normalizedId.includes('/reka-ui/')) return 'vendor-reka';
            if (normalizedId.includes('/lucide-vue-next/')) {
              return 'vendor-icons';
            }
            if (
              normalizedId.includes('/vue/') ||
              normalizedId.includes('/vue-router/') ||
              normalizedId.includes('/pinia/')
            ) {
              return 'vendor-vue';
            }
            return undefined;
          },
        },
      },
    },
  };
});
