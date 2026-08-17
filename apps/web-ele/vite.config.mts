import { defineConfig } from '@vben/vite-config';

import ElementPlus from 'unplugin-element-plus/vite';

export default defineConfig(async () => ({
  application: {},
  vite: {
    plugins: [ElementPlus({ format: 'esm' })],
    server: {
      proxy: {
        // 开发环境把 /api 请求代理到 ASP.NET Core 后端
        '/api': {
          changeOrigin: true,
          target: 'http://localhost:5080',
        },
      },
    },
  },
}));
