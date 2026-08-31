import { describe, expect, it } from 'vitest';

import { STORAGE_KEY, keyFor, machineSectionImagesKey, machineSectionRowsKey } from './keys';
import {
  CONTROLLED_FILE_RULES,
  SENSOR_3D_FILE_RULES,
  createSensorCatalogDefaults,
  detectControlledFileKind,
  formatLocalDate,
  formatLocalDateTime,
  normalizeControlledDocuments,
  normalizeCrudItems,
  normalizeDictionaryItems,
  normalizeEntityGroups,
  normalizeMachineSectionImages,
  normalizeMachineRowImage,
  normalizeMachineSectionRows,
  normalizeMachineSections,
  normalizeProcessSteps,
  normalizeSensorItems,
  normalizeSensor3dFiles,
  parsePersistedStore,
  validateControlledUpload,
  validateMachineRowImage,
} from './normalize';
import { MACHINE_ROW_IMAGE_RULES, SENSOR_DATA, createDictionaryDefaults } from './seed';

describe('keys', () => {
  it('keeps the live localStorage key and list-id constructors', () => {
    expect(STORAGE_KEY).toBe('symtek_crud_store');
    expect(keyFor('customer-sop', '庆鼎')).toBe('customer-sop:庆鼎');
    expect(machineSectionRowsKey(1, '中间翻板机')).toBe(
      'machine-section-rows:1:中间翻板机',
    );
    expect(machineSectionImagesKey(2, '中间六轴机')).toBe(
      'machine-section-images:2:中间六轴机',
    );
  });
});

describe('parsePersistedStore', () => {
  it('drops prototype keys and non-array values', () => {
    const store = parsePersistedStore(
      '{"__proto__":[],"constructor":[],"prototype":[],"safe":[],"invalid":{}}',
    );
    expect(Object.getPrototypeOf(store)).toBe(null);
    expect(Object.hasOwn(store, '__proto__')).toBe(false);
    expect(Object.hasOwn(store, 'constructor')).toBe(false);
    expect(Object.hasOwn(store, 'prototype')).toBe(false);
    expect(store.safe).toEqual([]);
    expect(Object.hasOwn(store, 'invalid')).toBe(false);
  });

  it('returns an empty null-prototype store for unusable input', () => {
    for (const raw of [null, '', '{', '[]', '1', '{"a":1}']) {
      const store = parsePersistedStore(raw);
      expect(Object.getPrototypeOf(store)).toBe(null);
      expect(Object.keys(store)).toEqual([]);
    }
  });
});

describe('normalizeCrudItems', () => {
  it('reassigns bad ids and stringifies only primitive text fields', () => {
    const normalized = normalizeCrudItems('process-feat', [
      { id: -1, type: 7, name: '<img src=x>', desc: null, note: {} },
      { id: -1, type: '特性', name: '重复编号' },
    ]);
    expect(normalized).toHaveLength(2);
    expect(new Set(normalized.map((item) => item.id)).size).toBe(2);
    expect(
      normalized.every((item) => Number.isSafeInteger(item.id) && item.id > 0),
    ).toBe(true);
    const first = normalized[0];
    expect(first && 'type' in first ? first.type : undefined).toBe('7');
    expect(first && 'note' in first ? first.note : undefined).toBe('');
    expect(first && 'name' in first ? first.name : undefined).toBe('<img src=x>');
  });

  it('maps feedback status aliases and fills default type', () => {
    const [item] = normalizeCrudItems('customer-feedback', [
      {
        id: 1,
        status: 'pending',
        problem: '掉板',
        measure: '调整吸盘位置',
        date: '2026-08-20',
      },
    ]);
    expect(item && 'status' in item ? item.status : undefined).toBe(
      createDictionaryDefaults('customer-feedback-status')[0]?.name,
    );
    expect(item && 'type' in item ? item.type : undefined).toBe(
      createDictionaryDefaults('customer-feedback')[0]?.name,
    );
    expect(item && 'measureHistory' in item ? item.measureHistory : undefined).toEqual([
      {
        date: '2026-08-20',
        measure: '调整吸盘位置',
        status: '现行',
      },
    ]);
  });

  it('keeps only the latest feedback measure current without adding version metadata', () => {
    const [item] = normalizeCrudItems('customer-feedback', [
      {
        id: 1,
        status: 'resolved',
        problem: '吸板不稳',
        measure: '采用新型真空表头',
        date: '2026-08-22',
        measureHistory: [
          {
            measure: '调整真空参数',
            date: '2026-08-18',
            status: '已作废',
            version: 1,
            voidReason: '不再适用',
            operator: 'admin',
          },
          {
            measure: '采用新型真空表头',
            date: '2026-08-22',
            status: '现行',
            version: 2,
          },
        ],
      },
    ]);

    expect(item && 'measureHistory' in item ? item.measureHistory : undefined).toEqual([
      {
        date: '2026-08-18',
        measure: '调整真空参数',
        status: '已作废',
      },
      {
        date: '2026-08-22',
        measure: '采用新型真空表头',
        status: '现行',
      },
    ]);
  });

  it('derives the latest feedback fields from a history-only stored record', () => {
    const [item] = normalizeCrudItems('customer-feedback', [
      {
        id: 1,
        status: 'resolved',
        problem: '吸板不稳',
        measureHistory: [
          {
            measure: '采用新型真空表头',
            date: '2026-08-22',
            status: '现行',
          },
        ],
      },
    ]);

    expect(item && 'measure' in item ? item.measure : undefined).toBe(
      '采用新型真空表头',
    );
    expect(item && 'date' in item ? item.date : undefined).toBe('2026-08-22');
  });
});

