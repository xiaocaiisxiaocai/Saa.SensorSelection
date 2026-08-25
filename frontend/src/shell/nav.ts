import type { Component } from 'vue';
import {
  BookType,
  Building2,
  Cpu,
  Factory,
  ListFilter,
  Network,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-vue-next';

export type NavGroupId = 'selection' | 'system';

export interface NavItem {
  icon: Component;
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
    { to: '/selection/customer', label: '客户管理', icon: Building2 },
    { to: '/selection/process', label: '制程管理', icon: Factory },
    { to: '/selection/machine', label: '机型结构', icon: Cpu },
    { to: '/selection/sensor', label: 'Sensor型号', icon: ListFilter },
    { to: '/selection/dictionary', label: '数据字典', icon: BookType },
  ],
};

export const systemNav: NavGroup = {
  id: 'system',
  label: '系统管理',
  items: [
    {
      to: '/system/user',
      label: '用户管理',
      icon: Users,
      permissions: ['rbac:view'],
    },
    {
      to: '/system/role',
      label: '角色管理',
      icon: ShieldCheck,
      permissions: ['rbac:view'],
    },
    {
      to: '/system/org',
      label: '组织架构',
      icon: Network,
      permissions: ['rbac:view'],
    },
    {
      to: '/system/audit-log',
      label: '操作日志',
      icon: ScrollText,
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
