import type {
  ComponentRecordType,
  GenerateMenuAndRoutesOptions,
  MenuRecordRaw,
} from '@vben/types';

import { generateAccessible } from '@vben/access';

import { BasicLayout } from '#/layouts';

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

  // 路由挂在统一 Layout 下，菜单仍展平为一级项，避免页面切换卡在旧视图
  const accessibleMenus = result.accessibleMenus.flatMap((menu) => {
    if (menu.path !== '/selection' || !menu.children?.length) return [menu];
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

export { generateAccess };