describe('normalizeSensorItems', () => {
  it('falls back to allowed type and status lists', () => {
    const [item] = normalizeSensorItems(
      [
        {
          id: 1,
          model: 'X',
          sensorType: '未知',
          status: '坏状态',
          sopId: 0,
          model3dId: 'nope',
          replacesId: 'nope',
        },
      ],
      ['漫反射'],
      ['现用', '备选'],
    );
    expect(item).toMatchObject({
      sensorType: '漫反射',
      status: '现用',
      sopId: null,
      model3dId: null,
      replacesId: null,
      replacedById: null,
    });
  });
});

describe('normalizeSensor3dFiles', () => {
  it('keeps PDF-based 3D files and rejects model formats or oversized files', () => {
    expect(
      normalizeSensor3dFiles([
        {
          id: 1,
          title: '六轴机模型',
          fileName: 'robot.PDF',
          mimeType: '',
          dataUrl: 'data:application/pdf;base64,YQ==',
          size: 12,
          uploadedAt: '2026-08-27',
        },
        {
          id: 2,
          title: '暂不支持的模型格式',
          fileName: 'robot.step',
          mimeType: 'application/step',
          dataUrl: 'data:application/step;base64,YQ==',
          size: 12,
        },
        {
          id: 3,
          title: '过大模型',
          fileName: 'large.pdf',
          mimeType: 'application/pdf',
          dataUrl: 'data:application/pdf;base64,YQ==',
          size: SENSOR_3D_FILE_RULES.maxBytes + 1,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: 1,
        fileName: 'robot.PDF',
        mimeType: 'application/pdf',
        title: '六轴机模型',
      }),
    ]);
  });

  it('keeps backend file URLs without embedding base64 content in the store', () => {
    expect(
      normalizeSensor3dFiles([
        {
          id: 1,
          title: '按需加载模型',
          fileName: 'robot.pdf',
          mimeType: 'application/pdf',
          dataUrl: '/api/files/11111111-1111-1111-1111-111111111111/content',
          fileId: '11111111-1111-1111-1111-111111111111',
          size: 12,
          uploadedAt: '2026-08-28',
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        dataUrl: '/api/files/11111111-1111-1111-1111-111111111111/content',
        fileName: 'robot.pdf',
      }),
    ]);
  });
});

describe('createSensorCatalogDefaults', () => {
  it('seeds 13 catalog rows with first model current', () => {
    const items = createSensorCatalogDefaults(SENSOR_DATA);
    expect(items).toHaveLength(13);
    expect(items[0]).toMatchObject({
      id: 1,
      status: '现用',
      sensorType: '漫反射',
      model: 'E3Z-D61',
    });
    expect(items[1]?.status).toBe('备选');
  });
});

describe('normalizeProcessSteps', () => {
  it('drops empty names and defaults layer to 内层', () => {
    const items = normalizeProcessSteps([
      { id: 1, name: '  ', layer: '' },
      { id: 2, name: 'DES显影', layer: '  ' },
    ]);
    expect(items).toEqual([
      expect.objectContaining({ id: 2, name: 'DES显影', layer: '内层' }),
    ]);
  });
});

