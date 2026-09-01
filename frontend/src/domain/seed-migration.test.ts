import { describe, expect, it } from 'vitest';

import {
  createSensorCatalogDefaults,
  normalizeCrudItems,
  normalizeMachineSectionRows,
} from './normalize';
import { migrateSelectionSeedStore } from './seed-migration';
import {
  FEEDBACK_STATUS_OPTIONS,
  INITIAL_CRUD_DATA,
  LEGACY_DEMO_CRUD_DEFAULTS,
  MACHINE_SECTION_LEGACY_MAP,
  SENSOR_DATA,
  MACHINE_GROUPS,
} from './seed';
import type { PersistedStore } from './types';

function demoRows(listId: string, entityName: string) {
  const rows = LEGACY_DEMO_CRUD_DEFAULTS[listId]?.(entityName) ?? [];
  if (!listId.startsWith('machine-')) {
    return normalizeCrudItems(listId, rows);
  }
  return normalizeMachineSectionRows(rows, {
    allowImage: listId !== 'machine-notes',
    sensorItems: createSensorCatalogDefaults(SENSOR_DATA),
  });
}

describe('migrateSelectionSeedStore', () => {
  it('removes every legacy entity demo list during the production migration', () => {
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 1 }],
    };

    for (const listId of Object.keys(LEGACY_DEMO_CRUD_DEFAULTS)) {
      const sectionId = MACHINE_SECTION_LEGACY_MAP[listId];
      const key = sectionId
        ? `machine-section-rows:${sectionId}:测试实体`
        : `${listId}:测试实体`;
      source[key] = demoRows(listId, '测试实体');
    }

    const migrated = migrateSelectionSeedStore(source, 1, 2);

    expect(migrated.changed).toBe(true);
    for (const [key, rows] of Object.entries(migrated.store)) {
      if (key === 'meta:seed-version') continue;
      expect(rows, key).toEqual([]);
    }
  });

  it('keeps custom rows and never reapplies cleanup after version 2', () => {
    const custom = {
      id: 99,
      type: '特殊要求',
      machine: '专用机',
      process: '压合',
      content: '真实客户资料',
      source: '客户要求',
      note: '',
    };
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 1 }],
      'customer-req:庆鼎': [...demoRows('customer-req', '庆鼎'), custom],
    };

    const migrated = migrateSelectionSeedStore(source, 1, 2);
    expect(migrated.store['customer-req:庆鼎']).toEqual([custom]);

    const versionTwo = migrateSelectionSeedStore(source, 2, 2);
    expect(versionTwo.changed).toBe(false);
    expect(versionTwo.store['customer-req:庆鼎']).toEqual(
      source['customer-req:庆鼎'],
    );
  });

  it('recognizes machine demo rows already normalized by version 1', () => {
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 1 }],
      'machine-section-rows:1:中间六轴机': [
        {
          id: 1,
          role: '进板检测',
          sensorIds: [1],
          sensorType: '漫反射',
          spec: '检测距离 0~300mm；12~24V DC；PNP/NPN；IP67',
          purpose: '安装于进板口',
          name: '',
          desc: '',
          note: '板件前缘到位信号',
        },
      ],
    };

    const migrated = migrateSelectionSeedStore(source, 1, 2);

    expect(migrated.store['machine-section-rows:1:中间六轴机']).toEqual([]);
  });

  it('adds limited initial customer data once without overwriting real rows', () => {
    const custom = {
      id: 88,
      type: '特殊要求',
      machine: '专用机',
      process: '压合',
      content: '用户已经维护的资料',
      source: '客户要求',
      note: '',
    };
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 2 }],
      'customer-req:庆鼎': [],
      'customer-req:健鼎': [custom],
    };

    const migrated = migrateSelectionSeedStore(source, 2, 3);

    expect(migrated.store['customer-req:庆鼎']).toEqual(
      INITIAL_CRUD_DATA['customer-req:庆鼎'],
    );
    expect(migrated.store['customer-req:健鼎']).toEqual([custom]);
    expect(migrated.store['customer-req:景旺']).toEqual(
      INITIAL_CRUD_DATA['customer-req:景旺'],
    );

    const rerun = migrateSelectionSeedStore(migrated.store, 3, 3);
    expect(rerun.changed).toBe(false);
  });

  it('appends the next initial rows without replacing existing customer data', () => {
    const custom = {
      id: 88,
      type: '特殊要求',
      machine: '专用机',
      process: '压合',
      content: '用户已经维护的资料',
      source: '客户要求',
      note: '',
    };
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 3 }],
      'customer-req:庆鼎': [INITIAL_CRUD_DATA['customer-req:庆鼎'][0], custom],
    };

    const migrated = migrateSelectionSeedStore(source, 3, 4);

    expect(migrated.store['customer-req:庆鼎']).toEqual([
      INITIAL_CRUD_DATA['customer-req:庆鼎'][0],
      custom,
      INITIAL_CRUD_DATA['customer-req:庆鼎'][1],
    ]);
  });

  it('inserts 测试中 as the third feedback status and moves 已解决 to fourth', () => {
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 4 }],
      'dict:customer-feedback-status': [
        { id: 1, name: '待处理', sort: 1 },
        { id: 2, name: '处理中', sort: 2 },
        { id: 3, name: '已解决', sort: 3 },
      ],
    };

    const migrated = migrateSelectionSeedStore(source, 4, 5);

    expect(migrated.changed).toBe(true);
    expect(migrated.store['dict:customer-feedback-status']).toEqual([
      { id: 1, name: '待处理', sort: 1 },
      { id: 2, name: '处理中', sort: 2 },
      { id: 4, name: '测试中', sort: 3 },
      { id: 3, name: '已解决', sort: 4 },
    ]);

    const rerun = migrateSelectionSeedStore(migrated.store, 5, 5);
    expect(rerun.changed).toBe(false);
    expect(rerun.store['dict:customer-feedback-status']).toEqual(
      migrated.store['dict:customer-feedback-status'],
    );
  });

  it('adds the 3D file catalog without changing existing sensor data', () => {
    const sensors = [{ id: 1, model: 'E3Z-D61', sopId: 9 }];
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 5 }],
      'sensor-catalog:all': sensors,
      'sensor-sop:all': [{ id: 9, title: '旧资料' }],
    };

    const migrated = migrateSelectionSeedStore(source, 5, 6);

    expect(migrated.changed).toBe(true);
    expect(migrated.store['sensor-3d:all']).toEqual([]);
    expect(migrated.store['sensor-catalog:all']).toEqual(sensors);
    expect(migrated.store['sensor-sop:all']).toEqual(source['sensor-sop:all']);
  });

  it('adds the machine hierarchy catalog without overwriting existing machines', () => {
    const existing = [{ name: '既有分类', items: ['已维护机型'] }];
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 6 }],
      'entity-groups:machine': existing,
    };

    const migrated = migrateSelectionSeedStore(source, 6, 7);

    expect(migrated.changed).toBe(true);
    expect(migrated.store['entity-groups:machine']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ...existing[0],
          machineType: 'mechanism',
        }),
      ]),
    );
    expect(migrated.store['entity-groups:machine']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '输送机构',
          configurations: expect.arrayContaining([
            expect.objectContaining({ name: '标准输送段配置' }),
          ]),
        }),
        expect.objectContaining({
          name: '专案机型',
          items: expect.arrayContaining(['CSL(U)R-802（插框机）']),
        }),
      ]),
    );
    expect(
      MACHINE_GROUPS.find((group) => group.name === '专案机型')?.configurations,
    ).toBeUndefined();
  });

  it('removes historical global machine-tab definitions without deleting row content', () => {
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 7 }],
      'dict:machine-section': [{ id: 1, name: '输送机构', sort: 1 }],
      'machine-global-sections:all': [
        {
          id: 1,
          name: '输送机构',
          sort: 1,
          kind: 'structure',
          scope: 'global',
        },
      ],
      'general-structure-labels:all': [{ id: 1, name: '输送机构' }],
      'machine-section-rows:1:既有机型': [{ id: 9, role: '真实资料' }],
    };

    const migrated = migrateSelectionSeedStore(source, 7, 8);

    expect(migrated.changed).toBe(true);
    expect(migrated.store['dict:machine-section']).toBeUndefined();
    expect(migrated.store['machine-global-sections:all']).toBeUndefined();
    expect(migrated.store['general-structure-labels:all']).toBeUndefined();
    expect(migrated.store['machine-section-rows:1:既有机型']).toEqual([
      { id: 9, role: '真实资料' },
    ]);
  });

  it('classifies legacy machine categories into mechanism and project catalogs', () => {
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 8 }],
      'entity-groups:machine': [
        { name: '输送机构', items: ['标准输送段'] },
        { name: '专案机型', items: ['CSL(U)R-802（插框机）'] },
      ],
    };

    const migrated = migrateSelectionSeedStore(source, 8, 9);

    expect(migrated.changed).toBe(true);
    expect(migrated.store['entity-groups:machine']).toEqual([
      {
        name: '输送机构',
        items: ['标准输送段'],
        machineType: 'mechanism',
      },
      {
        name: '专案机型',
        items: ['CSL(U)R-802（插框机）'],
        machineType: 'project',
      },
    ]);
  });

  it('keeps numbered feedback statuses and remaps historical synonyms once', () => {
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 9 }],
      'dict:customer-feedback-status': [
        { id: 5, name: '待处理', sort: 1 },
        { id: 6, name: '处理中', sort: 2 },
        { id: 7, name: '测试中', sort: 3 },
        { id: 8, name: '已解决', sort: 4 },
        { id: 1, name: '01 待处理', sort: 5 },
        { id: 2, name: '02 处理中', sort: 6 },
        { id: 3, name: '03 测试中', sort: 7 },
        { id: 4, name: '04 已解决', sort: 8 },
        { id: 9, name: '等待客户确认', sort: 9 },
      ],
      'customer-feedback:测试客户': [
        { id: 1, problem: 'A', status: '待处理' },
        { id: 2, problem: 'B', status: 'processing' },
        { id: 3, problem: 'C', status: '03 测试中' },
        { id: 4, problem: 'D', status: '已解决' },
        { id: 5, problem: 'E', status: '等待客户确认' },
      ],
    };

    const migrated = migrateSelectionSeedStore(source, 9, 10);

    expect(FEEDBACK_STATUS_OPTIONS).toEqual([
      '01 待处理',
      '02 处理中',
      '03 测试中',
      '04 已解决',
    ]);
    expect(migrated.changed).toBe(true);
    expect(migrated.store['dict:customer-feedback-status']).toEqual([
      { id: 1, name: '01 待处理', sort: 1 },
      { id: 2, name: '02 处理中', sort: 2 },
      { id: 3, name: '03 测试中', sort: 3 },
      { id: 4, name: '04 已解决', sort: 4 },
      { id: 9, name: '等待客户确认', sort: 5 },
    ]);
    expect(
      migrated.store['customer-feedback:测试客户']?.map(
        (item) => (item as { status?: unknown }).status,
      ),
    ).toEqual([
      '01 待处理',
      '02 处理中',
      '03 测试中',
      '04 已解决',
      '等待客户确认',
    ]);

    const rerun = migrateSelectionSeedStore(migrated.store, 10, 10);
    expect(rerun.changed).toBe(false);
    expect(rerun.store).toEqual(migrated.store);
  });

  it('numbers a legacy-only feedback dictionary while preserving its item ids', () => {
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 9 }],
      'dict:customer-feedback-status': [
        { id: 11, name: '待处理', sort: 1 },
        { id: 12, name: '处理中', sort: 2 },
        { id: 13, name: '测试中', sort: 3 },
        { id: 14, name: '已解决', sort: 4 },
      ],
    };

    const migrated = migrateSelectionSeedStore(source, 9, 10);

    expect(migrated.store['dict:customer-feedback-status']).toEqual([
      { id: 11, name: '01 待处理', sort: 1 },
      { id: 12, name: '02 处理中', sort: 2 },
      { id: 13, name: '03 测试中', sort: 3 },
      { id: 14, name: '04 已解决', sort: 4 },
    ]);
  });

  it('restores non-empty legacy machine content as machine-owned tabs', () => {
    const source: PersistedStore = {
      'meta:seed-version': [{ version: 10 }],
      'machine-section-rows:1:既有机型': [
        { id: 9, role: '真实资料', sensorType: '漫反射' },
      ],
      'machine-section-images:1:既有机型': [
        {
          dataUrl: 'data:image/png;base64,YQ==',
          fileName: 'legacy.png',
          mimeType: 'image/png',
          size: 1,
        },
      ],
      'machine-section-rows:2:空机型': [],
    };

    const migrated = migrateSelectionSeedStore(source, 10, 11);

    expect(migrated.changed).toBe(true);
    expect(migrated.store['machine-extra-sections:既有机型']).toEqual([
      {
        id: 1,
        name: '输送机构',
        sort: 1,
        kind: 'structure',
        scope: 'machine',
      },
    ]);
    expect(migrated.store['machine-section-rows:1:既有机型']).toEqual([
      { id: 9, role: '真实资料', sensorType: '漫反射' },
    ]);
    expect(migrated.store['machine-section-images:1:既有机型']).toHaveLength(1);
    expect(migrated.store['machine-extra-sections:空机型']).toBeUndefined();

    const rerun = migrateSelectionSeedStore(migrated.store, 11, 11);
    expect(rerun.changed).toBe(false);
    expect(rerun.store).toEqual(migrated.store);
  });
});
