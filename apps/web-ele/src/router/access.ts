import type {
  ComponentRecordType,
  GenerateMenuAndRoutesOptions,
  MenuRecordRaw,
} from '@vben/types';
import type { Router } from 'vue-router';

import { generateAccessible } from '@vben/access';
import { useAccessStore } from '@vben/stores';

import { BasicLayout } from '#/layouts';
import { accessRoutes } from '#/router/routes';

/** 已动态注册到 router 的访问路由根节点名（重建时先移除失效项）。 */
let addedRouteNames: Set<string> = new Set();

async function generateAccess(options: GenerateMenuAndRoutesOptions) {
  const layoutMap: ComponentRecordType = { BasicLayout };
  const pageMap: ComponentRecordType = import.meta.glob(
    '../modules/selection/views/**/*.vue',
  );

  const result = await generateAccessible('frontend', {
    ...options,
    layoutMap,
    pageMap,
  });

  // 一级分组路由（/selection、/system）挂在统一 Layout 下，菜单仍展平为一级项，
  // 避免页面切换卡在旧视图
  const accessibleMenus = result.accessibleMenus.flatMap((menu) => {
    if (!menu.children?.length || !menu.path.startsWith('/')) return [menu];
    return menu.children.map(
      (child): MenuRecordRaw => ({
        ...child,
        parent: undefined,
        parents: undefined,
      }),
    );
  });

  return {
    ...result,
    accessibleMenus,
  };
}

/**
 * 按当前权限码重建可访问路由与菜单（登录/登出/权限变更后调用）。
 * roles 为「权限码 + 角色码」合集，与路由 meta.authority 做交集过滤。
 */
async function refreshAccess(router: Router, roles: string[]) {
  const result = await generateAccess({ roles, router, routes: accessRoutes });

  // 移除上一轮已注册、本轮不再可访问的路由根（避免登出后仍可直接访问旧页面）
  const nextNames = new Set(
    result.accessibleRoutes
      .map((route) => route.name)
      .filter((name): name is string => typeof name === 'string'),
  );
  for (const name of addedRouteNames) {
    if (!nextNames.has(name)) {
      router.removeRoute(name);
    }
  }
  addedRouteNames = nextNames;

  // 同步回 access store：侧边菜单与守卫一样读取 accessMenus，
  // 登录/登出后不整页刷新也能即时增删菜单项
  const accessStore = useAccessStore();
  accessStore.setAccessMenus(result.accessibleMenus);
  accessStore.setAccessRoutes(result.accessibleRoutes);

  return result;
}

export { generateAccess, refreshAccess };
