import { describe, expect, it } from 'vitest';

import { STORAGE_KEY } from './keys';
import { createSelectionRepository } from './repository';
import { CRUD_DEFAULTS, SENSOR_DATA } from './seed';
import type { StorageLike } from './types';

function createMemory(): { storage: StorageLike; reads: string[] } {
  let value: null | string = null;
  const reads: string[] = [];
  return {
    reads,
    storage: {
      getItem: (key) => {
        reads.push(key);
        return value;
      },
      setItem: (_key, nextValue) => {
        value = nextValue;
      },
    },
  };
}

function createRepo(storage?: StorageLike) {
  const memory = storage ? null : createMemory();
  return createSelectionRepository({
    crudDefaults: CRUD_DEFAULTS,
    sensorData: SENSOR_DATA,
    storage: storage ?? memory?.storage,
  });
}

describe('createSelectionRepository persist', () => {
  it('rolls memory back when setItem returns false', () => {
    const repo = createRepo({
      getItem: () => null,
      setItem: () => false,
    });
    const result = repo.saveProcessStep({ name: '唯一工艺-回滚', layer: '内层' });
    expect(result).toEqual({ ok: false, reason: 'storage' });
    expect(
      repo.getProcessSteps().some((item) => item.name === '唯一工艺-回滚'),
    ).toBe(false);
  });

  it('rolls memory back when setItem throws', () => {
    const repo = createRepo({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    const result = repo.saveSensor({
      model: 'THROW-ROLLBACK',
      sensorType: '漫反射',
      status: '现用',
    });
    expect(result).toEqual({ ok: false, reason: 'storage' });
    expect(repo.getSensors().some((item) => item.model === 'THROW-ROLLBACK')).toBe(
      false,
    );
  });

  it('starts from an empty store when getItem throws', () => {
    const repo = createRepo({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    });
    expect(repo.snapshotStore()['customer-req:庆鼎']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: '进板前确认板件到位后再启动输送' }),
      ]),
    );
    expect(repo.snapshotStore()['customer-req:健鼎']).toBeUndefined();
  });
});

