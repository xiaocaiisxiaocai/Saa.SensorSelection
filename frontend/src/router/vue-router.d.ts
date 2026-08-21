export {};

declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'none';
    permissions?: string[];
    public?: boolean;
    title?: string;
  }
}

