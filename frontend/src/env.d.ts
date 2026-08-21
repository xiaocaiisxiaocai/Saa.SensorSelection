/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_API_TARGET: string;
  readonly VITE_API_TIMEOUT: string;
  readonly VITE_BASE: string;
  readonly VITE_PORT: string;
  readonly VITE_ROUTER_HISTORY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