describe('normalizeMachineSections', () => {
  it('dedupes zh-CN names and forces extra tabs to structure', () => {
    const items = normalizeMachineSections(
      [
        { id: 1, name: '输送机构', sort: 2, kind: 'notes' },
        { id: 2, name: '输送机构', sort: 1, kind: 'structure' },
        { id: 3, name: '本机Tab', kind: 'notes', scope: 'machine' },
      ],
      { allowNotes: false },
    );
    expect(items.map((item) => item.name)).toEqual(['输送机构', '本机Tab']);
    expect(items.every((item) => item.kind === 'structure')).toBe(true);
  });
});

describe('machine row images', () => {
  it('rejects oversized or disallowed files', () => {
    expect(
      validateMachineRowImage('a.png', 'image/png', MACHINE_ROW_IMAGE_RULES.maxBytes + 1),
    ).toEqual({ ok: false, reason: 'size' });
    expect(validateMachineRowImage('a.gif', 'image/gif', 12)).toEqual({
      ok: false,
      reason: 'type',
    });
    expect(validateMachineRowImage('a.png', '', 12)).toEqual({ ok: true });
  });

  it('keeps at most two unique data URLs', () => {
    const png = 'data:image/png;base64,aaa';
    const jpeg = 'data:image/jpeg;base64,bbb';
    const webp = 'data:image/webp;base64,ccc';
    const images = normalizeMachineSectionImages([
      { dataUrl: png, fileName: 'a.png', mimeType: 'image/png', size: 8 },
      { dataUrl: png, fileName: 'dup.png', mimeType: 'image/png', size: 8 },
      { dataUrl: jpeg, fileName: 'b.jpg', mimeType: 'image/jpeg', size: 8 },
      { dataUrl: webp, fileName: 'c.webp', mimeType: 'image/webp', size: 8 },
    ]);
    expect(images.map((item) => item.fileName)).toEqual(['a.png', 'b.jpg']);
  });

  it('keeps independently stored backend image URLs', () => {
    expect(
      normalizeMachineRowImage({
        dataUrl: '/api/files/22222222-2222-2222-2222-222222222222/content',
        fileName: 'machine.png',
        mimeType: 'image/png',
        size: 12,
      }),
    ).toEqual(
      expect.objectContaining({
        dataUrl: '/api/files/22222222-2222-2222-2222-222222222222/content',
      }),
    );
  });
});

describe('normalizeMachineSectionRows', () => {
  it('keeps valid structure process links, defaults old rows, and removes links from notes', () => {
    const structureRows = normalizeMachineSectionRows(
      [
        {
          id: 1,
          role: '已绑定结构',
          processStepId: 12,
          sensorType: '漫反射',
        },
        { id: 2, role: '历史结构', sensorType: '对射' },
      ],
      { allowImage: true },
    );
    const noteRows = normalizeMachineSectionRows(
      [
        {
          id: 3,
          role: '安装注意',
          name: '保持水平',
          processStepId: 12,
        },
      ],
      { allowImage: false },
    );

    expect(structureRows.map((row) => row.processStepId)).toEqual([12, null]);
    expect(noteRows[0]?.processStepId).toBeNull();
  });

  it('maps legacy type/spec text onto catalog ids when sensorIds are empty', () => {
    const [row] = normalizeMachineSectionRows(
      [
        {
          id: 1,
          role: '进板检测',
          sensorType: '漫反射传感器',
          spec: 'E3Z-D61',
        },
      ],
      {
        allowImage: true,
        sensorItems: [
          {
            id: 9,
            status: '现用',
            partNumber: '',
            sensorType: '漫反射',
            brand: 'OMRON',
            model: 'E3Z-D61',
            spec: '0~300mm',
            feature: '',
            scene: '',
            sopId: null,
            model3dId: null,
            replacesId: null,
            replacedById: null,
            problemNote: '',
            replacedAt: '',
          },
        ],
      },
    );
    expect(row?.sensorIds).toEqual([9]);
  });

  it('keeps notes rows that have role and name', () => {
    const rows = normalizeMachineSectionRows(
      [{ id: 1, role: '安装注意', name: '角度' }],
      { allowImage: false },
    );
    expect(rows).toHaveLength(1);
  });
});

describe('dates', () => {
  it('formats local date and date-time with zero padding', () => {
    const date = new Date(2024, 8, 7, 4, 5, 6);
    expect(formatLocalDate(date)).toBe('2024-09-07');
    expect(formatLocalDateTime(date)).toBe('2024-09-07 04:05:06');
    expect(formatLocalDate(new Date('invalid'))).toBe('');
  });
});

