import { describe, expect, it } from 'vitest';

import { STORAGE_KEY, keyFor, machineSectionRowsKey } from './keys';
import { createSelectionRepository } from './repository';
import {
  CRUD_DEFAULTS,
  FEEDBACK_STATUS_OPTIONS,
  MACHINE_TAB_PAGE_OWNER,
  SENSOR_DATA,
} from './seed';
import type { EntityGroup, StorageLike } from './types';

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
  it('records lifecycle dates automatically and preserves them on ordinary edits', () => {
    const repo = createRepo();
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const created = repo.saveSensor({
      model: 'AUTO-DATES',
      sensorType: '漫反射',
      status: '备选',
      enteredAt: '2000-01-01',
      usedAt: '2000-01-01',
    });
    expect(created.ok).toBe(true);
    const item = repo.getSensors().find((row) => row.model === 'AUTO-DATES')!;
    expect(item.enteredAt).toBe(date);
    expect(item.usedAt).toBe('');
    expect(repo.saveSensor({ ...item, status: '现用' }, item.id).ok).toBe(true);
    const current = repo.getSensors().find((row) => row.id === item.id)!;
    expect(current.usedAt).toBe(date);
    repo.saveSensor(
      { ...current, enteredAt: '2000-01-01', usedAt: '2000-01-01' },
      item.id,
    );
    const edited = repo.getSensors().find((row) => row.id === item.id)!;
    expect(edited.enteredAt).toBe(date);
    expect(edited.usedAt).toBe(date);
    const active = repo.saveSensor({
      model: 'AUTO-CURRENT',
      sensorType: '漫反射',
      status: '现用',
    });
    expect(active.ok).toBe(true);
    expect(
      repo.getSensors().find((row) => row.model === 'AUTO-CURRENT')?.usedAt,
    ).toBe(date);
  });

  it('does not create demo data when production mode disables frontend seeds', () => {
    const repo = createSelectionRepository({
      crudDefaults: CRUD_DEFAULTS,
      sensorData: SENSOR_DATA,
      demoData: false,
    });

    expect(repo.getEntityGroups('customer')).toEqual([]);
    expect(repo.getEntityGroups('machine')).toEqual([]);
    expect(repo.getProcessSteps()).toEqual([]);
    expect(repo.getSensors()).toEqual([]);
    expect(repo.getDictionaryItems('sensor-type')).toEqual([]);
  });

  it('rolls memory back when setItem returns false', () => {
    const repo = createRepo({
      getItem: () => null,
      setItem: () => false,
    });
    const result = repo.saveProcessStep({
      name: '唯一工艺-回滚',
      layer: '内层',
    });
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
    expect(
      repo.getSensors().some((item) => item.model === 'THROW-ROLLBACK'),
    ).toBe(false);
  });

  it('starts from an empty store when getItem throws', () => {
    const repo = createRepo({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    });
    expect(repo.snapshotStore()['customer-req:庆鼎/华东']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: '进板前确认板件到位后再启动输送' }),
      ]),
    );
    expect(repo.snapshotStore()['customer-req:健鼎/华东']).toBeUndefined();
  });
});

describe('entity-scoped business data', () => {
  it('seeds only the configured customers and keeps other customers empty', () => {
    const repo = createRepo();

    expect(repo.getCrud('customer-req', '庆鼎/华东')).toHaveLength(2);
    expect(repo.getCrud('customer-proc', '庆鼎/华东')).toHaveLength(1);
    expect(repo.getCrud('customer-feedback', '庆鼎/华东')).toHaveLength(1);
    expect(repo.getCrud('customer-req', '景旺/华东')).toHaveLength(2);
    expect(repo.getCrud('customer-proc', '景旺/华东')).toHaveLength(1);
    expect(repo.getCrud('customer-feedback', '景旺/华东')).toEqual([]);
    expect(repo.getCrud('customer-req', '健鼎/华东')).toEqual([]);
    expect(repo.getCrud('customer-proc', '健鼎/华东')).toEqual([]);
    expect(repo.getCrud('customer-feedback', '健鼎/华东')).toEqual([]);
    expect(repo.getControlledDocuments('庆鼎/华东')).toEqual([]);
    expect(repo.getControlledDocuments('景旺/华东')).toEqual([]);
  });

  it('keeps old countermeasures when feedback is updated', () => {
    const { storage } = createMemory();
    const repo = createRepo(storage);
    const original = repo.getCrud('customer-feedback', '庆鼎/华东')[0];
    expect(original).toBeDefined();

    const changed = repo.saveCrud(
      'customer-feedback',
      '庆鼎/华东',
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
      '庆鼎/华东',
      { ...changed.item, status: FEEDBACK_STATUS_OPTIONS[1] },
      changed.item.id,
    );
    expect(statusOnly.ok).toBe(true);
    if (!statusOnly.ok) return;
    expect('measureHistory' in statusOnly.item).toBe(true);
    if (!('measureHistory' in statusOnly.item)) return;
    expect(statusOnly.item.measureHistory).toHaveLength(2);

    const reloaded = createRepo(storage);
    const persisted = reloaded.getCrud('customer-feedback', '庆鼎/华东')[0];
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
        'customer-req:庆鼎/华东': [
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

    expect(repo.getCrud('customer-req', '庆鼎/华东')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 7, content: '庆鼎专属要求' }),
      ]),
    );
    expect(repo.getCrud('customer-req', '景旺/华东')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          content: '中段与末端均需设置掉板检测',
        }),
      ]),
    );
  });

  it('removes exact legacy demo rows while preserving customer-specific records', () => {
    const { storage } = createMemory();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        'meta:seed-version': [{ version: 1 }],
        'customer-req:庆鼎/华东': [
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

    expect(repo.getCrud('customer-req', '庆鼎/华东')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 9, content: '庆鼎专属要求' }),
      ]),
    );
  });
});

