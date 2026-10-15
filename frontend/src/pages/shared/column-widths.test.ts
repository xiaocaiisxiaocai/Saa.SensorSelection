import type { TableColumnType } from 'ant-design-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';

import {
  COLUMN_WIDTHS_STORAGE_KEY,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  resetColumnWidths,
  useResizableColumns,
} from './column-widths';

const COLUMNS: TableColumnType[] = [
  { key: 'name', title: '名称', width: 120 },
  { key: 'desc', title: '说明' },
  { key: 'actions', title: '操作', width: 96 },
];

describe('useResizableColumns', () => {
  afterEach(() => {
    resetColumnWidths();
  });

  it('makes columns with a numeric width resizable, except the actions column', () => {
    const { columns } = useResizableColumns('t', () => COLUMNS);
    const [name, desc, actions] = columns.value;
    expect(name).toMatchObject({ resizable: true, width: 120 });
    expect(desc?.resizable).toBeUndefined();
    expect(actions?.resizable).toBeUndefined();
  });

  it('applies and remembers a dragged width, clamped to the allowed range', () => {
    const { columns, onResizeColumn } = useResizableColumns('t', () => COLUMNS);
    onResizeColumn(222.4, { key: 'name' });
    expect(columns.value[0]?.width).toBe(222);
    expect(
      JSON.parse(localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY) ?? '{}'),
    ).toEqual({ t: { name: 222 } });

    onResizeColumn(5, { key: 'name' });
    expect(columns.value[0]?.width).toBe(MIN_COLUMN_WIDTH);
    onResizeColumn(5000, { key: 'name' });
    expect(columns.value[0]?.width).toBe(MAX_COLUMN_WIDTH);
  });

  it('keeps widths per table, follows a dynamic table id, and resets everything', () => {
    const kind = ref('a');
    const dynamic = useResizableColumns(
      () => `table:${kind.value}`,
      () => COLUMNS,
    );
    dynamic.onResizeColumn(200, { key: 'name' });
    expect(dynamic.columns.value[0]?.width).toBe(200);
    kind.value = 'b';
    expect(dynamic.columns.value[0]?.width).toBe(120);

    resetColumnWidths();
    kind.value = 'a';
    expect(dynamic.columns.value[0]?.width).toBe(120);
    expect(localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY)).toBeNull();
  });
});
