import type { RouteRecordRaw } from 'vue-router';

import { traverseTreeValues } from '@vben/utils';

import { coreRoutes, fallbackNotFoundRoute } from './core';
import selectionRoutes from './modules/selection';
import systemRoutes from './modules/system';

const accessRoutes: RouteRecordRaw[] = [...selectionRoutes, ...systemRoutes];
const routes: RouteRecordRaw[] = [...coreRoutes, fallbackNotFoundRoute];
const coreRouteNames = traverseTreeValues(coreRoutes, (route) => route.name);

export { accessRoutes, coreRouteNames, routes };
