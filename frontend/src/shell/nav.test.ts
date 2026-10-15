import { describe, expect, it } from 'vitest';

import { activeNavKey, navGroupsFor, selectionNav, systemNav } from './nav';

describe('nav', () => {
  it('lists the selection routes in sidebar order', () => {
    expect(selectionNav.items.map((item) => item.to)).toEqual([
      '/selection/customer',
      '/selection/machine',
      '/selection/sensor',
      '/selection/dictionary',
    ]);
  });

  it('selects the merged 客户/制程 item on either tab, and only exact sub-paths', () => {
    const groups = navGroupsFor([]);
    expect(activeNavKey(groups, '/selection/customer')).toBe(
      '/selection/customer',
    );
    expect(activeNavKey(groups, '/selection/process')).toBe(
      '/selection/customer',
    );
    expect(activeNavKey(groups, '/selection/machine')).toBe(
      '/selection/machine',
    );
    // 前缀相同但不是子路径的地址不算
    expect(activeNavKey(groups, '/selection/customers')).toBeUndefined();
    expect(activeNavKey(groups, '/selection/search')).toBeUndefined();
  });

  it('hides the dictionary from guests, who have no permissions', () => {
    const selectionItems = (permissions: string[]) =>
      navGroupsFor(permissions)
        .find((group) => group.id === 'selection')
        ?.items.map((item) => item.to);
    expect(selectionItems([])).not.toContain('/selection/dictionary');
    expect(selectionItems([])).toEqual([
      '/selection/customer',
      '/selection/machine',
      '/selection/sensor',
    ]);
    expect(selectionItems(['selection:read'])).toContain(
      '/selection/dictionary',
    );
  });

  it('keeps system routes available for later permission gating', () => {
    expect(systemNav.items.map((item) => item.to)).toEqual([
      '/system/user',
      '/system/role',
      '/system/org',
      '/system/audit-log',
    ]);
  });

  it('hides the system group without rbac:view and audit-log without audit:view', () => {
    expect(navGroupsFor([]).map((group) => group.id)).toEqual(['selection']);
    expect(
      navGroupsFor(['rbac:view'])
        .find((group) => group.id === 'system')
        ?.items.map((item) => item.to),
    ).toEqual(['/system/user', '/system/role', '/system/org']);
    expect(
      navGroupsFor(['rbac:view', 'audit:view'])
        .find((group) => group.id === 'system')
        ?.items.map((item) => item.to),
    ).toEqual([
      '/system/user',
      '/system/role',
      '/system/org',
      '/system/audit-log',
    ]);
  });
});
