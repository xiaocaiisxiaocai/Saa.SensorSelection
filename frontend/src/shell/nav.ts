export type NavGroupId = 'selection' | 'system';

export interface NavItem {
  label: string;
  to: string;
  permissions?: string[];
}

export interface NavGroup {
  id: NavGroupId;
  items: NavItem[];
  label: string;
}

export const selectionNav: NavGroup = {
  id: 'selection',
  label: '感应器选型',
  items: [
    { to: '/selection/customer', label: '客户管理' },
    { to: '/selection/process', label: '制程管理' },
    { to: '/selection/machine', label: '机型结构' },
    { to: '/selection/sensor', label: 'Sensor型号' },
    { to: '/selection/dictionary', label: '数据字典' },
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

export function navGroupsFor(permissions: readonly string[]): NavGroup[] {
  const groups: NavGroup[] = [selectionNav];
  const systemItems = systemNav.items.filter((item) =>
    (item.permissions ?? []).every((code) => permissions.includes(code)),
  );
  if (systemItems.length > 0) {
    groups.push({ ...systemNav, items: systemItems });
  }
  return groups;
}
