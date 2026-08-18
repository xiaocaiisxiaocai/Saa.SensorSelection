import { defineConfig } from '@vben/vite-config';

import ElementPlus from 'unplugin-element-plus/vite';

export default defineConfig(async () => ({
  application: {},
  vite: {
    plugins: [ElementPlus({ format: 'esm' })],
    server: {
      proxy: {
        // 开发环境把 /api 请求代理到 ASP.NET Core 后端（可用 VITE_API_TARGET 覆盖端口）
        '/api': {
          changeOrigin: true,
          target: process.env.VITE_API_TARGET || 'http://localhost:5080',
        },
      },
    },
  },
}));