describe('entity-scoped business data', () => {
  it('seeds only the configured customers and keeps other customers empty', () => {
    const repo = createRepo();

    expect(repo.getCrud('customer-req', '庆鼎')).toHaveLength(2);
    expect(repo.getCrud('customer-proc', '庆鼎')).toHaveLength(1);
    expect(repo.getCrud('customer-feedback', '庆鼎')).toHaveLength(1);
    expect(repo.getCrud('customer-req', '景旺')).toHaveLength(2);
    expect(repo.getCrud('customer-proc', '景旺')).toHaveLength(1);
    expect(repo.getCrud('customer-feedback', '景旺')).toEqual([]);
    expect(repo.getCrud('customer-req', '健鼎')).toEqual([]);
    expect(repo.getCrud('customer-proc', '健鼎')).toEqual([]);
    expect(repo.getCrud('customer-feedback', '健鼎')).toEqual([]);
    expect(repo.getControlledDocuments('庆鼎')).toEqual([]);
    expect(repo.getControlledDocuments('景旺')).toEqual([]);
  });

  it('keeps old countermeasures when feedback is updated', () => {
    const { storage } = createMemory();
    const repo = createRepo(storage);
    const original = repo.getCrud('customer-feedback', '庆鼎')[0];
    expect(original).toBeDefined();

    const changed = repo.saveCrud(
      'customer-feedback',
      '庆鼎',
      {
        ...original,
        measure: '更换新型真空表头并重新验证参数。',
        date: '2026-08-25',
      },
      original?.id,
    );

    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect('measureHistory' in changed.item).toBe(true);
    if (!('measureHistory' in changed.item)) return;
    expect(changed.item).toMatchObject({
      date: '2026-08-25',
      measure: '更换新型真空表头并重新验证参数。',
    });
    expect(changed.item.measureHistory).toEqual([
      {
        date: '2024-10-15',
        measure: '更换快速响应型真空表头后恢复稳定。',
        status: '已作废',
      },
      {
        date: '2026-08-25',
        measure: '更换新型真空表头并重新验证参数。',
        status: '现行',
      },
    ]);

    const statusOnly = repo.saveCrud(
      'customer-feedback',
      '庆鼎',
      { ...changed.item, status: '处理中' },
      changed.item.id,
    );
    expect(statusOnly.ok).toBe(true);
    if (!statusOnly.ok) return;
    expect('measureHistory' in statusOnly.item).toBe(true);
    if (!('measureHistory' in statusOnly.item)) return;
    expect(statusOnly.item.measureHistory).toHaveLength(2);

    const reloaded = createRepo(storage);
    const persisted = reloaded.getCrud('customer-feedback', '庆鼎')[0];
    expect(persisted && 'measureHistory' in persisted).toBe(true);
    if (!persisted || !('measureHistory' in persisted)) return;
    expect(persisted.measureHistory).toEqual(statusOnly.item.measureHistory);
    expect(persisted).toMatchObject({
      date: '2026-08-25',
      measure: '更换新型真空表头并重新验证参数。',
    });
  });

  it('does not create demo rows for missing legacy process or machine data', () => {
    const repo = createRepo();

    expect(repo.getCrud('process-feat', 'DES显影')).toEqual([]);
    expect(repo.getCrud('process-sensor', 'DES显影')).toEqual([]);
    expect(repo.getMachineSectionRows(1, '标准输送段')).toEqual([]);
    expect(repo.getMachineSectionRows(2, '标准输送段')).toEqual([]);
    expect(repo.getMachineSectionRows(3, '标准输送段')).toEqual([]);
  });

  it('preserves persisted records without leaking them to another customer', () => {
    const { storage } = createMemory();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        'customer-req:庆鼎': [
          {
            id: 7,
            type: '特殊要求',
            machine: '专用机',
            process: '压合',
            content: '庆鼎专属要求',
            source: '客户要求',
            note: '保留真实数据',
          },
        ],
      }),
    );
    const repo = createRepo(storage);

    expect(repo.getCrud('customer-req', '庆鼎')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 7, content: '庆鼎专属要求' }),
      ]),
    );
    expect(repo.getCrud('customer-req', '景旺')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 1, content: '中段与末端均需设置掉板检测' }),
      ]),
    );
  });

  it('removes exact legacy demo rows while preserving customer-specific records', () => {
    const { storage } = createMemory();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        'meta:seed-version': [{ version: 1 }],
        'customer-req:庆鼎': [
          {
            id: 1,
            type: '输送段',
            machine: 'ALL',
            process: '',
            content: '板件有无检测，检测距离不大于 300mm',
            source: '验收规范',
            note: 'OMRON E3Z-D61 或同等级',
          },
          {
            id: 2,
            type: '掉板检测',
            machine: 'ALL',
            process: '',
            content: '传送路径中段与末端双重设置',
            source: '客户要求',
            note: '零容忍掉板要求',
          },
          {
            id: 9,
            type: '特殊要求',
            machine: '专用机',
            process: '压合',
            content: '庆鼎专属要求',
            source: '客户要求',
            note: '必须保留',
          },
        ],
      }),
    );

    const repo = createRepo(storage);

    expect(repo.getCrud('customer-req', '庆鼎')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 9, content: '庆鼎专属要求' }),
      ]),
    );
  });
});

