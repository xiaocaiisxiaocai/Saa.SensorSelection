import { describe, expect, it } from 'vitest';

import {
  collectExpandableIds,
  filterTree,
  findTreeAncestorIds,
  findTreeLabel,
  flattenTree,
  type TreeNode,
} from './tree-select';

const nodes: TreeNode[] = [
  {
    id: 1,
    label: '总部',
    children: [
      {
        id: 2,
        label: '华东',
        children: [{ id: 3, label: '上海办' }],
      },
      { id: 4, label: '华南' },
    ],
  },
];

describe('tree-select helpers', () => {
  it('flattens only expanded branches', () => {
    const collapsed = flattenTree(nodes, new Set());
    expect(collapsed.map((row) => row.label)).toEqual(['总部']);

    const expanded = flattenTree(nodes, new Set(['1', '2']));
    expect(expanded.map((row) => row.label)).toEqual([
      '总部',
      '华东',
      '上海办',
      '华南',
    ]);
    expect(expanded.find((row) => row.id === 3)?.depth).toBe(2);
  });

  it('keeps ancestor paths when filtering', () => {
    const filtered = filterTree(nodes, '上海');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.label).toBe('总部');
    expect(filtered[0]?.children?.[0]?.children?.[0]?.label).toBe('上海办');
    expect(collectExpandableIds(filtered)).toEqual(['1', '2']);
    expect(findTreeLabel(nodes, 3)).toBe('上海办');
  });

  it('lists the ancestors of a node from root to parent', () => {
    expect(findTreeAncestorIds(nodes, 3)).toEqual(['1', '2']);
    expect(findTreeAncestorIds(nodes, 1)).toEqual([]);
    expect(findTreeAncestorIds(nodes, 99)).toEqual([]);
    expect(findTreeAncestorIds(nodes, null)).toEqual([]);
  });
});
