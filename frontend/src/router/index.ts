import {
  createRouter,
  createWebHashHistory,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router';

import { installGuards } from '@/router/guards';

const history =
  import.meta.env.VITE_ROUTER_HISTORY === 'hash'
    ? createWebHashHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL);

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/selection/customer',
  },
  {
    path: '/login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { layout: 'none', public: true, title: '登录' },
  },
  {
    path: '/selection/customer',
    component: () => import('@/pages/selection/CustomerPage.vue'),
    meta: { title: '客户管理' },
  },
  {
    path: '/selection/process',
    component: () => import('@/pages/selection/ProcessPage.vue'),
    meta: { title: '制程管理' },
  },
  {
    path: '/selection/machine',
    component: () => import('@/pages/selection/MachinePage.vue'),
    meta: { title: '机型结构' },
  },
  {
    path: '/selection/sensor',
    component: () => import('@/pages/selection/SensorPage.vue'),
    meta: { title: 'Sensor型号' },
  },
  {
    path: '/selection/dictionary',
    component: () => import('@/pages/selection/DictionaryPage.vue'),
    meta: { title: '数据字典' },
  },
  {
    path: '/selection/search',
    component: () => import('@/pages/selection/SearchPage.vue'),
    meta: { title: '搜索结果' },
  },
  {
    path: '/system/user',
    component: () => import('@/pages/system/UserPage.vue'),
    meta: { permissions: ['rbac:view'], title: '用户管理' },
  },
  {
    path: '/system/role',
    component: () => import('@/pages/system/RolePage.vue'),
    meta: { permissions: ['rbac:view'], title: '角色管理' },
  },
  {
    path: '/system/org',
    component: () => import('@/pages/system/OrgPage.vue'),
    meta: { permissions: ['rbac:view'], title: '组织架构' },
  },
  {
    path: '/system/audit-log',
    component: () => import('@/pages/system/AuditLogPage.vue'),
    meta: { permissions: ['rbac:view', 'audit:view'], title: '操作日志' },
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: { public: true, title: '未找到页面' },
  },
];

export const router = createRouter({
  history,
  routes,
});

installGuards(router);

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : '';
  document.title = title ? `${title} · 感应器选型软件` : '感应器选型软件';
});
