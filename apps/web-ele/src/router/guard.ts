import type { Router } from 'vue-router';

import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';
import { startProgress, stopProgress } from '@vben/utils';

import { getStoredToken } from '#/modules/selection/api';
import { useSelectionStore } from '#/modules/selection/store';
import { accessRoutes, coreRouteNames } from '#/router/routes';

import { generateAccess } from './access';

function setupCommonGuard(router: Router) {
  const loadedPaths = new Set<string>();

  router.beforeEach((to) => {
    to.meta.loaded = loadedPaths.has(to.path);
    if (!to.meta.loaded && preferences.transition.progress) startProgress();
    return true;
  });

  router.afterEach((to) => {
    loadedPaths.add(to.path);
    if (preferences.transition.progress) stopProgress();
  });
}

function setupLocalAccessGuard(router: Router) {
  router.beforeEach(async (to) => {
    if (coreRouteNames.includes(to.name as string)) return true;

    const accessStore = useAccessStore();
    if (accessStore.isAccessChecked) return true;

    // 先加载当前用户权限（无 token → 匿名只读），再按权限码过滤路由与菜单
    const selectionStore = useSelectionStore();
    await selectionStore.ensureProfile();

    // 携带 token 但已失效（/me 401）→ 先到登录页，登录后按 redirect 回跳
    if (getStoredToken() && !selectionStore.profile) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }

    const { accessibleMenus, accessibleRoutes } = await generateAccess({
      roles: [...accessStore.accessCodes, ...selectionStore.userRoleCodes],
      router,
      routes: accessRoutes,
    });
    accessStore.setAccessMenus(accessibleMenus);
    accessStore.setAccessRoutes(accessibleRoutes);
    accessStore.setIsAccessChecked(true);

    return {
      ...router.resolve(to.fullPath),
      replace: true,
    };
  });
}

function createRouterGuard(router: Router) {
  setupCommonGuard(router);
  setupLocalAccessGuard(router);
}

export { createRouterGuard };
