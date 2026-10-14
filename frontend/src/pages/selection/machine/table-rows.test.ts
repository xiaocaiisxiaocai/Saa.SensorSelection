import { describe, expect, it } from 'vitest';

import type { MachineSectionRow, ProcessStepItem, SensorItem } from '@/domain';

import {
  buildMachineTableRows,
  filterSectionRows,
  imageGroups,
  sectionColumns,
} from './table-rows';

const row: MachineSectionRow = {
  id: 7,
  role: '进板检测',
  machineModelId: null,
  processStepId: 21,
  boardCharacteristicId: null,
  sensorIds: [11, 12, 13],
  sensorType: '',
  spec: '',
  purpose: '安装于进板口',
  name: '',
  desc: '',
  note: '板件前缘到位信号',
};

const sensors: SensorItem[] = [
  {
    id: 11,
    status: '现用',
    partNumber: '',
    sensorType: '漫反射',
    brand: 'OMRON',
    model: 'E3Z-D61',
    spec: '检测距离 0~300mm',
    feature: '',
    scene: '',
    sopId: null,
    model3dId: null,
    replacesId: null,
    replacedById: null,
    problemNote: '',
    replacedAt: '',
  },
  {
    id: 12,
    status: '现用',
    partNumber: '',
    sensorType: '对射',
    brand: 'OMRON',
    model: 'E3Z-T61',
    spec: '检测距离 0~10m',
    feature: '',
    scene: '',
    sopId: null,
    model3dId: null,
    replacesId: null,
    replacedById: null,
    problemNote: '',
    replacedAt: '',
  },
  {
    id: 13,
    status: '现用',
    partNumber: '',
    sensorType: '静电容',
    brand: 'OMRON',
    model: 'E2K-C25',
    spec: '检测距离 10mm',
    feature: '',
    scene: '',
    sopId: null,
    model3dId: null,
    replacesId: null,
    replacedById: null,
    problemNote: '',
    replacedAt: '',
  },
];

const processSteps: ProcessStepItem[] = [
  {
    id: 21,
    layer: '内层',
    name: 'DES 显影',
    role: '',
    feature: '',
    note: '',
  },
];

const machineModels = [{ id: 3, name: '中间输送机', sort: 1 }];
const boardCharacteristics = [{ id: 4, name: '平板无孔，金属材质', sort: 1 }];

describe('buildMachineTableRows', () => {
  it('expands each selected sensor into a physical row and keeps the group metadata', () => {
    const result = buildMachineTableRows([row], sensors, true);

    expect(result).toHaveLength(3);
    expect(result.map((item) => item.sensorType)).toEqual([
      '漫反射',
      '对射',
      '静电容',
    ]);
    expect(result.map((item) => item.groupEnd)).toEqual([false, false, true]);
    expect(result.map((item) => item.spec)).toEqual([
      'OMRON E3Z-D61 · 检测距离 0~300mm',
      'OMRON E3Z-T61 · 检测距离 0~10m',
      'OMRON E2K-C25 · 检测距离 10mm',
    ]);
    expect(result.map((item) => item.groupStart)).toEqual([true, false, false]);
    expect(result.every((item) => item.groupSize === 3)).toBe(true);
    expect(result.every((item) => item.source === row)).toBe(true);
  });

  it('keeps note records as one row and preserves legacy structure text', () => {
    const noteRows = buildMachineTableRows([row], sensors, false);
    const legacyRows = buildMachineTableRows(
      [{ ...row, sensorIds: [], sensorType: '漫反射', spec: '旧规格' }],
      sensors,
      true,
    );

    expect(noteRows).toHaveLength(1);
    expect(noteRows[0]?.groupSize).toBe(1);
    expect(noteRows[0]?.sensor).toBeNull();
    expect(legacyRows[0]?.sensorType).toBe('漫反射');
    expect(legacyRows[0]?.spec).toBe('旧规格');
  });

  it('shows the optional process-step binding only for structure rows', () => {
    const linkedRow = {
      ...row,
      machineModelId: 3,
      processStepId: 21,
      boardCharacteristicId: 4,
    };
    const structureRows = buildMachineTableRows(
      [linkedRow],
      sensors,
      true,
      processSteps,
      machineModels,
      boardCharacteristics,
    );
    const noteRows = buildMachineTableRows(
      [linkedRow],
      sensors,
      false,
      processSteps,
    );

    expect(
      (structureRows[0] as unknown as { processStepName: string })
        .processStepName,
    ).toBe('内层 · DES 显影');
    expect(structureRows[0]?.machineModelName).toBe('中间输送机');
    expect(structureRows[0]?.boardCharacteristicName).toBe(
      '平板无孔，金属材质',
    );
    expect(
      (noteRows[0] as unknown as { processStepName: string }).processStepName,
    ).toBe('—');
  });
});

