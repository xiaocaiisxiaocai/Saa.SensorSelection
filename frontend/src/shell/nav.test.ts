import { describe, expect, it } from 'vitest';

import { navGroupsFor, selectionNav, systemNav } from './nav';

describe('nav', () => {
  it('lists the selection routes in sidebar order', () => {
    expect(selectionNav.items.map((item) => item.to)).toEqual([
      '/selection/customer',
      '/selection/process',
      '/selection/machine',
      '/selection/sensor',
      '/selection/dictionary',
    ]);
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
