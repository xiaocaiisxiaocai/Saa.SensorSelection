import { describe, expect, it } from 'vitest';

import { mapDictionaryWorkbook } from './dictionary-excel';

describe('dictionary-excel', () => {
  it('maps name and sort by header text and ignores a blank used-range row', () => {
    const [sheet] = mapDictionaryWorkbook([
      {
        rows: [
          ['排序', '备注', '字典项名称'],
          ['10', 'x', ' 距离 '],
          ['', '', ''],
          ['nope', '', ''],
        ],
        sheetName: '要求分类',
      },
    ]);
    expect(sheet).toEqual({
      hasNameColumn: true,
      name: '要求分类',
      rows: [
        { name: ' 距离 ', rowNumber: 2, sort: '10' },
        { name: '', rowNumber: 3, sort: '' },
        { name: '', rowNumber: 4, sort: 'nope' },
      ],
    });
  });

  it('marks a sheet that has no name column', () => {
    const [sheet] = mapDictionaryWorkbook([
      { rows: [['排序'], ['1']], sheetName: '感应器类型' },
    ]);
    expect(sheet?.hasNameColumn).toBe(false);
    expect(sheet?.rows).toEqual([{ name: '', rowNumber: 2, sort: '1' }]);
  });
});