describe('filterSectionRows', () => {
  const lookup = {
    sensorById: new Map(sensors.map((sensor) => [sensor.id, sensor])),
    processSteps,
    machineModels,
    boardCharacteristics,
  };
  const none = {
    query: '',
    sensorTypes: [],
    machineModelIds: [],
    processStepIds: [],
    boardCharacteristicIds: [],
  };
  const other = { ...row, id: 8, sensorIds: [], processStepId: null };

  it('filters structure rows by linked sensor type and dictionary ids', () => {
    const rows = [row, other];
    expect(
      filterSectionRows(rows, true, { ...none, sensorTypes: ['对射'] }, lookup),
    ).toEqual([row]);
    expect(
      filterSectionRows(rows, true, { ...none, processStepIds: [21, 99] }, lookup),
    ).toEqual([row]);
    expect(
      filterSectionRows(rows, true, { ...none, processStepIds: [99] }, lookup),
    ).toEqual([]);
    // 表头筛选只对结构分区生效
    expect(
      filterSectionRows(rows, false, { ...none, processStepIds: [21] }, lookup),
    ).toEqual(rows);
  });

  it('matches keywords against step names and linked sensor models', () => {
    const rows = [row, other];
    expect(
      filterSectionRows(rows, true, { ...none, query: 'des 显影' }, lookup),
    ).toEqual([row]);
    expect(
      filterSectionRows(rows, true, { ...none, query: 'e2k-c25' }, lookup),
    ).toEqual([row]);
  });
});

function columnHeaderSorts(column: object) {
  return Object.entries(column).some(
    ([key, value]) =>
      key !== 'sortOrder' &&
      key.toLowerCase().startsWith('sort') &&
      value != null,
  );
}

describe('sectionColumns', () => {
  it('keeps store order and adds actions when writable', () => {
    const structure = sectionColumns({
      structure: true,
      writable: true,
    });
    const notes = sectionColumns({
      structure: false,
      writable: false,
    });
    expect(structure.some(columnHeaderSorts)).toBe(false);
    expect(notes.some(columnHeaderSorts)).toBe(false);
    expect(structure.at(-1)?.key).toBe('actions');
    expect(notes.some((column) => column.key === 'actions')).toBe(false);
  });

  it('merges the schematic cell over neighbouring records that share an image', () => {
    const image = (name: string) => ({
      dataUrl: `data:image/png;base64,${name}`,
      fileName: `${name}.png`,
      mimeType: 'image/png',
      size: 1,
    });
    // a、b 共用 X（a 有三个传感器，占三行）；c 没有图；d 用 X 但不相邻，单独一格
    const items: MachineSectionRow[] = [
      { ...row, id: 1, image: image('X') },
      { ...row, id: 2, sensorIds: [11], image: image('X') },
      { ...row, id: 3, sensorIds: [11] },
      { ...row, id: 4, sensorIds: [11], image: image('X') },
    ];
    expect(imageGroups(items).map((group) => group.map((item) => item.id))).toEqual([
      [1, 2],
      [3],
      [4],
    ]);
    const rows = buildMachineTableRows(items, sensors, true);
    expect(rows.map((item) => item.imageSpan)).toEqual([4, 0, 0, 0, 1, 1]);
    expect(rows[0]!.imageRows.map((item) => item.id)).toEqual([1, 2]);
    // 没图的 c 紧挨在有图的 b 下面：可以沿用 b 的图；d 自己有图，不提供
    expect(rows.map((item) => item.previousRow?.id ?? null)).toEqual([
      null, null, null, null, 2, null,
    ]);
    const columns = sectionColumns({ structure: true, writable: true });
    expect(columns.slice(-2).map((column) => column.key)).toEqual(['image', 'actions']);
    // 展开列：a 的 3 个传感器是 rows[0..2]，b 是 rows[3]，没图的 c 是 rows[4]，
    // 不相邻、自己一张 X 的 d 是 rows[5]
    const imageColumn = columns.find((column) => column.key === 'image');
    expect(imageColumn?.customCell?.(rows[0]!)).toEqual({
      rowSpan: 4,
      class: 'machine-image-cell--shared',
    });
    expect(imageColumn?.customCell?.(rows[5]!)).toEqual({ rowSpan: 1 });
    expect(imageColumn?.customCell?.(rows[4]!)).toEqual({ rowSpan: 1 });
  });
});
