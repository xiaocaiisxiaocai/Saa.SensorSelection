import { describe, expect, it } from 'vitest';

import type { EntityGroup, MachineTab } from '@/domain';

import {
  machineCatalogFromQuery,
  resolveMachineSelection,
  resolveTabSelection,
  tabOfPage,
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

  it('resolves the tab and page from ?tab=&page=, or a tree machine from ?item=', () => {
    const tabs: MachineTab[] = [
      {
        id: 1,
        catalog: 'mechanism',
        name: '输送',
        sort: 1,
        kind: 'structure',
        pages: [
          { id: 11, name: '入料（L-RACK）' },
          { id: 12, name: '出料' },
        ],
      },
      {
        id: 2,
        catalog: 'mechanism',
        name: '收板',
        sort: 2,
        kind: 'structure',
        pages: [{ id: 21, name: '入料（L-RACK）' }],
      },
      {
        id: 3,
        catalog: 'mechanism',
        name: '空',
        sort: 3,
        kind: 'notes',
        pages: [],
      },
    ];
    const catalog = new Set(['单段', '双段']);
    expect(resolveTabSelection(tabs, catalog, { tab: '2', page: '21' })).toEqual(
      { tab: tabs[1], page: tabs[1]!.pages[0], treeMachine: '' },
    );
    // 页不在这个 Tab 里：用这个 Tab 的第一页
    expect(
      resolveTabSelection(tabs, catalog, { tab: '1', page: '21' }).page,
    ).toEqual(tabs[0]!.pages[0]);
    // 目录里的机型看它自己的内容
    expect(resolveTabSelection(tabs, catalog, { item: '双段' })).toEqual({
      tab: null,
      page: null,
      treeMachine: '双段',
    });
    // 什么都没指定：第一个 Tab 的第一页；空 Tab 没有页
    expect(resolveTabSelection(tabs, catalog, {})).toEqual({
      tab: tabs[0],
      page: tabs[0]!.pages[0],
      treeMachine: '',
    });
    expect(resolveTabSelection(tabs, catalog, { tab: '3' })).toEqual({
      tab: tabs[2],
      page: null,
      treeMachine: '',
    });
    expect(resolveTabSelection([], catalog, {})).toEqual({
      tab: null,
      page: null,
      treeMachine: '',
    });
    expect(tabOfPage(tabs, 21)).toBe(tabs[1]);
    expect(tabOfPage(tabs, 99)).toBeNull();
  });
});
