import { describe, expect, it } from 'vitest';

import type { EntityGroup, MachineTab } from '@/domain';

import {
  lockedBranchKeys,
  nodeFromQuery,
  nodeHasChildren,
  nodeLabel,
  nodeTreeKey,
  pageIdsByTreeKey,
  pagesOf,
  treeCheckState,
} from './machine-nodes';

const groups = [
  {
    name: '输送机构',
    machineType: 'mechanism',
    items: [],
    configurations: [
      { name: 'SFC输送段配置', items: ['01 单段输送段（搭配）'] },
      { name: '空配置', items: [] },
    ],
  },
  { name: '空分类', machineType: 'mechanism', items: [], configurations: [] },
] as unknown as EntityGroup[];

const sfc = {
  category: '输送机构',
  configuration: 'SFC输送段配置',
  item: null,
};
const empty = { category: '输送机构', configuration: '空配置', item: null };
const machine = { ...sfc, item: '01 单段输送段（搭配）' };

describe('machine-nodes', () => {
  it('knows which menu nodes have children', () => {
    expect(
      nodeHasChildren(groups, {
        category: '输送机构',
        configuration: null,
        item: null,
      }),
    ).toBe(true);
    expect(nodeHasChildren(groups, sfc)).toBe(true);
    expect(nodeHasChildren(groups, empty)).toBe(false);
    expect(nodeHasChildren(groups, machine)).toBe(false);
    expect(
      nodeHasChildren(groups, {
        category: '空分类',
        configuration: null,
        item: null,
      }),
    ).toBe(false);
    expect(nodeHasChildren(groups, { ...sfc, item: '不存在' })).toBeNull();
    expect(
      nodeHasChildren(groups, {
        category: '不存在',
        configuration: null,
        item: null,
      }),
    ).toBeNull();
  });

  it('reads the node from the address bar, including old item-only links', () => {
    expect(
      nodeFromQuery(groups, { category: '输送机构', configuration: '空配置' }),
    ).toEqual(empty);
    expect(
      nodeFromQuery(groups, {
        category: '输送机构',
        item: '01 单段输送段（搭配）',
      }),
    ).toEqual(machine);
    expect(nodeFromQuery(groups, { category: '空分类' })).toEqual({
      category: '空分类',
      configuration: null,
      item: null,
    });
    expect(
      nodeFromQuery(groups, { category: '输送机构', configuration: '没有' }),
    ).toBeNull();
    expect(nodeFromQuery(groups, {})).toBeNull();
  });

  it('filters pages by node and locks branches that own pages', () => {
    const tab: MachineTab = {
      id: 1,
      catalog: 'mechanism',
      name: '输送',
      sort: 1,
      kind: 'structure',
      pages: [
        { id: 1, name: 'A', node: empty },
        { id: 2, name: 'B', node: machine },
      ],
    };
    expect(pagesOf(tab, empty).map((page) => page.name)).toEqual(['A']);
    expect(pagesOf(tab, sfc)).toEqual([]);
    // 机型节点本来就不能加子选单，只锁分组 / 配置
    expect([...lockedBranchKeys([tab])]).toEqual([nodeTreeKey(empty)]);
    expect(nodeLabel(machine)).toBe('01 单段输送段（搭配）');
    expect(nodeLabel(empty)).toBe('空配置');
  });

  it('maps tree nodes to the second-level tabs under them for checking', () => {
    const tab: MachineTab = {
      id: 1,
      catalog: 'mechanism',
      name: '输送',
      sort: 1,
      kind: 'structure',
      pages: [
        { id: 1, name: 'A', node: empty },
        { id: 2, name: 'B', node: machine },
        { id: 3, name: 'C', node: machine },
      ],
    };
    const group = nodeTreeKey({
      category: '输送机构',
      configuration: null,
      item: null,
    });
    const ids = pageIdsByTreeKey([tab]);
    expect(ids.get(nodeTreeKey(machine))).toEqual([2, 3]);
    expect(ids.get(nodeTreeKey(sfc))).toEqual([2, 3]);
    expect(ids.get(nodeTreeKey(empty))).toEqual([1]);
    expect(ids.get(group)).toEqual([1, 2, 3]);
    // 下面没有二级 Tab 的节点不出现（勾选框禁用）
    expect(
      ids.has(
        nodeTreeKey({ category: '空分类', configuration: null, item: null }),
      ),
    ).toBe(false);

    const sorted = (state: { checked: string[]; halfChecked: string[] }) => ({
      checked: [...state.checked].sort(),
      halfChecked: [...state.halfChecked].sort(),
    });
    expect(sorted(treeCheckState(ids, new Set([2])))).toEqual({
      checked: [],
      halfChecked: [nodeTreeKey(machine), nodeTreeKey(sfc), group].sort(),
    });
    expect(sorted(treeCheckState(ids, new Set([2, 3])))).toEqual({
      checked: [nodeTreeKey(machine), nodeTreeKey(sfc)].sort(),
      halfChecked: [group],
    });
  });
});
