import type { RouteRecordRaw } from 'vue-router';

import { BasicLayout } from '#/layouts';

const routes: RouteRecordRaw[] = [
  {
    component: BasicLayout,
    meta: {
      // 整组按权限码过滤：无 rbac:view 的用户看不到系统管理菜单，也无法访问其路由
      authority: ['rbac:view'],
      hideInBreadcrumb: true,
      icon: 'lucide:shield',
      order: 10,
      title: '系统管理',
    },
    name: 'SystemRoot',
    path: '/system',
    redirect: '/system/user',
    children: [
      {
        component: () => import('#/modules/rbac/views/user.vue'),
        meta: {
          icon: 'lucide:users',
          order: 10,
          title: '用户管理',
        },
        name: 'SystemUser',
        path: 'user',
      },
      {
        component: () => import('#/modules/rbac/views/role.vue'),
        meta: {
          icon: 'lucide:shield-check',
          order: 11,
          title: '角色管理',
        },
        name: 'SystemRole',
        path: 'role',
      },
      {
        component: () => import('#/modules/rbac/views/org.vue'),
        meta: {
          icon: 'lucide:network',
          order: 12,
          title: '组织架构',
        },
        name: 'SystemOrg',
        path: 'org',
      },
      {
        component: () => import('#/modules/rbac/views/audit-log.vue'),
        meta: {
          // 独立权限码：无 audit:view 的用户即使有 rbac:view 也看不到本页
          authority: ['audit:view'],
          icon: 'lucide:scroll-text',
          order: 13,
          title: '操作日志',
        },
        name: 'SystemAuditLog',
        path: 'audit-log',
      },
    ],
  },
];

export default routes;
