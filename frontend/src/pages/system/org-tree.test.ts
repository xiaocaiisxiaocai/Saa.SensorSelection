import { describe, expect, it } from 'vitest';

import {
  buildOrgTree,
  canHaveOrgChildren,
  nextOrgSortOrder,
  orgLevelUnder,
  flattenOrgTree,
  toTreeSelectNodes,
} from './org-tree';

describe('org-tree', () => {
  it('builds a sorted tree that allows skipped parents as roots', () => {
    const nodes = [
      {
        id: 2,
        name: '课别',
        parentId: 1,
        level: '课别',
        sortOrder: 1,
        childCount: 0,
        userCount: 1,
      },
      {
        id: 1,
        name: '事业部',
        parentId: null,
        level: '事业部',
        sortOrder: 2,
        childCount: 1,
        userCount: 0,
      },
      {
        id: 3,
        name: '孤儿',
        parentId: 99,
        level: null,
        sortOrder: 0,
        childCount: 0,
        userCount: 0,
      },
    ];
    const tree = buildOrgTree(nodes);
    expect(tree.map((node) => node.name)).toEqual(['孤儿', '事业部']);
    expect(tree[1]?.children[0]?.name).toBe('课别');
    expect(flattenOrgTree(tree)).toHaveLength(3);
    expect(toTreeSelectNodes(nodes).map((node) => node.value)).toEqual([3, 1]);
  });

  it('treats 课别 as the last level that cannot have children', () => {
    expect(canHaveOrgChildren('课别')).toBe(false);
    expect(canHaveOrgChildren('部门')).toBe(true);
    expect(canHaveOrgChildren(null)).toBe(true);
    expect(canHaveOrgChildren('自定义')).toBe(true);
  });

  it('derives the level from the position and puts a new unit last', () => {
    expect(orgLevelUnder(null, true)).toBe('事业部');
    expect(orgLevelUnder('事业部', false)).toBe('部门');
    expect(orgLevelUnder('部门', false)).toBe('课别');
    expect(orgLevelUnder('课别', false)).toBeNull();
    expect(orgLevelUnder(null, false)).toBeNull();
    expect(orgLevelUnder('自定义', false)).toBeNull();

    const node = (id: number, parentId: number | null, sortOrder: number) => ({
      childCount: 0,
      id,
      level: null,
      name: String(id),
      parentId,
      sortOrder,
      userCount: 0,
    });
    const nodes = [node(1, null, 1), node(2, 1, 3), node(3, 1, 7)];
    expect(nextOrgSortOrder(nodes, 1)).toBe(8);
    expect(nextOrgSortOrder(nodes, null)).toBe(2);
    expect(nextOrgSortOrder(nodes, 2)).toBe(1);
  });
});