describe('sensors', () => {
  it('rejects duplicate models using zh-CN case folding', () => {
    const repo = createRepo();
    const sensors = repo.getSensors();
    // 只断言种子数据已加载，避免因新增种子而破坏测试
    expect(sensors.length).toBeGreaterThan(0);
    const duplicate = repo.saveSensor({
      ...sensors[0],
      id: undefined,
      model: sensors[0]?.model.toLowerCase(),
    });
    expect(duplicate).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('replaces 备选 with 现用 and rewrites machine row sensor ids', () => {
    const repo = createRepo();
    const current = repo
      .getSensors()
      .find((item) => item.status === '现用' && item.sensorType === '漫反射');
    const alternate = repo
      .getSensors()
      .find((item) => item.status === '备选' && item.sensorType === '漫反射');
    if (!current || !alternate) throw new Error('seed sensors missing');

    const row = repo.saveMachineSectionRow(1, '中间翻板机', {
      role: '进板检测',
      sensorIds: [current.id],
    });
    if (!row.ok) throw new Error(row.reason);

    expect(repo.replaceSensorCurrent(alternate.id, current.id, '   ')).toEqual({
      ok: false,
      reason: 'validation',
    });

    const replaced = repo.replaceSensorCurrent(
      alternate.id,
      current.id,
      '检测不稳定',
    );
    if (!replaced.ok) throw new Error(replaced.reason);
    expect(replaced.item.status).toBe('现用');
    expect(replaced.item.replacesId).toBe(current.id);
    expect(repo.getSensors().find((item) => item.id === current.id)).toMatchObject({
      status: '停用',
      replacedById: alternate.id,
      problemNote: '检测不稳定',
    });
    expect(repo.getMachineSectionRows(1, '中间翻板机')[0]?.sensorIds).toEqual([
      alternate.id,
    ]);
  });

  it('rewrites sensor references in every persisted machine structure row', () => {
    const repo = createRepo();
    const current = repo
      .getSensors()
      .find((item) => item.status === '现用' && item.sensorType === '漫反射');
    const alternate = repo
      .getSensors()
      .find((item) => item.status === '备选' && item.sensorType === '漫反射');
    if (!current || !alternate) throw new Error('seed sensors missing');

    const rows = repo.getMachineSectionRows(999, '中间翻板机');
    rows.push({
      id: 1,
      role: '历史结构行',
      sensorIds: [current.id],
      sensorType: current.sensorType,
      spec: current.spec,
      purpose: '',
      name: '',
      desc: '',
      note: '',
    });

    const replaced = repo.replaceSensorCurrent(
      alternate.id,
      current.id,
      '历史型号停产',
    );
    if (!replaced.ok) throw new Error(replaced.reason);

    expect(repo.getMachineSectionRows(999, '中间翻板机')[0]?.sensorIds).toEqual([
      alternate.id,
    ]);
  });

  it('removes sensorIds references from machine section rows when sensor is deleted', () => {
    const repo = createRepo();
    const sensor = repo.getSensors().find((s) => s.status === '现用');
    if (!sensor) throw new Error('seed sensor missing');

    // 将该 Sensor 挂载到一个机型结构行
    const saved = repo.saveMachineSectionRow(1, '中间翻板机', {
      role: '到位检测',
      sensorIds: [sensor.id],
    });
    if (!saved.ok) throw new Error(saved.reason);
    expect(repo.getMachineSectionRows(1, '中间翻板机')[0]?.sensorIds).toContain(sensor.id);

    // 删除 Sensor 后，机型行引用应被级联清理
    const deleted = repo.deleteSensor(sensor.id);
    expect(deleted).toEqual({ ok: true });
    const rowsAfter = repo.getMachineSectionRows(1, '中间翻板机');
    expect(rowsAfter.every((r) => !r.sensorIds.includes(sensor.id))).toBe(true);
  });
});

describe('entity tree and dictionary', () => {
  it('blocks deleting a group that still has items', () => {
    const repo = createRepo();
    expect(repo.deleteEntityGroup('customer', '华东')).toEqual({
      ok: false,
      reason: 'not-empty',
    });
  });

  it('keeps at least one dictionary item', () => {
    const repo = createRepo();
    const items = repo.getDictionaryItems('process-layer');
    expect(items.length).toBeGreaterThan(1);
    const keep = items[0];
    if (!keep) throw new Error('missing dict');
    for (const item of items.slice(1)) {
      const deleted = repo.deleteDictionaryItem('process-layer', item.id);
      if (!deleted.ok) throw new Error(deleted.reason);
    }
    expect(repo.deleteDictionaryItem('process-layer', keep.id)).toEqual({
      ok: false,
      reason: 'validation',
    });
  });
});

describe('machine sections', () => {
  it('refuses to delete the locked notes tab', () => {
    const repo = createRepo();
    const notes = repo
      .getGlobalMachineSections()
      .find((item) => item.kind === 'notes');
    if (!notes) throw new Error('notes tab missing');
    expect(repo.deleteGlobalMachineSection(notes.id)).toEqual({
      ok: false,
      reason: 'validation',
    });
  });

  it('assigns extra tab ids from 1001', () => {
    const repo = createRepo();
    const saved = repo.saveExtraMachineSection('中间翻板机', { name: '本机附加' });
    if (!saved.ok) throw new Error(saved.reason);
    expect(saved.item.id).toBe(1001);
    expect(saved.item.scope).toBe('machine');
  });

  it('persists mistaken general-structure names back to seed names', () => {
    const { storage } = createMemory();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        'machine-global-sections:all': [
          {
            id: 1,
            name: '标准输送段',
            sort: 1,
            kind: 'structure',
            scope: 'global',
          },
        ],
      }),
    );
    const repo = createRepo(storage);
    expect(repo.getGlobalMachineSections().find((item) => item.id === 1)?.name).toBe(
      '输送机构',
    );
    const persisted = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    expect(
      persisted['machine-global-sections:all'].find((item: { id: number }) => item.id === 1)
        .name,
    ).toBe('输送机构');
  });
});

