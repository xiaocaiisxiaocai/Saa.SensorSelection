import { describe, expect, it } from 'vitest';

import type { EntityGroup } from '@/domain';

import {
  machineCatalogFromQuery,
  resolveMachineSelection,
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
});