describe('sensors', () => {
  it('stores SOP PDFs independently from 资料 files', () => {
    const { storage } = createMemory();
    const repo = createRepo(storage);

    expect(
      repo.saveSensorSopFile({
        title: '错误格式',
        fileName: 'work-instruction.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        dataUrl: 'data:application/octet-stream;base64,YQ==',
        size: 12,
        uploadedAt: '2026-08-27',
      }),
    ).toEqual({ ok: false, reason: 'type' });

    const saved = repo.saveSensorSopFile({
      title: '感应器安装 SOP',
      fileName: 'sensor-sop.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,YQ==',
      size: 12,
      uploadedAt: '2026-08-27',
    });
    if (!saved.ok) throw new Error(saved.reason);

    expect(repo.getSensorSopFiles()).toEqual([saved.item]);
    expect(repo.getSensorSops()).toEqual([]);
    expect(
      JSON.parse(storage.getItem(STORAGE_KEY) || '{}')['sensor-sop-file:all'],
    ).toEqual([saved.item]);
    expect(repo.deleteSensorSopFile(saved.item.id)).toEqual({ ok: true });
  });

  it('stores 3D files, links them to sensors, and blocks deleting files in use', () => {
    const { storage } = createMemory();
    const repo = createRepo(storage);

    expect(
      repo.saveSensor3dFile({
        title: '错误格式',
        fileName: 'robot.step',
        mimeType: 'application/step',
        dataUrl: 'data:application/step;base64,YQ==',
        size: 12,
        uploadedAt: '2026-08-27',
      }),
    ).toEqual({ ok: false, reason: 'type' });

    const saved = repo.saveSensor3dFile({
      title: '六轴机模型',
      fileName: 'robot.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,YQ==',
      size: 12,
      uploadedAt: '2026-08-27',
    });
    if (!saved.ok) throw new Error(saved.reason);
    expect(repo.getSensor3dFiles()).toEqual([saved.item]);
    expect(
      JSON.parse(storage.getItem(STORAGE_KEY) || '{}')['sensor-3d:all'],
    ).toEqual([saved.item]);

    const sensor = repo.getSensors()[0];
    if (!sensor) throw new Error('seed sensor missing');
    const linked = repo.saveSensor(
      { ...sensor, model3dId: saved.item.id },
      sensor.id,
    );
    if (!linked.ok) throw new Error(linked.reason);
    expect(linked.item.model3dId).toBe(saved.item.id);
    expect(repo.deleteSensor3dFile(saved.item.id)).toEqual({
      ok: false,
      reason: 'in-use',
    });

    const unlinked = repo.saveSensor(
      { ...linked.item, model3dId: null },
      sensor.id,
    );
    if (!unlinked.ok) throw new Error(unlinked.reason);
    expect(repo.deleteSensor3dFile(saved.item.id)).toEqual({ ok: true });
  });

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
    expect(
      repo.getSensors().find((item) => item.id === current.id),
    ).toMatchObject({
      status: '停用',
      replacedById: alternate.id,
      problemNote: '检测不稳定',
    });
    expect(repo.getMachineSectionRows(1, '中间翻板机')[0]?.sensorIds).toEqual([
      alternate.id,
    ]);
  });

  it('inherits catalog and 3d links from the current model being replaced', () => {
    const repo = createRepo();
    const pdf = 'data:application/pdf;base64,JVBERi0xLjAK';
    const currentCatalog = repo.saveSensorSop({
      title: '现用型录',
      fileName: 'current-catalog.pdf',
      mimeType: 'application/pdf',
      dataUrl: pdf,
      size: 12,
      uploadedAt: '2026-09-18',
    });
    const currentModel = repo.saveSensor3dFile({
      title: '现用模型',
      fileName: 'current-model.pdf',
      mimeType: 'application/pdf',
      dataUrl: pdf,
      size: 12,
      uploadedAt: '2026-09-18',
    });
    const alternateCatalog = repo.saveSensorSop({
      title: '备选型录',
      fileName: 'alternate-catalog.pdf',
      mimeType: 'application/pdf',
      dataUrl: pdf,
      size: 12,
      uploadedAt: '2026-09-18',
    });
    const alternateModel = repo.saveSensor3dFile({
      title: '备选模型',
      fileName: 'alternate-model.pdf',
      mimeType: 'application/pdf',
      dataUrl: pdf,
      size: 12,
      uploadedAt: '2026-09-18',
    });
    if (
      !currentCatalog.ok ||
      !currentModel.ok ||
      !alternateCatalog.ok ||
      !alternateModel.ok
    ) {
      throw new Error('link files missing');
    }

    const diffuseCurrent = repo
      .getSensors()
      .find((item) => item.status === '现用' && item.sensorType === '漫反射');
    const diffuseAlternate = repo
      .getSensors()
      .find((item) => item.status === '备选' && item.sensorType === '漫反射');
    if (!diffuseCurrent || !diffuseAlternate) {
      throw new Error('diffuse sensors missing');
    }
    expect(
      repo.saveSensor(
        {
          ...diffuseCurrent,
          sopId: currentCatalog.item.id,
          model3dId: currentModel.item.id,
        },
        diffuseCurrent.id,
      ),
    ).toMatchObject({ ok: true });
    expect(
      repo.saveSensor(
        {
          ...diffuseAlternate,
          sopId: alternateCatalog.item.id,
          model3dId: alternateModel.item.id,
        },
        diffuseAlternate.id,
      ),
    ).toMatchObject({ ok: true });

    const inherited = repo.replaceSensorCurrent(
      diffuseAlternate.id,
      diffuseCurrent.id,
      '沿用型录和 3D',
    );
    if (!inherited.ok) throw new Error(inherited.reason);
    expect(inherited.item).toMatchObject({
      sopId: currentCatalog.item.id,
      model3dId: currentModel.item.id,
    });
    expect(
      repo.getSensors().find((item) => item.id === diffuseCurrent.id),
    ).toMatchObject({
      status: '停用',
      sopId: currentCatalog.item.id,
      model3dId: currentModel.item.id,
    });

    const beamCurrent = repo
      .getSensors()
      .find((item) => item.status === '现用' && item.sensorType === '对照式');
    const beamAlternate = repo
      .getSensors()
      .find((item) => item.status === '备选' && item.sensorType === '对照式');
    if (!beamCurrent || !beamAlternate) throw new Error('beam sensors missing');
    expect(
      repo.saveSensor(
        {
          ...beamAlternate,
          sopId: alternateCatalog.item.id,
          model3dId: alternateModel.item.id,
        },
        beamAlternate.id,
      ),
    ).toMatchObject({ ok: true });

    const kept = repo.replaceSensorCurrent(
      beamAlternate.id,
      beamCurrent.id,
      '保留备选自己的链接',
    );
    if (!kept.ok) throw new Error(kept.reason);
    expect(kept.item).toMatchObject({
      sopId: alternateCatalog.item.id,
      model3dId: alternateModel.item.id,
    });
    expect(
      repo.getSensors().find((item) => item.id === beamCurrent.id),
    ).toMatchObject({
      status: '停用',
      sopId: null,
      model3dId: null,
    });
  });

  it('replaces sensors when status dictionary labels include numeric prefixes', () => {
    const repo = createRepo();
    const renamedStatuses = [
      ['现用', '01 现用'],
      ['备选', '02 备选'],
      ['停用', '03 停用'],
    ] as const;

    for (const [previousName, nextName] of renamedStatuses) {
      const item = repo
        .getDictionaryItems('sensor-status')
        .find((entry) => entry.name === previousName);
      if (!item) throw new Error(`missing sensor status: ${previousName}`);
      expect(
        repo.saveDictionaryItem(
          'sensor-status',
          { name: nextName, sort: item.sort },
          item.id,
        ),
      ).toMatchObject({ ok: true });
    }

    expect(
      repo.getDictionaryItems('sensor-status').map((item) => item.name),
    ).toEqual(['01 现用', '02 备选', '03 停用']);

    const current = repo
      .getSensors()
      .find(
        (item) => item.status === '01 现用' && item.sensorType === '漫反射',
      );
    const alternate = repo
      .getSensors()
      .find(
        (item) => item.status === '02 备选' && item.sensorType === '漫反射',
      );
    if (!current || !alternate) throw new Error('renamed sensors missing');

    const replaced = repo.replaceSensorCurrent(
      alternate.id,
      current.id,
      '现用型号故障',
    );
    if (!replaced.ok) throw new Error(replaced.reason);

    expect(replaced.item.status).toBe('01 现用');
    expect(
      repo.getSensors().find((item) => item.id === current.id)?.status,
    ).toBe('03 停用');

    const snapshot = repo.snapshotStore();
    const statusKey = keyFor('dict', 'sensor-status');
    snapshot[statusKey]?.push({ id: 99, name: '停用', sort: 99 });
    let stored = JSON.stringify(snapshot);
    const reloaded = createRepo({
      getItem: (key) => (key === STORAGE_KEY ? stored : null),
      setItem: (_key, value) => {
        stored = value;
      },
    });
    expect(
      reloaded.getDictionaryItems('sensor-status').map((item) => item.name),
    ).toEqual(['01 现用', '02 备选', '03 停用']);
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
      machineModelId: null,
      processStepId: null,
      boardCharacteristicId: null,
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

    expect(repo.getMachineSectionRows(999, '中间翻板机')[0]?.sensorIds).toEqual(
      [alternate.id],
    );
  });

  it('removes sensorIds references from machine section rows when sensor is deleted', () => {
    const repo = createRepo();
    const sensor = repo.getSensors().find((item) => item.model === 'LV-H62');
    const guarded = repo.getSensors().find((item) => item.model === 'E3Z-D61');
    if (!sensor || !guarded) throw new Error('seed sensor missing');

    // 将该 Sensor 挂载到一个机型结构行
    const saved = repo.saveMachineSectionRow(1, '中间翻板机', {
      role: '到位检测',
      sensorIds: [sensor.id],
    });
    if (!saved.ok) throw new Error(saved.reason);
    expect(repo.getMachineSectionRows(1, '中间翻板机')[0]?.sensorIds).toContain(
      sensor.id,
    );

    // 删除 Sensor 后，机型行引用应被级联清理
    const deleted = repo.deleteSensor(sensor.id);
    expect(deleted).toEqual({ ok: true });
    const rowsAfter = repo.getMachineSectionRows(1, '中间翻板机');
    expect(rowsAfter.every((row) => !row.sensorIds.includes(sensor.id))).toBe(
      true,
    );

    const guardedRow = repo.saveMachineSectionRow(1, '中间翻板机', {
      role: '现用仍被备选占用',
      sensorIds: [guarded.id],
    });
    if (!guardedRow.ok) throw new Error(guardedRow.reason);
    expect(repo.deleteSensor(guarded.id)).toEqual({
      ok: false,
      reason: 'not-empty',
      message: '该现用型号下还有备选，请先用「替换」处理',
    });
    expect(
      repo
        .getMachineSectionRows(1, '中间翻板机')
        .some((row) => row.sensorIds.includes(guarded.id)),
    ).toBe(true);
    expect(repo.getSensors().some((item) => item.id === guarded.id)).toBe(true);
  });

  it('requires a current model before an alternate, and rejects a manual disabled status', () => {
    const repo = createRepo();
    const laser = repo.getSensors().find((item) => item.model === 'LV-H62');
    const diffuseAlternate = repo
      .getSensors()
      .find((item) => item.model === 'WL12-2B530');
    const ultrasonic = repo
      .getSensors()
      .find((item) => item.model === 'UM30-213113');
    if (!laser || !diffuseAlternate || !ultrasonic) {
      throw new Error('seed sensors missing');
    }

    const laserAlternate = repo.saveSensor({
      brand: 'TEST',
      model: 'LASER-ALT-OK',
      sensorType: '激光式',
      spec: '规格',
      status: '备选',
    });
    expect(laserAlternate).toMatchObject({ ok: true });
    if (!laserAlternate.ok) throw new Error(laserAlternate.reason);
    expect(repo.deleteSensor(laserAlternate.item.id)).toEqual({ ok: true });
    expect(repo.deleteSensor(laser.id)).toEqual({ ok: true });
    expect(
      repo.saveSensor({
        brand: 'TEST',
        model: 'LASER-ALT-BLOCKED',
        sensorType: '激光式',
        spec: '规格',
        status: '备选',
      }),
    ).toEqual({
      ok: false,
      reason: 'validation',
      message: '请先新增该类型的现用型号',
    });
    expect(
      repo.saveSensor(
        { ...diffuseAlternate, sensorType: '激光式' },
        diffuseAlternate.id,
      ),
    ).toEqual({
      ok: false,
      reason: 'validation',
      message: '请先新增该类型的现用型号',
    });
    expect(
      repo.saveSensor({
        brand: 'Keyence',
        model: 'LASER-CURRENT',
        sensorType: '激光式',
        spec: '规格',
        status: '现用',
      }),
    ).toMatchObject({ ok: true });
    expect(
      repo.saveSensor({
        brand: 'TEST',
        model: 'LASER-ALT-AGAIN',
        sensorType: '激光式',
        spec: '规格',
        status: '备选',
      }),
    ).toMatchObject({ ok: true });

    expect(
      repo.saveSensor({
        brand: 'TEST',
        model: 'MANUAL-OFF',
        replacedById: ultrasonic.id,
        sensorType: '超声波式',
        spec: '规格',
        status: '停用',
      }),
    ).toEqual({
      ok: false,
      reason: 'validation',
      message: '停用只能通过「替换」产生',
    });
    expect(
      repo.saveSensor({ ...ultrasonic, status: '停用' }, ultrasonic.id),
    ).toEqual({
      ok: false,
      reason: 'validation',
      message: '停用只能通过「替换」产生',
    });
  });

  it('blocks the last current while alternates remain, and allows another current of that type', () => {
    const repo = createRepo();
    const current = repo.getSensors().find((item) => item.model === 'E3Z-D61');
    const alternate = repo
      .getSensors()
      .find((item) => item.model === 'WL12-2B530');
    if (!current || !alternate) throw new Error('seed sensors missing');

    expect(
      repo.saveSensor({ ...current, brand: 'OMRON-EDIT' }, current.id),
    ).toMatchObject({
      ok: true,
      item: { brand: 'OMRON-EDIT', status: '现用' },
    });
    expect(repo.saveSensor({ ...current, status: '备选' }, current.id)).toEqual(
      {
        ok: false,
        reason: 'validation',
        message: '该现用型号下还有备选，请先用「替换」处理',
      },
    );
    expect(
      repo.saveSensor({ ...current, sensorType: '对照式' }, current.id),
    ).toEqual({
      ok: false,
      reason: 'validation',
      message: '该现用型号下还有备选，请先用「替换」处理',
    });

    const second = repo.saveSensor({
      brand: 'TEST',
      model: 'SECOND-CURRENT',
      sensorType: '漫反射',
      spec: '规格',
      status: '现用',
    });
    if (!second.ok) throw new Error(second.reason);
    expect(
      repo.saveSensor({ ...current, status: '备选' }, current.id),
    ).toMatchObject({ ok: true });
    const demoted = repo.getSensors().find((item) => item.id === current.id);
    if (!demoted) throw new Error('demoted sensor missing');
    expect(
      repo.saveSensor({ ...demoted, status: '现用' }, current.id),
    ).toMatchObject({ ok: true });
    expect(repo.deleteSensor(current.id)).toEqual({ ok: true });
    expect(repo.deleteSensor(second.item.id)).toEqual({
      ok: false,
      reason: 'not-empty',
      message: '该现用型号下还有备选，请先用「替换」处理',
    });
    expect(repo.getSensors().some((item) => item.id === second.item.id)).toBe(
      true,
    );

    const replaced = repo.replaceSensorCurrent(
      alternate.id,
      second.item.id,
      '改停用后仍可编辑',
    );
    if (!replaced.ok) throw new Error(replaced.reason);
    const retired = repo
      .getSensors()
      .find((item) => item.id === second.item.id);
    if (!retired) throw new Error('retired sensor missing');
    expect(
      repo.saveSensor(
        {
          ...retired,
          brand: 'RETIRED',
          sensorType: '激光式',
          spec: '停用后规格',
        },
        retired.id,
      ),
    ).toMatchObject({
      ok: true,
      item: {
        brand: 'RETIRED',
        sensorType: '激光式',
        spec: '停用后规格',
        status: '停用',
      },
    });
  });
});

