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
    expect(repo.snapshotStore()).toEqual({});
  });
});

describe('sensors', () => {
  it('rejects duplicate models using zh-CN case folding', () => {
    const repo = createRepo();
    const sensors = repo.getSensors();
    expect(sensors).toHaveLength(13);
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
