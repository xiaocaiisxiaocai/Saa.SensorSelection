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

  it('resolves the tab and machine from ?tab=&item=', () => {
    const tabs: MachineTab[] = [
      {
        id: 1,
        catalog: 'mechanism',
        name: '输送',
        sort: 1,
        kind: 'structure',
        machines: ['单段'],
      },
      {
        id: 2,
        catalog: 'mechanism',
        name: '收板',
        sort: 2,
        kind: 'structure',
        machines: [],
      },
    ];
    const catalog = new Set(['单段', '双段']);
    // 机型在 Tab 里：显示它的 Tab，不管 ?tab= 写的是什么
    expect(
      resolveTabSelection(tabs, catalog, { tab: '2', item: '单段' }),
    ).toEqual({
      tab: tabs[0],
      machine: '单段',
      treeMachine: '',
    });
    // 机型还在目录树里
    expect(resolveTabSelection(tabs, catalog, { item: '双段' })).toEqual({
      tab: null,
      machine: '',
      treeMachine: '双段',
    });
    // 只给 Tab：选它的第一个机型；空 Tab 不选
    expect(resolveTabSelection(tabs, catalog, { tab: '2' })).toEqual({
      tab: tabs[1],
      machine: '',
      treeMachine: '',
    });
    // 什么都没给 / 机型已不存在：第一个 Tab
    expect(resolveTabSelection(tabs, catalog, { item: '已删除' }).tab).toBe(
      tabs[0],
    );
    expect(resolveTabSelection([], catalog, {}).tab).toBeNull();
  });
});
