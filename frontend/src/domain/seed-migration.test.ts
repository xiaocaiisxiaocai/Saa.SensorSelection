import { describe, expect, it } from 'vitest';

import {
  createSensorCatalogDefaults,
  normalizeCrudItems,
  normalizeMachineSectionRows,
} from './normalize';
import { migrateSelectionSeedStore } from './seed-migration';
import {
  INITIAL_CRUD_DATA,
  LEGACY_DEMO_CRUD_DEFAULTS,
  MACHINE_SECTION_LEGACY_MAP,
  SENSOR_DATA,
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
      'customer-req:庆鼎': [
        ...demoRows('customer-req', '庆鼎'),
        custom,
      ],
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
      'customer-req:庆鼎': [
        INITIAL_CRUD_DATA['customer-req:庆鼎'][0],
        custom,
      ],
    };

    const migrated = migrateSelectionSeedStore(source, 3, 4);

    expect(migrated.store['customer-req:庆鼎']).toEqual([
      INITIAL_CRUD_DATA['customer-req:庆鼎'][0],
      custom,
      INITIAL_CRUD_DATA['customer-req:庆鼎'][1],
    ]);
  });
});