describe('entity tree and dictionary', () => {
  it('blocks deleting a group that still has items', () => {
    const repo = createRepo();
    expect(repo.deleteEntityGroup('customer', '庆鼎')).toEqual({
      ok: false,
      reason: 'not-empty',
    });
  });

  it('stores ordered machine configurations and allows direct project models', () => {
    const repo = createRepo();
    expect(repo.saveEntityGroup('machine', { name: '测试分类' })).toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(
      repo.saveMachineConfiguration('测试分类', {
        name: '标准配置',
        sort: 1,
      }),
    ).toEqual(expect.objectContaining({ ok: true }));
    expect(
      repo.saveEntityItem('machine', {
        category: '测试分类',
        configuration: '标准配置',
        name: '02 多段',
        sort: 1,
      }),
    ).toEqual(expect.objectContaining({ ok: true }));
    expect(
      repo.saveEntityItem('machine', {
        category: '测试分类',
        configuration: '标准配置',
        name: '01 单段',
        sort: 1,
      }),
    ).toEqual(expect.objectContaining({ ok: true }));
    expect(
      repo.saveEntityItem('machine', {
        category: '测试分类',
        configuration: null,
        name: '直属专案机型',
        sort: 1,
      }),
    ).toEqual(expect.objectContaining({ ok: true }));

    const group = repo
      .getEntityGroups('machine')
      .find((item) => item.name === '测试分类');
    expect(group).toEqual({
      name: '测试分类',
      items: ['直属专案机型'],
      machineType: 'mechanism',
      configurations: [{ name: '标准配置', items: ['01 单段', '02 多段'] }],
    });
  });

  it('keeps conflicting legacy and direct machine pages reachable across writes', () => {
    const seed = createRepo().snapshotStore();
    const groups = seed[keyFor('entity-groups', 'machine')] as EntityGroup[];
    const group = groups.find((item) => item.configurations?.[0]?.items[0]);
    const configuration = group?.configurations?.[0];
    const machineName = configuration?.items[0];
    if (!group || !configuration || !machineName) {
      throw new Error('missing configured machine seed');
    }
    seed[keyFor('machine-tabs', 'all')] = [
      {
        id: 90,
        catalog: 'mechanism',
        name: '冲突迁移测试',
        sort: 1,
        kind: 'structure',
        pages: [
          {
            id: 910,
            name: machineName,
            node: {
              category: group.name,
              configuration: configuration.name,
              item: null,
            },
          },
          {
            id: 911,
            name: '冲突迁移测试',
            node: {
              category: group.name,
              configuration: configuration.name,
              item: machineName,
            },
            direct: true,
          },
        ],
      },
    ];
    seed[machineSectionRowsKey(910, MACHINE_TAB_PAGE_OWNER)] = [
      { id: 1, role: '旧页内容', sensorIds: [] },
    ];
    seed[machineSectionRowsKey(911, MACHINE_TAB_PAGE_OWNER)] = [
      { id: 2, role: '直属页内容', sensorIds: [] },
    ];

    let persisted = JSON.stringify(seed);
    const storage: StorageLike = {
      getItem: () => persisted,
      setItem: (_key, value) => {
        persisted = value;
      },
    };
    const open = () =>
      createSelectionRepository({
        crudDefaults: CRUD_DEFAULTS,
        sensorData: SENSOR_DATA,
        storage,
      });
    const repository = open();

    repository.getEntityGroups('machine');
    expect(repository.getMachineTabs()[0]?.pages).toMatchObject([
      { id: 910, node: { item: null } },
      { id: 911, direct: true, node: { item: machineName } },
    ]);
    expect(
      repository.getMachineSectionRows(910, MACHINE_TAB_PAGE_OWNER)[0]?.role,
    ).toBe('旧页内容');
    expect(
      repository.getMachineSectionRows(911, MACHINE_TAB_PAGE_OWNER)[0]?.role,
    ).toBe('直属页内容');

    expect(
      repository.saveMachineTab(
        'mechanism',
        { kind: 'structure', name: '冲突迁移测试', sort: 2 },
        90,
      ).ok,
    ).toBe(true);
    const reloaded = open();
    reloaded.getEntityGroups('machine');
    expect(reloaded.getMachineTabs()[0]?.pages.map((page) => page.id)).toEqual([
      910, 911,
    ]);
    expect(
      reloaded.getMachineSectionRows(910, MACHINE_TAB_PAGE_OWNER)[0]?.role,
    ).toBe('旧页内容');
    expect(
      reloaded.getMachineSectionRows(911, MACHINE_TAB_PAGE_OWNER)[0]?.role,
    ).toBe('直属页内容');
  });

  it('persists a project catalog classification when its category is renamed', () => {
    const repo = createRepo();
    expect(
      repo.saveEntityGroup('machine', {
        name: '客户专机',
        machineType: 'project',
      }),
    ).toEqual(expect.objectContaining({ ok: true }));
    expect(
      repo.saveEntityGroup('machine', { name: '客户专机（新版）' }, '客户专机'),
    ).toEqual(expect.objectContaining({ ok: true }));

    expect(
      repo
        .getEntityGroups('machine')
        .find((item) => item.name === '客户专机（新版）')?.machineType,
    ).toBe('project');
  });

  it('persists drag-style ordering for machine configurations and nested models', () => {
    const repo = createRepo();
    expect(repo.saveEntityGroup('machine', { name: '排序测试分类' })).toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(
      repo.saveMachineConfiguration('排序测试分类', { name: '配置甲' }),
    ).toEqual(expect.objectContaining({ ok: true }));
    expect(
      repo.saveMachineConfiguration('排序测试分类', { name: '配置乙' }),
    ).toEqual(expect.objectContaining({ ok: true }));
    expect(
      repo.saveEntityItem('machine', {
        category: '排序测试分类',
        configuration: '配置甲',
        name: '机型甲',
      }),
    ).toEqual(expect.objectContaining({ ok: true }));
    expect(
      repo.saveEntityItem('machine', {
        category: '排序测试分类',
        configuration: '配置甲',
        name: '机型乙',
      }),
    ).toEqual(expect.objectContaining({ ok: true }));

    expect(
      repo.saveMachineConfiguration(
        '排序测试分类',
        { name: '配置乙', sort: 1 },
        '配置乙',
      ),
    ).toEqual(expect.objectContaining({ ok: true }));
    expect(
      repo.reorderEntityItems('machine', '排序测试分类', 0, 1, '配置甲'),
    ).toEqual({ ok: true });

    const group = repo
      .getEntityGroups('machine')
      .find((item) => item.name === '排序测试分类');
    expect(group?.configurations?.map((item) => item.name)).toEqual([
      '配置乙',
      '配置甲',
    ]);
    expect(
      group?.configurations?.find((item) => item.name === '配置甲')?.items,
    ).toEqual(['机型乙', '机型甲']);
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
  it('persists dictionary-backed machine and board bindings and clears deleted references', () => {
    const { storage } = createMemory();
    const repo = createRepo(storage);
    const machineName = '01 单段输送段（搭配）';
    const sensor = repo.getSensors()[0];
    const machineModel = repo.getDictionaryItems('machine-model')[0];
    const boardCharacteristic = repo.getDictionaryItems(
      'board-characteristic',
    )[0];
    const structure = repo.saveExtraMachineSection(machineName, {
      kind: 'structure',
      name: '字典绑定测试',
      sort: 1,
    });
    if (!sensor || !machineModel || !boardCharacteristic || !structure.ok) {
      throw new Error('dictionary binding fixture failed');
    }

    const linked = repo.saveMachineSectionRow(structure.item.id, machineName, {
      role: '进板检测',
      sensorIds: [sensor.id],
      machineModelId: machineModel.id,
      boardCharacteristicId: boardCharacteristic.id,
    });
    expect(linked).toEqual(
      expect.objectContaining({
        ok: true,
        item: expect.objectContaining({
          machineModelId: machineModel.id,
          boardCharacteristicId: boardCharacteristic.id,
        }),
      }),
    );
    expect(
      repo.saveMachineSectionRow(structure.item.id, machineName, {
        role: '失效字典引用',
        sensorIds: [sensor.id],
        machineModelId: 999_999,
      }),
    ).toEqual({ ok: false, reason: 'stale' });

    const reloaded = createRepo(storage);
    expect(
      reloaded.getMachineSectionRows(structure.item.id, machineName)[0],
    ).toEqual(
      expect.objectContaining({
        machineModelId: machineModel.id,
        boardCharacteristicId: boardCharacteristic.id,
      }),
    );

    expect(
      reloaded.deleteDictionaryItem(
        'board-characteristic',
        boardCharacteristic.id,
      ),
    ).toEqual({ ok: true });
    expect(
      reloaded.getMachineSectionRows(structure.item.id, machineName)[0],
    ).toEqual(expect.objectContaining({ boardCharacteristicId: null }));
  });

  it('optionally persists process-step links for structure rows and clears them when the step is deleted', () => {
    const { storage } = createMemory();
    const repo = createRepo(storage);
    const machineName = '01 单段输送段（搭配）';
    const sensor = repo.getSensors()[0];
    const processStep = repo.getProcessSteps()[0];
    const structure = repo.saveExtraMachineSection(machineName, {
      kind: 'structure',
      name: '工艺绑定测试',
      sort: 1,
    });
    const notes = repo.saveExtraMachineSection(machineName, {
      kind: 'notes',
      name: '注意事项测试',
      sort: 2,
    });
    if (!sensor || !processStep || !structure.ok || !notes.ok) {
      throw new Error('process-step fixture failed');
    }

    const linked = repo.saveMachineSectionRow(structure.item.id, machineName, {
      role: '进板检测',
      sensorIds: [sensor.id],
      processStepId: processStep.id,
    });
    expect(linked).toEqual(
      expect.objectContaining({
        ok: true,
        item: expect.objectContaining({ processStepId: processStep.id }),
      }),
    );
    expect(
      repo.saveMachineSectionRow(structure.item.id, machineName, {
        role: '无效工艺',
        sensorIds: [sensor.id],
        processStepId: 999_999,
      }),
    ).toEqual({ ok: false, reason: 'stale' });

    const noteRow = repo.saveMachineSectionRow(notes.item.id, machineName, {
      role: '安装注意',
      name: '保持水平',
      processStepId: processStep.id,
    });
    expect(noteRow).toEqual(
      expect.objectContaining({
        ok: true,
        item: expect.objectContaining({ processStepId: null }),
      }),
    );

    const reloaded = createRepo(storage);
    expect(
      reloaded.getMachineSectionRows(structure.item.id, machineName)[0],
    ).toEqual(expect.objectContaining({ processStepId: processStep.id }));

    expect(reloaded.deleteProcessStep(processStep.id)).toEqual({ ok: true });
    expect(
      reloaded.getMachineSectionRows(structure.item.id, machineName)[0],
    ).toEqual(expect.objectContaining({ processStepId: null }));
  });

  it('shows legacy machine rows through restored machine-owned tabs', () => {
    const persisted = JSON.stringify({
      'meta:seed-version': [{ version: 10 }],
      'machine-section-rows:1:既有机型': [
        {
          id: 9,
          role: '真实结构资料',
          sensorType: '漫反射',
          sensorIds: [],
        },
      ],
    });
    const repo = createRepo({
      getItem: (key) => (key === STORAGE_KEY ? persisted : null),
      setItem: () => undefined,
    });

    expect(repo.listResolvedMachineSections('既有机型')).toEqual([
      expect.objectContaining({
        id: 1,
        name: '输送机构',
        kind: 'structure',
        scope: 'machine',
      }),
    ]);
    expect(repo.getMachineSectionRows(1, '既有机型')).toEqual([
      expect.objectContaining({ id: 9, role: '真实结构资料' }),
    ]);
  });

  it('starts without global tabs and lets each machine own both tab kinds', () => {
    const repo = createRepo();
    const machineA = '01 单段输送段（搭配）';
    const machineB = '02 多段输送段（搭配）';

    expect(repo.listResolvedMachineSections(machineA)).toEqual([]);

    const structure = repo.saveExtraMachineSection(machineA, {
      kind: 'structure',
      name: '输送机构',
      sort: 2,
    });
    const notes = repo.saveExtraMachineSection(machineA, {
      kind: 'notes',
      name: '调试注意事项',
      sort: 1,
    });

    expect(structure).toEqual(
      expect.objectContaining({
        ok: true,
        item: expect.objectContaining({ kind: 'structure', scope: 'machine' }),
      }),
    );
    expect(notes).toEqual(
      expect.objectContaining({
        ok: true,
        item: expect.objectContaining({ kind: 'notes', scope: 'machine' }),
      }),
    );
    expect(
      repo
        .listResolvedMachineSections(machineA)
        .map((item) => [item.name, item.kind]),
    ).toEqual([
      ['调试注意事项', 'notes'],
      ['输送机构', 'structure'],
    ]);
    expect(repo.listResolvedMachineSections(machineB)).toEqual([]);
  });

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
    const saved = repo.saveExtraMachineSection('中间翻板机', {
      name: '本机附加',
    });
    if (!saved.ok) throw new Error(saved.reason);
    expect(saved.item.id).toBe(1001);
    expect(saved.item.scope).toBe('machine');
  });

  it('rejects adding schematic images until the structure tab has content', () => {
    const repo = createRepo();
    const machineName = '01 单段输送段（搭配）';
    const section = repo.saveExtraMachineSection(machineName, {
      kind: 'structure',
      name: '示意图前置测试',
      sort: 1,
    });
    const sensor = repo.getSensors()[0];
    const image = {
      dataUrl: 'data:image/png;base64,YQ==',
      fileName: 'structure.png',
      mimeType: 'image/png',
      size: 1,
    };

    if (!section.ok) throw new Error(section.reason);
    expect(
      repo.saveMachineSectionImages(section.item.id, machineName, [image]),
    ).toEqual({
      ok: false,
      reason: 'validation',
    });
    if (!sensor) throw new Error('seed sensor missing');
    expect(
      repo.saveMachineSectionRow(section.item.id, machineName, {
        role: '到位检测',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    expect(
      repo.saveMachineSectionImages(section.item.id, machineName, [image]),
    ).toEqual(expect.objectContaining({ ok: true }));
  });
});

describe('controlled documents', () => {
  it('stores files under customer-sop and rejects non pdf/word', () => {
    const { storage } = createMemory();
    const repo = createRepo(storage);
    expect(
      repo.saveControlledFile('庆鼎/华东', {
        fileName: 'a.txt',
        mimeType: 'text/plain',
        dataUrl: 'data:text/plain;base64,YQ==',
        size: 1,
        uploadedAt: '2024-01-01',
      }),
    ).toEqual({ ok: false, reason: 'type' });

    const saved = repo.saveControlledFile('庆鼎/华东', {
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,YQ==',
      size: 12,
      uploadedAt: '2024-01-01',
    });
    if (!saved.ok) throw new Error(saved.reason);
    expect(repo.getControlledDocuments('庆鼎/华东')[0]?.kind).toBe('pdf');
    expect(repo.getControlledDocuments('景旺/华东')).toEqual([]);
    expect(
      JSON.parse(storage.getItem(STORAGE_KEY) || '{}')[
        'customer-sop:庆鼎/华东'
      ],
    ).toEqual([saved.item]);
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
    expect(
      JSON.parse(storage.getItem(STORAGE_KEY) || '{}')['process-intro:all'],
    ).toEqual([saved.item]);

    expect(repo.deleteProcessIntroFile(saved.item.id)).toEqual({ ok: true });
    expect(repo.getProcessIntroFiles()).toEqual([]);
  });

  it('stores PPT files for process intro without enabling them for customer documents', () => {
    const { storage } = createMemory();
    const repo = createRepo(storage);
    const pptx = {
      fileName: '制程介绍.pptx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      dataUrl:
        'data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,YQ==',
      size: 12,
      uploadedAt: '2024-01-01',
    };

    const saved = repo.saveProcessIntroFile(pptx);
    expect(saved.ok).toBe(true);
    expect(repo.getProcessIntroFiles()).toEqual([
      expect.objectContaining({ fileName: '制程介绍.pptx', kind: 'ppt' }),
    ]);
    expect(repo.saveControlledFile('庆鼎/华东', pptx)).toEqual({
      ok: false,
      reason: 'type',
    });

    const reloaded = createRepo(storage);
    expect(reloaded.getProcessIntroFiles()).toEqual([
      expect.objectContaining({ fileName: '制程介绍.pptx', kind: 'ppt' }),
    ]);
  });
});

describe('createSelectionRepository multi-step writes', () => {
  function countingStorage(failAfter = Infinity) {
    let value: null | string = null;
    let writes = 0;
    const storage: StorageLike = {
      getItem: () => value,
      setItem: (_key, nextValue) => {
        writes += 1;
        if (writes > failAfter) return false;
        value = nextValue;
        return true;
      },
    };
    return { storage, writes: () => writes };
  }

  it('saves a general-structure machine and its structure section in one write', () => {
    const memory = countingStorage();
    const repo = createRepo(memory.storage);
    expect(repo.saveEntityGroup('machine', { name: '通用结构' }).ok).toBe(true);
    const before = memory.writes();

    const result = repo.saveEntityItem('machine', {
      category: '通用结构',
      name: '翻板机',
    });

    expect(result.ok).toBe(true);
    expect(memory.writes() - before).toBe(1);
    expect(
      repo.getGlobalMachineSections().some((item) => item.name === '翻板机'),
    ).toBe(true);
  });

  it('rolls back every step when the combined write is rejected', () => {
    const memory = countingStorage();
    const repo = createRepo(memory.storage);
    repo.saveEntityGroup('machine', { name: '通用结构' });
    const failing = countingStorage(0);
    const failingRepo = createRepo({
      getItem: memory.storage.getItem,
      setItem: failing.storage.setItem,
    });

    const result = failingRepo.saveEntityItem('machine', {
      category: '通用结构',
      name: '翻板机',
    });

    expect(result).toEqual({ ok: false, reason: 'storage' });
    expect(
      failingRepo
        .getEntityGroups('machine')
        .find((group) => group.name === '通用结构')?.items,
    ).not.toContain('翻板机');
    expect(
      failingRepo
        .getGlobalMachineSections()
        .some((item) => item.name === '翻板机'),
    ).toBe(false);
  });
});

describe('createSelectionRepository batchRead', () => {
  it('reuses normalized catalogs inside a read batch only', () => {
    const repo = createRepo();
    expect(repo.getSensors()).not.toBe(repo.getSensors());
    repo.batchRead(() => {
      expect(repo.getSensors()).toBe(repo.getSensors());
      expect(repo.getDictionaryItems('sensor-type')).toBe(
        repo.getDictionaryItems('sensor-type'),
      );
    });
    expect(repo.getSensors()).not.toBe(repo.getSensors());
  });
});