describe('controlled files', () => {
  it('classifies pdf and word by extension or mime', () => {
    expect(detectControlledFileKind('a.PDF', '')).toBe('pdf');
    expect(
      detectControlledFileKind(
        'a.bin',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('word');
    expect(detectControlledFileKind('a.txt', 'text/plain')).toBe(null);
  });

  it('classifies PPT and PPTX only when process-intro kinds are enabled', () => {
    expect(
      detectControlledFileKind(
        'briefing.PPTX',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ['pdf', 'word', 'ppt'],
      ),
    ).toBe('ppt');
    expect(
      detectControlledFileKind(
        'legacy.PPT',
        'application/vnd.ms-powerpoint',
        ['pdf', 'word', 'ppt'],
      ),
    ).toBe('ppt');
    expect(detectControlledFileKind('briefing.pptx', '')).toBe(null);
    expect(
      validateControlledUpload(
        'ppt',
        'briefing.pptx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        10,
      ),
    ).toEqual({ ok: true });
  });

  it('validates size and type against kind rules', () => {
    expect(validateControlledUpload('excel' as 'pdf', 'a.pdf', 'application/pdf', 1)).toEqual({
      ok: false,
      reason: 'validation',
    });
    expect(
      validateControlledUpload('pdf', 'a.pdf', 'application/pdf', CONTROLLED_FILE_RULES.pdf.maxBytes + 1),
    ).toEqual({ ok: false, reason: 'size' });
    expect(validateControlledUpload('pdf', 'a.doc', 'application/msword', 10)).toEqual({
      ok: false,
      reason: 'type',
    });
  });

  it('flattens legacy labelled pdf/word slots', () => {
    const items = normalizeControlledDocuments([
      {
        label: '验收',
        pdf: {
          fileName: 'a.pdf',
          mimeType: 'application/pdf',
          dataUrl: 'data:application/pdf;base64,aaa',
          size: 12,
          uploadedAt: '2024-01-01',
        },
      },
    ]);
    expect(items).toEqual([
      expect.objectContaining({ id: 1, kind: 'pdf', fileName: 'a.pdf' }),
    ]);
  });

  it('keeps independently stored backend document URLs', () => {
    expect(
      normalizeControlledDocuments([
        {
          id: 1,
          kind: 'pdf',
          fileName: '资料.pdf',
          mimeType: 'application/pdf',
          dataUrl: '/api/files/33333333-3333-3333-3333-333333333333/content',
          size: 12,
          uploadedAt: '2026-08-28',
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        dataUrl: '/api/files/33333333-3333-3333-3333-333333333333/content',
      }),
    ]);
  });
});

describe('normalizeDictionaryItems', () => {
  it('trims, dedupes locale names, and sorts by sort then id', () => {
    const items = normalizeDictionaryItems([
      { id: 2, name: ' 乙 ', sort: 1 },
      { id: 1, name: '乙', sort: 1 },
      { id: 3, name: '甲', sort: 0 },
    ]);
    expect(items.map((item) => item.name)).toEqual(['甲', '乙']);
  });
});

describe('normalizeEntityGroups', () => {
  it('drops blank names and duplicate locale item names across groups', () => {
    const groups = normalizeEntityGroups([
      { name: '华东', items: ['庆鼎', '庆鼎', ''] },
      { name: '华东', items: ['健鼎'] },
      { name: '华南', items: ['庆鼎', '崇达'] },
    ]);
    expect(groups).toEqual([
      { name: '华东', items: ['庆鼎'] },
      { name: '华南', items: ['崇达'] },
    ]);
  });

  it('keeps ordered machine configurations and direct category machines', () => {
    const groups = normalizeEntityGroups([
      {
        name: '输送机构',
        items: ['直属机型'],
        configurations: [
          {
            name: '标准输送段配置',
            items: ['01 单段输送段（搭配）', '02 多段输送段（搭配）'],
          },
          {
            name: '标准输送段配置',
            items: ['重复配置中的机型'],
          },
        ],
      },
      { name: '专案机型', items: ['CSL(U)R-802（插框机）'] },
    ]);

    expect(groups).toEqual([
      {
        name: '输送机构',
        items: ['直属机型'],
        configurations: [
          {
            name: '标准输送段配置',
            items: ['01 单段输送段（搭配）', '02 多段输送段（搭配）'],
          },
        ],
      },
      { name: '专案机型', items: ['CSL(U)R-802（插框机）'] },
    ]);
  });
});