describe('controlled documents', () => {
  it('stores files under customer-sop and rejects non pdf/word', () => {
    const { storage } = createMemory();
    const repo = createRepo(storage);
    expect(
      repo.saveControlledFile('庆鼎', {
        fileName: 'a.txt',
        mimeType: 'text/plain',
        dataUrl: 'data:text/plain;base64,YQ==',
        size: 1,
        uploadedAt: '2024-01-01',
      }),
    ).toEqual({ ok: false, reason: 'type' });

    const saved = repo.saveControlledFile('庆鼎', {
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,YQ==',
      size: 12,
      uploadedAt: '2024-01-01',
    });
    if (!saved.ok) throw new Error(saved.reason);
    expect(repo.getControlledDocuments('庆鼎')[0]?.kind).toBe('pdf');
    expect(repo.getControlledDocuments('景旺')).toEqual([]);
    expect(JSON.parse(storage.getItem(STORAGE_KEY) || '{}')['customer-sop:庆鼎']).toEqual(
      [saved.item],
    );
  });

  it('stores process intro files under process-intro:all', () => {
    const { storage } = createMemory();
    const repo = createRepo(storage);
    expect(
      repo.saveProcessIntroFile({
        fileName: 'a.txt',
        mimeType: 'text/plain',
        dataUrl: 'data:text/plain;base64,YQ==',
        size: 1,
        uploadedAt: '2024-01-01',
      }),
    ).toEqual({ ok: false, reason: 'type' });

    const saved = repo.saveProcessIntroFile({
      fileName: '工艺规范.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,YQ==',
      size: 12,
      uploadedAt: '2024-01-01',
    });
    if (!saved.ok) throw new Error(saved.reason);
    expect(repo.getProcessIntroFiles()[0]?.fileName).toBe('工艺规范.pdf');
    expect(JSON.parse(storage.getItem(STORAGE_KEY) || '{}')['process-intro:all']).toEqual(
      [saved.item],
    );

    expect(repo.deleteProcessIntroFile(saved.item.id)).toEqual({ ok: true });
    expect(repo.getProcessIntroFiles()).toEqual([]);
  });
});
