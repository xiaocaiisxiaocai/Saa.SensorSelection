import { describe, expect, it } from 'vitest';

import type { MachineSectionRow, SensorItem } from '@/domain';

import { buildMachineTableRows } from './table-rows';

const row: MachineSectionRow = {
  id: 7,
  role: '进板检测',
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
    replacesId: null,
    replacedById: null,
    problemNote: '',
    replacedAt: '',
  },
];

describe('buildMachineTableRows', () => {
  it('expands each selected sensor into a physical row and keeps the group metadata', () => {
    const result = buildMachineTableRows([row], sensors, true);

    expect(result).toHaveLength(3);
    expect(result.map((item) => item.sensorType)).toEqual(['漫反射', '对射', '静电容']);
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
});
