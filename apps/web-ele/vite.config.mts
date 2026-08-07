import { defineConfig } from '@vben/vite-config';

import ElementPlus from 'unplugin-element-plus/vite';

export default defineConfig(async () => ({
  application: {},
  vite: {
    plugins: [ElementPlus({ format: 'esm' })],
  },
}));
