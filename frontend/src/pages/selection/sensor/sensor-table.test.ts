import { describe, expect, it } from 'vitest';

import type { SensorItem } from '@/domain';

import {
  expandSensorGroups,
  exportCell,
  filterSensorGroups,
  filterSensors,
  groupSensorCatalog,
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
    const filters = { statuses: [] as string[], sensorTypes: [] };
    // 新型号本身不含 PZ-G，但它替换了 PZ-G，所以和 PZ-G 一起被搜出来
    expect(filterSensors(rows, { ...filters, query: 'pz-g' }, lookup)).toEqual([
      current,
      old,
    ]);
    expect(filterSensors(rows, { ...filters, query: '型录' }, lookup)).toEqual([
      current,
    ]);
    expect(
      filterSensors(
        rows,
        { ...filters, statuses: ['03 停用'], query: '' },
        lookup,
      ),
    ).toEqual([old]);
    expect(
      filterSensors(
        rows,
        { ...filters, statuses: ['01 现用', '03 停用'], query: '' },
        lookup,
      ),
    ).toEqual([current, old]);
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
    const base = { hidden: new Set<string>(), writable: false };
    expect(keys({ ...base, showDisabledDetails: false })).not.toContain(
      'replacedAt',
    );
    expect(keys({ ...base, showDisabledDetails: true })).toContain(
      'problemNote',
    );
    const visible = keys({
      ...base,
      showDisabledDetails: false,
      hidden: new Set(['spec', 'partNumber']),
      writable: true,
    });
    expect(visible).not.toContain('spec');
    // 料号常整列为空，也能隐藏
    expect(visible).not.toContain('partNumber');
    expect(visible.at(-1)).toBe('actions');
    // dataIndex 指到行上的 item；key 仍是字段名，两者不能混成一个路径。
    const columns = sensorColumns({ ...base, showDisabledDetails: true });
    expect(columns.find((column) => column.key === 'brand')?.dataIndex).toEqual(
      ['item', 'brand'],
    );
    expect(columns.find((column) => column.key === 'brand')?.key).toBe('brand');
    expect(
      columns.every(
        (column) =>
          column.sortOrder == null &&
          !Object.entries(column).some(
            ([key, value]) =>
              key !== 'sortOrder' &&
              key.toLowerCase().startsWith('sort') &&
              value != null,
          ),
      ),
    ).toBe(true);
  });

  it('places same-type alternates under each current and leaves unlinked disabled rows at the end', () => {
    const current = sensor({ id: 1, model: '现用', sensorType: '对射式' });
    const other = sensor({
      id: 2,
      model: '另一现用',
      sensorType: '漫反射',
      status: '01 现用',
    });
    const first = sensor({
      id: 9,
      model: 'Z备选',
      sensorType: '对射式',
      status: '02 备选',
    });
    const second = sensor({
      id: 4,
      model: 'A备选',
      sensorType: '对射式',
      status: '备用',
    });
    const disabled = sensor({
      id: 5,
      model: '停用',
      sensorType: '对射式',
      status: '03 停用',
    });
    const otherType = sensor({
      id: 6,
      model: '漫反射备选',
      sensorType: '漫反射',
      status: '02 备选',
    });
    const catalog = [first, disabled, current, second, other, otherType];

    const rows = expandSensorGroups(groupSensorCatalog(catalog));

    expect(rows.map((row) => row.item.model)).toEqual([
      '现用',
      'Z备选',
      'A备选',
      '另一现用',
      '漫反射备选',
      '停用',
    ]);
    expect(rows.map((row) => row.muted)).toEqual([
      false,
      true,
      true,
      false,
      true,
      false,
    ]);
    expect(rows.map((row) => row.struck)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(rows.map((row) => row.rowKey)).toEqual([
      '1',
      '1:9',
      '1:4',
      '2',
      '2:6',
      '5',
    ]);
    expect(rows[1]?.item).toBe(first);
    expect(rows.map((row) => row.groupStart)).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(rows.map((row) => row.groupSize)).toEqual([3, 3, 3, 2, 2, 1]);
    expect(rows.map((row) => row.parent.model)).toEqual([
      '现用',
      '现用',
      '现用',
      '另一现用',
      '另一现用',
      '停用',
    ]);
    expect(rows[5]?.parent).toBe(disabled);
    expect(catalog.map((item) => item.id)).toEqual([9, 5, 1, 4, 2, 6]);
  });

  it('repeats an alternate under every current of that type and keeps a disabled row on one chain', () => {
    const left = sensor({ id: 1, model: '左', sensorType: '对射式' });
    const right = sensor({ id: 2, model: '右', sensorType: '对射式' });
    const alternate = sensor({
      id: 9,
      model: '备选',
      sensorType: '对射式',
      status: '02 备选',
    });
    const retired = sensor({
      id: 4,
      model: '停用',
      status: '03 停用',
      replacedById: 2,
      replacedAt: '2026-01-01',
    });

    const rows = expandSensorGroups(
      groupSensorCatalog([left, alternate, right, retired]),
    );

    expect(rows.map((row) => row.rowKey)).toEqual([
      '1',
      '1:9',
      '2',
      '2:9',
      '2:4',
    ]);
    expect(rows.map((row) => row.parent.id)).toEqual([1, 1, 2, 2, 2]);
    expect(rows.map((row) => row.groupStart)).toEqual([
      true,
      false,
      true,
      false,
      false,
    ]);
    expect(rows.map((row) => row.groupSize)).toEqual([2, 2, 3, 3, 3]);
    expect(rows.map((row) => row.struck)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(rows.filter((row) => row.muted).map((row) => row.item)).toEqual([
      alternate,
      alternate,
      retired,
    ]);
  });

  it('orders disabled rows by nearest generation, then replacedAt desc, then catalog order', () => {
    const current = sensor({ id: 1, model: '现用', sensorType: '对射式' });
    const nearLate = sensor({
      id: 4,
      model: '近晚',
      status: '03 停用',
      replacedById: 1,
      replacedAt: '2026-03-01',
      sensorType: '激光',
    });
    const nearEarly = sensor({
      id: 5,
      model: '近早',
      status: '03 停用',
      replacedById: 1,
      replacedAt: '2026-01-01',
      sensorType: '激光',
    });
    const nearEmpty = sensor({
      id: 6,
      model: '近空',
      status: '停用',
      replacedById: 1,
      replacedAt: '',
      sensorType: '激光',
    });
    const sameDayLater = sensor({
      id: 8,
      model: '同日甲',
      status: '03 停用',
      replacedById: 1,
      replacedAt: '2026-02-01',
    });
    const sameDayEarlier = sensor({
      id: 9,
      model: '同日乙',
      status: '03 停用',
      replacedById: 1,
      replacedAt: '2026-02-01',
    });
    const far = sensor({
      id: 7,
      model: '远',
      status: '03 停用',
      replacedById: 5,
      replacedAt: '2026-08-01',
      sensorType: '压力',
    });
    const alternate = sensor({
      id: 3,
      model: '备选',
      sensorType: '对射式',
      status: '02 备选',
      replacedById: 1,
    });
    const catalog = [
      current,
      alternate,
      nearEmpty,
      sameDayEarlier,
      nearEarly,
      sameDayLater,
      nearLate,
      far,
    ];

    const [unit] = groupSensorCatalog(catalog);
    expect(unit?.members.map((item) => item.model)).toEqual([
      '备选',
      '近晚',
      '同日乙',
      '同日甲',
      '近早',
      '近空',
      '远',
    ]);
    expect(unit?.grouped).toBe(true);
  });

  it('follows a disabled row through a non-current bridge and leaves cycles as orphans', () => {
    const current = sensor({ id: 1, model: '现用', sensorType: '对射式' });
    const bridge = sensor({
      id: 2,
      model: '桥',
      status: '02 备选',
      sensorType: '漫反射',
      replacedById: 1,
    });
    const retired = sensor({
      id: 3,
      model: '经桥停用',
      status: '03 停用',
      replacedById: 2,
      replacedAt: '2026-04-01',
      sensorType: '激光',
    });
    const loopA = sensor({
      id: 4,
      model: '环A',
      status: '03 停用',
      replacedById: 5,
    });
    const loopB = sensor({
      id: 5,
      model: '环B',
      status: '03 停用',
      replacedById: 4,
    });
    const self = sensor({
      id: 6,
      model: '自环',
      status: '03 停用',
      replacedById: 6,
    });
    const missing = sensor({
      id: 7,
      model: '断链',
      status: '03 停用',
      replacedById: 99,
    });
    const orphanAlt = sensor({
      id: 8,
      model: '落单备选',
      status: '02 备选',
      sensorType: '没有现用',
    });

    const units = groupSensorCatalog([
      loopA,
      current,
      bridge,
      retired,
      self,
      missing,
      loopB,
      orphanAlt,
    ]);

    expect(units.map((unit) => unit.head.model)).toEqual([
      '现用',
      '环A',
      '桥',
      '自环',
      '断链',
      '环B',
      '落单备选',
    ]);
    expect(units[0]?.members.map((item) => item.model)).toEqual(['经桥停用']);
    expect(units.slice(1).every((unit) => !unit.grouped)).toBe(true);
    const orphan = expandSensorGroups(units).find(
      (row) => row.item.model === '环A',
    );
    expect(orphan).toMatchObject({
      muted: false,
      struck: false,
      groupStart: false,
      groupSize: 1,
      parent: loopA,
    });
  });

  it('keeps an empty-type alternate with the empty-type current and orphans the rest', () => {
    const current = sensor({ id: 1, sensorType: '' });
    const blank = sensor({
      id: 8,
      model: '空类型备选',
      sensorType: '',
      status: '02 备选',
    });
    const typed = sensor({
      id: 3,
      model: '对射备选',
      sensorType: '对射式',
      status: '02 备选',
    });
    const alone = sensor({ id: 7, model: '单独', sensorType: '漫反射' });

    const grouped = expandSensorGroups(
      groupSensorCatalog([current, typed, blank]),
    );
    expect(grouped.map((row) => row.item.model)).toEqual([
      'E3Z',
      '空类型备选',
      '对射备选',
    ]);
    expect(grouped[0]).toMatchObject({
      groupStart: true,
      groupSize: 2,
      muted: false,
      struck: false,
      parent: current,
    });
    expect(grouped[1]).toMatchObject({
      groupStart: false,
      groupSize: 2,
      muted: true,
      struck: false,
      parent: current,
      item: blank,
    });
    expect(grouped[2]).toMatchObject({
      rowKey: '3',
      muted: false,
      struck: false,
      groupStart: false,
      groupSize: 1,
      parent: typed,
    });
    expect(expandSensorGroups(groupSensorCatalog([alone, typed, blank]))).toEqual(
      [
        {
          rowKey: '7',
          item: alone,
          parent: alone,
          muted: false,
          struck: false,
          groupStart: false,
          groupSize: 1,
        },
        {
          rowKey: '3',
          item: typed,
          parent: typed,
          muted: false,
          struck: false,
          groupStart: false,
          groupSize: 1,
        },
        {
          rowKey: '8',
          item: blank,
          parent: blank,
          muted: false,
          struck: false,
          groupStart: false,
          groupSize: 1,
        },
      ],
    );
  });

  it('keeps a group when one member matches both filters', () => {
    const left = sensor({
      id: 1,
      model: '左',
      brand: 'AAA',
      sensorType: '对射式',
    });
    const right = sensor({
      id: 2,
      model: '右',
      brand: 'ZZZ',
      sensorType: '对射式',
    });
    const alternate = sensor({
      id: 9,
      model: '备选',
      sensorType: '对射式',
      status: '02 备选',
    });
    const retired = sensor({
      id: 4,
      model: '停用字',
      sensorType: '激光',
      status: '03 停用',
      replacedById: 2,
      replacedAt: '2026-01-01',
      problemNote: '旧问题',
    });
    const units = groupSensorCatalog([left, alternate, right, retired]);
    const quiet: SensorLookup = {
      related: () => null,
      sopTitle: () => '',
      model3dTitle: () => '',
    };

    expect(
      filterSensorGroups(
        units,
        { sensorTypes: ['激光'], query: '' },
        quiet,
      ).map((unit) => unit.head.model),
    ).toEqual(['右']);
    expect(
      filterSensorGroups(
        units,
        { sensorTypes: ['对射式'], query: '停用字' },
        quiet,
      ),
    ).toEqual([]);
    expect(
      filterSensorGroups(
        units,
        { sensorTypes: ['激光'], query: '旧问题' },
        quiet,
      ).map((unit) => unit.head.model),
    ).toEqual(['右']);
    expect(
      filterSensorGroups(units, { sensorTypes: [], query: '备选' }, quiet).map(
        (unit) => unit.head.model,
      ),
    ).toEqual(['左', '右']);
  });

  it('merges catalog and 3d cells across the whole group, including disabled rows', () => {
    const current = sensor({ id: 1, model: '现用', sensorType: '对射式' });
    const other = sensor({ id: 2, model: '另一现用', sensorType: '漫反射' });
    const first = sensor({
      id: 9,
      model: 'Z备选',
      sensorType: '对射式',
      status: '02 备选',
    });
    const second = sensor({
      id: 4,
      model: 'A备选',
      sensorType: '对射式',
      status: '02 备选',
    });
    const retired = sensor({
      id: 8,
      model: '旧现用',
      sensorType: '激光',
      status: '03 停用',
      replacedById: 1,
      replacedAt: '2026-01-01',
    });
    const otherType = sensor({
      id: 6,
      model: '漫反射备选',
      sensorType: '漫反射',
      status: '02 备选',
    });
    const alone = sensor({ id: 7, model: '单独', sensorType: '激光' });
    const rows = expandSensorGroups(
      groupSensorCatalog([
        first,
        second,
        retired,
        otherType,
        current,
        other,
        alone,
      ]),
    );
    expect(rows.map((row) => row.item.model)).toEqual([
      '现用',
      'Z备选',
      'A备选',
      '旧现用',
      '另一现用',
      '漫反射备选',
      '单独',
    ]);
    expect(rows.map((row) => row.groupSize)).toEqual([4, 4, 4, 4, 2, 2, 1]);
    expect(rows.map((row) => row.struck)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);

    const options = {
      showDisabledDetails: false,
      hidden: new Set<string>(),
      writable: false,
    };
    const plain = sensorColumns(options);
    const grouped = sensorColumns({ ...options, grouped: true });
    expect(plain.map((column) => column.key)).toEqual(
      grouped.map((column) => column.key),
    );
    expect(plain.find((column) => column.key === 'sop')?.customCell).toBe(
      undefined,
    );
    expect(plain.find((column) => column.key === 'model3d')?.customCell).toBe(
      undefined,
    );

    const sop = grouped.find((column) => column.key === 'sop');
    const model3d = grouped.find((column) => column.key === 'model3d');
    expect(grouped.find((column) => column.key === 'brand')?.customCell).toBe(
      undefined,
    );
    expect(sop?.key).toBe('sop');
    expect(model3d?.key).toBe('model3d');
    expect(sop?.customCell?.(rows[0]!)).toEqual({
      rowSpan: 4,
      class: 'sensor-shared-cell',
    });
    expect(sop?.customCell?.(rows[1]!)).toEqual({ rowSpan: 0 });
    expect(model3d?.customCell?.(rows[3]!)).toEqual({ rowSpan: 0 });
    expect(model3d?.customCell?.(rows[4]!)).toEqual({
      rowSpan: 2,
      class: 'sensor-shared-cell',
    });
    expect(sop?.customCell?.(rows[5]!)).toEqual({ rowSpan: 0 });
    expect(sop?.customCell?.(rows[6]!)).toEqual({ rowSpan: 1 });
    expect(model3d?.customCell?.(rows[6]!)).toEqual({ rowSpan: 1 });
  });
});
