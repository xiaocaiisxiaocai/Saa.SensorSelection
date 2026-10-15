import { describe, expect, it } from 'vitest';

import type { EntityGroup, MachineTab } from '@/domain';

import {
  machineCatalogFromQuery,
  resolveMachineSelection,
  resolveTabSelection,
} from './machine-selection';

const mechanism = {
  name: '01 输送',
  machineType: 'mechanism',
  items: ['单段'],
  configurations: [{ name: '配置A', items: ['双段'] }],
} as unknown as EntityGroup;
const project = {
  name: '专案X',
  machineType: 'project',
  items: ['CSZR-102'],
  configurations: [],
} as unknown as EntityGroup;

describe('machine-selection', () => {
  it('reads the catalog from ?catalog= or infers it from legacy links', () => {
    const groups = [mechanism, project];
    expect(machineCatalogFromQuery(groups, { catalog: 'project' })).toBe(
      'project',
    );
    expect(machineCatalogFromQuery(groups, { item: 'CSZR-102' })).toBe(
      'project',
    );
    expect(machineCatalogFromQuery(groups, {})).toBe('mechanism');
  });

  it('finds the requested machine, including one under a configuration', () => {
    expect(
      resolveMachineSelection([mechanism], {
        category: '01 输送',
        configuration: '配置A',
        item: '双段',
      }),
    ).toEqual({ category: '01 输送', configuration: '配置A', item: '双段' });
  });

  it('falls back to the first machine, or nothing for an empty catalog', () => {
    expect(resolveMachineSelection([mechanism], { item: '已删除' }).item).toBe(
      '单段',
    );
    expect(resolveMachineSelection([], {})).toEqual({
      category: '',
      configuration: '',
      item: '',
    });
  });

  it('resolves the tab and the page of the selected node from ?tab=&page=', () => {
    const leaf = { category: '01 输送', configuration: '配置A', item: '双段' };
    const other = { category: '01 输送', configuration: null, item: '单段' };
    const tabs: MachineTab[] = [
      {
        id: 1,
        catalog: 'mechanism',
        name: '输送',
        sort: 1,
        kind: 'structure',
        pages: [
          { id: 11, name: '入料（L-RACK）', node: leaf },
          { id: 12, name: '出料', node: leaf },
          { id: 13, name: '别的节点', node: other },
        ],
      },
      {
        id: 2,
        catalog: 'mechanism',
        name: '收板',
        sort: 2,
        kind: 'structure',
        pages: [{ id: 21, name: '入料（L-RACK）', node: leaf }],
      },
    ];
    expect(resolveTabSelection(tabs, leaf, { tab: '2', page: '21' })).toEqual({
      tab: tabs[1],
      page: tabs[1]!.pages[0],
    });
    // 页不属于这个 Tab / 这个节点：用该节点在这个 Tab 下的第一页
    expect(resolveTabSelection(tabs, leaf, { tab: '1', page: '13' }).page).toEqual(
      tabs[0]!.pages[0],
    );
    expect(resolveTabSelection(tabs, other, {}).page).toEqual(tabs[0]!.pages[2]);
    // 这个节点在收板下没有页
    expect(resolveTabSelection(tabs, other, { tab: '2' })).toEqual({
      tab: tabs[1],
      page: null,
    });
    expect(resolveTabSelection([], leaf, {})).toEqual({ tab: null, page: null });
  });
});
