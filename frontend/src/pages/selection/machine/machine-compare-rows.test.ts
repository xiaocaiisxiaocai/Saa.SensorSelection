import { describe, expect, it } from 'vitest';

import type { MachineSectionRow } from '@/domain';

import { pairMachineComparisonRows } from './machine-compare-rows';

function row(
  id: number,
  values: Partial<Pick<MachineSectionRow, 'role' | 'name'>> = {},
): MachineSectionRow {
  return {
    id,
    role: values.role ?? '',
    machineModelId: null,
    processStepId: null,
    boardCharacteristicId: null,
    sensorIds: [],
    sensorType: '',
    spec: '',
    purpose: '',
    name: values.name ?? '',
    desc: '',
    note: '',
  };
}

describe('pairMachineComparisonRows', () => {
  it('keeps left order, trims structure roles, and appends right-only rows', () => {
    const left = [
      row(1, { role: '  进板检测  ' }),
      row(2, { role: '出板检测' }),
      row(3, { role: '传送检测' }),
    ];
    const right = [
      row(30, { role: '传送检测' }),
      row(10, { role: '进板检测' }),
      row(40, { role: '故障复位' }),
    ];

    const result = pairMachineComparisonRows(left, right, true);

    expect(result).toEqual([
      { key: 'left:1|right:10', left: left[0], right: right[1] },
      { key: 'left:2', left: left[1], right: null },
      { key: 'left:3|right:30', left: left[2], right: right[0] },
      { key: 'right:40', left: null, right: right[2] },
    ]);
  });

  it('pairs duplicate identities by occurrence without dropping or reusing rows', () => {
    const left = [
      row(1, { role: '重复角色' }),
      row(2, { role: '重复角色' }),
      row(3, { role: '重复角色' }),
    ];
    const right = [
      row(11, { role: '重复角色' }),
      row(12, { role: '重复角色' }),
      row(13, { role: '右侧独有' }),
    ];

    const result = pairMachineComparisonRows(left, right, true);

    expect(
      result.map(({ left: leftRow, right: rightRow }) => [
        leftRow?.id ?? null,
        rightRow?.id ?? null,
      ]),
    ).toEqual([
      [1, 11],
      [2, 12],
      [3, null],
      [null, 13],
    ]);
    expect(new Set(result.map((item) => item.key)).size).toBe(result.length);
  });

  it('does not match wholly blank identities and keeps colliding side IDs unique', () => {
    const left = [row(7, { role: '   ' })];
    const right = [row(7, { role: '' })];

    const result = pairMachineComparisonRows(left, right, true);

    expect(result).toEqual([
      { key: 'left:7', left: left[0], right: null },
      { key: 'right:7', left: null, right: right[0] },
    ]);
  });

  it('matches notes by trimmed role and name together', () => {
    const left = [
      row(1, { role: ' 安装注意 ', name: '角度' }),
      row(2, { role: ' 安装注意 ', name: '清洁' }),
      row(3, { role: '维护注意', name: '角度' }),
    ];
    const right = [
      row(31, { role: '维护注意', name: '角度' }),
      row(21, { role: '安装注意', name: '清洁' }),
      row(11, { role: '安装注意', name: '角度' }),
      row(41, { role: '其他注意', name: '角度' }),
    ];

    const result = pairMachineComparisonRows(left, right, false);

    expect(
      result.map(({ left: leftRow, right: rightRow }) => [
        leftRow?.id ?? null,
        rightRow?.id ?? null,
      ]),
    ).toEqual([
      [1, 11],
      [2, 21],
      [3, 31],
      [null, 41],
    ]);
  });
});
