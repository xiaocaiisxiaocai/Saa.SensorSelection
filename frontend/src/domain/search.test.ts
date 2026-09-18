import { describe, expect, it } from 'vitest';

import { createSelectionRepository } from './repository';
import { MACHINE_DETAILS, CRUD_DEFAULTS, SENSOR_DATA } from './seed';
import { buildSearchIndex, searchItemDetail } from './search';

describe('buildSearchIndex', () => {
  it('orders sensors, processes, machines, hits, then customers', () => {
    const repo = createSelectionRepository({
      crudDefaults: CRUD_DEFAULTS,
      sensorData: SENSOR_DATA,
    });
    const index = buildSearchIndex({
      customerGroups: repo.getEntityGroups('customer'),
      machineDetails: MACHINE_DETAILS,
      machineGroups: repo.getEntityGroups('machine'),
      machineSectionHits: [
        {
          type: 'machine',
          title: '进板检测',
          category: '输送机构',
          sub: '中间翻板机',
          path: '/selection/machine',
          query: { item: '中间翻板机', section: '1' },
        },
      ],
      processSteps: repo.getProcessSteps(),
      sensors: repo.getSensors(),
    });

    const types = [...new Set(index.map((item) => item.type))];
    expect(types).toEqual(['sensor', 'process', 'machine', 'customer']);
    expect(index.some((item) => item.title.includes('E3Z-D61'))).toBe(true);
    expect(
      index.some((item) => item.title === '庆鼎' && item.category === '华东'),
    ).toBe(true);
    expect(
      index.some(
        (item) =>
          item.title === '01 单段输送段（搭配）' &&
          item.category === '输送机构',
      ),
    ).toBe(true);
    expect(
      index.some((item) => item.title === 'AOI检测' && item.category === '内层'),
    ).toBe(true);
    expect(index.some((item) => item.title === '进板检测' && item.query.section === '1')).toBe(
      true,
    );
  });
});

describe('searchItemDetail', () => {
  it('drops a leading segment that repeats the category line', () => {
    expect(
      searchItemDetail({ category: '输送机构', sub: '输送机构 · 客户特殊配置 · 机型结构' }),
    ).toBe('客户特殊配置 · 机型结构');
    expect(
      searchItemDetail({ category: '华东', sub: '华东区域 · PCB 制造客户' }),
    ).toBe('PCB 制造客户');
  });

  it('keeps details that do not start with the category', () => {
    expect(
      searchItemDetail({ category: '01 漫反射', sub: '01 现用 · 01 漫反射 · 12~24V' }),
    ).toBe('01 现用 · 01 漫反射 · 12~24V');
  });

  it('returns an empty string when the detail only repeats the category', () => {
    expect(searchItemDetail({ category: '内层', sub: '内层' })).toBe('');
  });
});
