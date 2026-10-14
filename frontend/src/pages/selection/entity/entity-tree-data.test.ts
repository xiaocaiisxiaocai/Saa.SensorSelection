import { describe, expect, it } from 'vitest';

import type { EntityGroup } from '@/domain';

import {
  ancestorKeys,
  branchKeys,
  buildEntityTree,
  dropMove,
  configurationKey,
  findItemKey,
  groupKey,
  type EntityNode,
} from './entity-tree-data';

const groups = [
  {
    name: '庆鼎',
    items: ['华东', '华南'],
    configurations: [],
  },
  {
    name: '分类A',
    items: ['机型1'],
    configurations: [{ name: '配置X', items: ['机型2', '机型3'] }],
  },
] as unknown as EntityGroup[];

const titles = (nodes: EntityNode[]): string[] =>
  nodes.flatMap((node) => [node.title, ...titles(node.children ?? [])]);

describe('entity-tree-data', () => {
  it('finds the branches to expand for a selected node', () => {
    const tree = buildEntityTree(groups, '');
    const leaf = findItemKey(tree, '机型3') ?? '';
    expect(ancestorKeys(tree, leaf)).toEqual([
      groupKey('分类A'),
      configurationKey('分类A', '配置X'),
    ]);
    expect(ancestorKeys(tree, findItemKey(tree, '机型1') ?? '')).toEqual([
      groupKey('分类A'),
    ]);
    expect(ancestorKeys(tree, groupKey('庆鼎'))).toEqual([]);
    expect(ancestorKeys(tree, '不存在')).toEqual([]);
  });

  it('counts leaves including those under configurations', () => {
    const tree = buildEntityTree(groups, '');
    expect(tree.map((node) => node.count)).toEqual([2, 3]);
    expect(branchKeys(tree)).toHaveLength(3);
  });

  it('keeps a whole branch when its name matches, otherwise only matching leaves', () => {
    expect(titles(buildEntityTree(groups, '配置x'))).toEqual([
      '分类A',
      '配置X',
      '机型2',
      '机型3',
    ]);
    expect(titles(buildEntityTree(groups, '华南'))).toEqual(['庆鼎', '华南']);
    expect(buildEntityTree(groups, '不存在')).toEqual([]);
  });

  it('finds the selected leaf key by name', () => {
    const tree = buildEntityTree(groups, '');
    // 分类A 下先是直属机型「机型1」，再是「配置X」
    expect(findItemKey(tree, '机型3')).toBe(
      tree[1]?.children?.[1]?.children?.[1]?.key,
    );
  });

  it('lists the direct machines of a category before its configurations', () => {
    const tree = buildEntityTree(groups, '');
    expect(tree[1]?.children?.map((node) => node.title)).toEqual([
      '机型1',
      '配置X',
    ]);
  });

  it('turns a drop before / after a sibling into an index move', () => {
    const tree = buildEntityTree(groups, '');
    const [first, second] = tree as [EntityNode, EntityNode];
    // 把第一个分组拖到第二个分组之后（pos 0-1，dropPosition 2）
    expect(dropMove(groups, first, second, '0-1', 2)).toEqual({
      oldIndex: 0,
      newIndex: 1,
    });
    // 拖到自己原来的位置不算移动
    expect(dropMove(groups, first, second, '0-1', 0)).toBeNull();
    // 不同层级之间不能拖
    const leaf = first.children![0]!;
    expect(dropMove(groups, leaf, second, '0-1', 2)).toBeNull();
  });
});
