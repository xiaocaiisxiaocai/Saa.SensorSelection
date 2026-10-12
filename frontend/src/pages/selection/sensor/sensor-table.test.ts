import { describe, expect, it } from 'vitest';

import type { SensorItem } from '@/domain';

import {
  exportCell,
  filterSensors,
  relationText,
  sensorColumns,
  type SensorLookup,
} from './sensor-table';

function sensor(patch: Partial<SensorItem>): SensorItem {
  return {
    id: 1,
    status: '01 现用',
    partNumber: '',
    sensorType: '对射式',
    brand: 'OMRON',
    model: 'E3Z',
    spec: '',
    feature: '',
    scene: '',
    sopId: null,
    model3dId: null,
    replacesId: null,
    replacedById: null,
    problemNote: '',
    replacedAt: '',
    ...patch,
  } as SensorItem;
}

const old = sensor({
  id: 2,
  brand: 'KEYENCE',
  model: 'PZ-G',
  status: '03 停用',
});
const current = sensor({ id: 1, replacesId: 2, problemNote: '误检', sopId: 9 });
const lookup: SensorLookup = {
  related: (item) => (item.replacesId === 2 ? old : null),
  sopTitle: (id) => (id === 9 ? 'E3Z 型录' : ''),
  model3dTitle: () => '',
};

describe('sensor-table', () => {
  it('matches the keyword against the replaced model and the linked catalog', () => {
    const rows = [current, old];
    const filters = { status: '全部', sensorTypes: [] };
    // 新型号本身不含 PZ-G，但它替换了 PZ-G，所以和 PZ-G 一起被搜出来
    expect(filterSensors(rows, { ...filters, query: 'pz-g' }, lookup)).toEqual([
      current,
      old,
    ]);
    expect(filterSensors(rows, { ...filters, query: '型录' }, lookup)).toEqual([
      current,
    ]);
    expect(
      filterSensors(rows, { ...filters, status: '03 停用', query: '' }, lookup),
    ).toEqual([old]);
  });

  it('describes and exports the replacement relation', () => {
    expect(relationText(current, old)).toBe('替换了 KEYENCE PZ-G · 误检');
    expect(relationText(sensor({ replacedById: 7 }), null)).toBe(
      '被 型号#7 替换',
    );
    expect(exportCell(current, 'sop', lookup)).toBe('E3Z 型录');
    expect(exportCell(current, 'model3d', lookup)).toBe('未关联');
    expect(exportCell(current, 'partNumber', lookup)).toBe('—');
  });

  it('drops hidden columns, adds disabled details and the action column', () => {
    const keys = (options: Parameters<typeof sensorColumns>[0]) =>
      sensorColumns(options).map((column) => column.key);
    const base = { sort: null, hidden: new Set<string>(), writable: false };
    expect(keys({ ...base, showDisabledDetails: false })).not.toContain(
      'replacedAt',
    );
    expect(keys({ ...base, showDisabledDetails: true })).toContain(
      'problemNote',
    );
    const visible = keys({
      ...base,
      showDisabledDetails: false,
      hidden: new Set(['spec']),
      writable: true,
    });
    expect(visible).not.toContain('spec');
    expect(visible.at(-1)).toBe('actions');
  });
});
