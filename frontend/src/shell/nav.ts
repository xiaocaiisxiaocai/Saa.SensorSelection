export type NavGroupId = 'selection' | 'system';

export interface NavItem {
  label: string;
  to: string;
  /** 这些路径（及其子路径）下菜单项也算选中；一个菜单项对应多张 Tab 页时用 */
  activePaths?: string[];
  permissions?: string[];
}

export interface NavGroup {
  id: NavGroupId;
  items: NavItem[];
  label: string;
}

export const selectionNav: NavGroup = {
  id: 'selection',
  label: '选型数据',
  items: [
    {
      to: '/selection/customer',
      label: '客户/制程',
      activePaths: ['/selection/customer', '/selection/process'],
    },
    { to: '/selection/machine', label: '机型结构' },
    { to: '/selection/sensor', label: 'Sensor型号' },
    // 字典是维护用的基础数据，游客（未登录，没有任何权限）不显示
    {
      to: '/selection/dictionary',
      label: '数据字典',
      permissions: ['selection:read'],
    },
  ],
};

export const systemNav: NavGroup = {
  id: 'system',
  label: '系统管理',
  items: [
    {
      to: '/system/user',
      label: '用户管理',
      permissions: ['rbac:view'],
    },
    {
      to: '/system/role',
      label: '角色管理',
      permissions: ['rbac:view'],
    },
    {
      to: '/system/org',
      label: '组织架构',
      permissions: ['rbac:view'],
    },
    {
      to: '/system/audit-log',
      label: '操作日志',
      permissions: ['rbac:view', 'audit:view'],
    },
  ],
};

/** 当前路径对应的菜单项（取 to），没有则返回 undefined */
export function activeNavKey(
  groups: readonly NavGroup[],
  path: string,
): string | undefined {
  const items = groups.flatMap((group) => group.items);
  const within = (base: string) => path === base || path.startsWith(`${base}/`);
  return (
    items.find((item) => item.to === path) ??
    items.find((item) => (item.activePaths ?? []).some(within))
  )?.to;
}

export function navGroupsFor(permissions: readonly string[]): NavGroup[] {
  const allowed = (item: NavItem) =>
    (item.permissions ?? []).every((code) => permissions.includes(code));
  const groups: NavGroup[] = [
    { ...selectionNav, items: selectionNav.items.filter(allowed) },
  ];
  const systemItems = systemNav.items.filter(allowed);
  if (systemItems.length > 0) {
    groups.push({ ...systemNav, items: systemItems });
  }
  return groups;
}
