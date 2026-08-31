import { describe, expect, it } from 'vitest';

import { STORAGE_KEY, keyFor } from './keys';
import { createSelectionRepository } from './repository';
import { CRUD_DEFAULTS, FEEDBACK_STATUS_OPTIONS, SENSOR_DATA } from './seed';
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
      { ...changed.item, status: FEEDBACK_STATUS_OPTIONS[1] },
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
      processStepId: null,
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
    const sensor = repo.getSensors().find((s) => s.status === '现用');
    if (!sensor) throw new Error('seed sensor missing');

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

  it('persists a project catalog classification when its category is renamed', () => {
    const repo = createRepo();
    expect(
      repo.saveEntityGroup('machine', {
        name: '客户专机',
        machineType: 'project',
      }),
    ).toEqual(expect.objectContaining({ ok: true }));
    expect(
      repo.saveEntityGroup(
        'machine',
        { name: '客户专机（新版）' },
        '客户专机',
      ),
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

    const linked = repo.saveMachineSectionRow(
      structure.item.id,
      machineName,
      {
        role: '进板检测',
        sensorIds: [sensor.id],
        processStepId: processStep.id,
      },
    );
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

  it('keeps legacy machine content in the default process and isolates custom processes', () => {
    const repo = createRepo();
    const machineName = '01 单段输送段（搭配）';
    const sensor = repo.getSensors()[0];

    expect(repo.getMachineProcesses()).toEqual([
      { id: 1, name: '制程1', sort: 1, locked: true },
    ]);
    const second = repo.saveMachineProcess({ name: '制程2', sort: 2 });
    if (!second.ok || !sensor) throw new Error('process fixture failed');

    const firstSection = repo.saveExtraMachineSection(machineName, {
      kind: 'structure',
      name: '默认制程内容',
      sort: 1,
    });
    const secondSection = repo.saveExtraMachineSection(
      machineName,
      { kind: 'structure', name: '第二制程内容', sort: 1 },
      undefined,
      second.item.id,
    );
    if (!firstSection.ok || !secondSection.ok) {
      throw new Error('machine section fixture failed');
    }

    expect(repo.listResolvedMachineSections(machineName)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '默认制程内容' })]),
    );
    expect(repo.listResolvedMachineSections(machineName, second.item.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '第二制程内容' })]),
    );
    expect(repo.listResolvedMachineSections(machineName, second.item.id)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '默认制程内容' })]),
    );

    expect(
      repo.saveMachineSectionRow(firstSection.item.id, machineName, {
        role: '默认制程检测',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    expect(
      repo.saveMachineSectionRow(
        secondSection.item.id,
        machineName,
        { role: '第二制程检测', sensorIds: [sensor.id] },
        undefined,
        second.item.id,
      ).ok,
    ).toBe(true);

    expect(repo.getMachineSectionRows(firstSection.item.id, machineName)[0]?.role).toBe(
      '默认制程检测',
    );
    expect(
      repo.getMachineSectionRows(
        secondSection.item.id,
        machineName,
        second.item.id,
      )[0]?.role,
    ).toBe('第二制程检测');
  });

  it('protects the default process and refuses to delete a custom process with tabs', () => {
    const repo = createRepo();
    const second = repo.saveMachineProcess({ name: '客户制程', sort: 2 });
    if (!second.ok) throw new Error(second.reason);
    expect(
      repo.saveExtraMachineSection(
        '01 单段输送段（搭配）',
        { kind: 'notes', name: '客户注意事项' },
        undefined,
        second.item.id,
      ).ok,
    ).toBe(true);

    expect(repo.deleteMachineProcess(1)).toEqual({
      ok: false,
      reason: 'validation',
    });
    expect(repo.deleteMachineProcess(second.item.id)).toEqual({
      ok: false,
      reason: 'not-empty',
    });
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
    expect(repo.saveMachineSectionImages(section.item.id, machineName, [image])).toEqual({
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
    expect(repo.saveMachineSectionImages(section.item.id, machineName, [image])).toEqual(
      expect.objectContaining({ ok: true }),
    );
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
    expect(
      JSON.parse(storage.getItem(STORAGE_KEY) || '{}')['customer-sop:庆鼎'],
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
    expect(repo.saveControlledFile('庆鼎', pptx)).toEqual({
      ok: false,
      reason: 'type',
    });

    const reloaded = createRepo(storage);
    expect(reloaded.getProcessIntroFiles()).toEqual([
      expect.objectContaining({ fileName: '制程介绍.pptx', kind: 'ppt' }),
    ]);
  });
});
