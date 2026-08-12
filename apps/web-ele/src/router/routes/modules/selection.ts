import type { RouteRecordRaw } from 'vue-router';

import { BasicLayout } from '#/layouts';

const routes: RouteRecordRaw[] = [
  {
    component: BasicLayout,
    meta: {
      hideInBreadcrumb: true,
      icon: 'lucide:library',
      order: -10,
      title: '感应器选型',
    },
    name: 'SelectionRoot',
    path: '/selection',
    redirect: '/selection/customer',
    children: [
      {
        component: () => import('#/modules/selection/views/customer.vue'),
        meta: {
          icon: 'lucide:building-2',
          order: -10,
          title: '客户管理',
        },
        name: 'SelectionCustomer',
        path: 'customer',
      },
      {
        component: () => import('#/modules/selection/views/process.vue'),
        meta: {
          icon: 'lucide:factory',
          order: -9,
          title: '制程管理',
        },
        name: 'SelectionProcess',
        path: 'process',
      },
      {
        component: () => import('#/modules/selection/views/machine.vue'),
        meta: {
          icon: 'lucide:cpu',
          order: -8,
          title: '机型结构',
        },
        name: 'SelectionMachine',
        path: 'machine',
      },
      {
        component: () => import('#/modules/selection/views/sensor.vue'),
        meta: {
          icon: 'lucide:list-filter',
          order: -7,
          title: 'Sensor 型号字典',
        },
        name: 'SelectionSensor',
        path: 'sensor',
      },
      {
        component: () => import('#/modules/selection/views/dictionary.vue'),
        meta: {
          icon: 'lucide:book-type',
          order: -6,
          title: '数据字典',
        },
        name: 'SelectionDictionary',
        path: 'dictionary',
      },
      {
        component: () => import('#/modules/selection/views/search.vue'),
        meta: {
          hideInMenu: true,
          hideInTab: true,
          title: '搜索结果',
        },
        name: 'SelectionSearch',
        path: 'search',
      },
    ],
  },
];

export default routes;
