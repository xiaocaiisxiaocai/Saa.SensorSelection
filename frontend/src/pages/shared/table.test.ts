import { describe, expect, it, vi } from 'vitest';

import {
  cellText,
  rowClick,
  scrollX,
  sortFromChange,
  sortOrderOf,
  sortRows,
} from './table';

describe('table helpers', () => {
  it('sorts the whole dataset so paginated tables can slice after sorting', () => {
    const rows = [{ n: 'C' }, { n: 'A' }, { n: 'B' }, { n: 'D' }];

    // 页面必须先排完整数据再切片：先切后排会把 D 留在第一页。
    const firstPage = sortRows(rows, { key: 'n', order: 'ascend' }).slice(0, 2);

    expect(firstPage.map((row) => row.n)).toEqual(['A', 'B']);
  });

  it('orders numbers numerically rather than as text', () => {
    const rows = [{ sort: 10 }, { sort: 2 }, { sort: 1 }];

    expect(
      sortRows(rows, { key: 'sort', order: 'ascend' }).map((row) => row.sort),
    ).toEqual([1, 2, 10]);
  });

  it('orders numeric prefixes inside Chinese labels naturally', () => {
    const rows = [{ name: '10 入料' }, { name: '2 曝光' }, { name: '1 上板' }];

    expect(
      sortRows(rows, { key: 'name', order: 'ascend' }).map((row) => row.name),
    ).toEqual(['1 上板', '2 曝光', '10 入料']);
    expect(
      sortRows(rows, { key: 'name', order: 'descend' }).map((row) => row.name),
    ).toEqual(['10 入料', '2 曝光', '1 上板']);
  });

  it('leaves the original array untouched', () => {
    const rows = [{ n: 'B' }, { n: 'A' }];

    sortRows(rows, { key: 'n', order: 'ascend' });

    expect(rows.map((row) => row.n)).toEqual(['B', 'A']);
  });

  it('maps a-table sorter changes to controlled sort state', () => {
    expect(sortFromChange({ columnKey: 'name', order: 'ascend' })).toEqual({
      key: 'name',
      order: 'ascend',
    });
    expect(sortFromChange([{ field: 'code', order: 'descend' }])).toEqual({
      key: 'code',
      order: 'descend',
    });
    // 第三次点击表头取消排序时 order 为 undefined
    expect(sortFromChange({ columnKey: 'name', order: undefined })).toBeNull();
    expect(sortOrderOf({ key: 'name', order: 'descend' }, 'name')).toBe(
      'descend',
    );
    expect(sortOrderOf({ key: 'name', order: 'descend' }, 'code')).toBeNull();
  });

  it('shows a dash for empty cells', () => {
    expect(cellText('')).toBe('—');
    expect(cellText('  ')).toBe('—');
    expect(cellText(null)).toBe('—');
    expect(cellText(0)).toBe('0');
  });

  it('sums declared column widths for horizontal scrolling', () => {
    expect(scrollX([{ width: 120 }, { width: 80 }, {}])).toBe(200);
    expect(scrollX([{}])).toBe('max-content');
  });

  it('activates a row unless the click came from a control inside it', () => {
    const onActivate = vi.fn();
    const handlers = rowClick(onActivate)({ id: 1 });
    const cell = document.createElement('td');
    const button = document.createElement('button');
    cell.append(button);

    handlers.onClick({ target: button } as unknown as MouseEvent);
    expect(onActivate).not.toHaveBeenCalled();

    handlers.onClick({ target: cell } as unknown as MouseEvent);
    expect(onActivate).toHaveBeenCalledWith({ id: 1 });
  });
});
