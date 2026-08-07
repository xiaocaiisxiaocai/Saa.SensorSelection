import type { RouteRecordRaw } from 'vue-router';

import { traverseTreeValues } from '@vben/utils';

import selectionRoutes from './modules/selection';
import { coreRoutes, fallbackNotFoundRoute } from './core';

const accessRoutes: RouteRecordRaw[] = [...selectionRoutes];
const routes: RouteRecordRaw[] = [...coreRoutes, fallbackNotFoundRoute];
const coreRouteNames = traverseTreeValues(coreRoutes, (route) => route.name);

export { accessRoutes, coreRouteNames, routes };
