import { describe, expect, it } from 'vitest';

import {
  allowedOrgLevels,
  buildOrgTree,
  canPlaceOrgLevel,
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
    expect(toTreeSelectNodes(nodes).map((node) => node.id)).toEqual([3, 1]);
  });

  it('forbids inverted org ranks but allows skipping a level', () => {
    expect(canPlaceOrgLevel('事业部', '课别')).toBe(true);
    expect(canPlaceOrgLevel('事业部', '部门')).toBe(true);
    expect(canPlaceOrgLevel('部门', '课别')).toBe(true);
    expect(canPlaceOrgLevel('课别', '部门')).toBe(false);
    expect(canPlaceOrgLevel('课别', '事业部')).toBe(false);
    expect(canPlaceOrgLevel('部门', '事业部')).toBe(false);
    expect(canPlaceOrgLevel('课别', '课别')).toBe(true);
    expect(canPlaceOrgLevel(null, '事业部')).toBe(true);
    expect(allowedOrgLevels('课别')).toEqual(['课别']);
    expect(allowedOrgLevels('部门')).toEqual(['部门', '课别']);
    expect(allowedOrgLevels('事业部', ['部门'])).toEqual(['事业部', '部门']);
  });
});
