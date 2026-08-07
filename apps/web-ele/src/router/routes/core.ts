import type { RouteRecordRaw } from 'vue-router';

const fallbackNotFoundRoute: RouteRecordRaw = {
  component: () => import('#/views/_core/fallback/not-found.vue'),
  meta: {
    hideInBreadcrumb: true,
    hideInMenu: true,
    hideInTab: true,
    title: '404',
  },
  name: 'FallbackNotFound',
  path: '/:path(.*)*',
};

const coreRoutes: RouteRecordRaw[] = [
  {
    meta: { title: '感应器选型' },
    name: 'Root',
    path: '/',
    redirect: '/selection/customer',
  },
];

export { coreRoutes, fallbackNotFoundRoute };
