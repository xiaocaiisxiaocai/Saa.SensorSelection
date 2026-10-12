import { h, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import {
  cellText,
  rowClick,
  scrollX,
  sortFromChange,
  sortOrderOf,
  PAGINATION_PROPS,
  sortRows,
  useTablePagination,
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

describe('useTablePagination', () => {
  it('always shows the pagination bar, even for a single page', () => {
    const { pagination } = useTablePagination(() => 3);

    expect(pagination.value).toMatchObject({
      current: 1,
      pageSize: 20,
      total: 3,
      showSizeChanger: true,
    });
    expect(pagination.value.showTotal?.(3, [1, 3])).toBe('共 3 条');
  });

  it('returns to the first page when a filter changes', async () => {
    const query = ref('');
    const { page, onChange } = useTablePagination(() => 100, [query]);

    onChange({ current: 3 });
    expect(page.value).toBe(3);
    query.value = 'E3Z';
    await nextTick();
    expect(page.value).toBe(1);
  });

  it('goes back to page 1 when the page size changes', () => {
    const { page, pageSize, onChange } = useTablePagination(() => 100);

    onChange({ current: 4 });
    onChange({ current: 4, pageSize: 50 });
    expect(pageSize.value).toBe(50);
    expect(page.value).toBe(1);
  });

  it('pulls the page back when rows disappear', async () => {
    const total = ref(45);
    const { page, onChange } = useTablePagination(() => total.value);

    onChange({ current: 3 });
    total.value = 25;
    await nextTick();
    expect(page.value).toBe(2);
  });

  it('jumps to the page holding a focused row', () => {
    const { page, showIndex } = useTablePagination(() => 100);

    showIndex(45);
    expect(page.value).toBe(3);
    showIndex(-1);
    expect(page.value).toBe(3);
  });

  it('gives the icon-only pager buttons an accessible name', () => {
    const button = h('button', { class: 'ant-pagination-item-link' });
    const render = (type: string) =>
      PAGINATION_PROPS.itemRender({ type, originalElement: button }).props?.[
        'aria-label'
      ];

    expect(render('prev')).toBe('上一页');
    expect(render('next')).toBe('下一页');
    expect(render('page')).toBeUndefined();
  });

  it('drives a-list paging through the config callback', () => {
    const { page, pageSize, listPagination } = useTablePagination(() => 100);

    listPagination.value.onChange(2, 20);
    expect(page.value).toBe(2);
    listPagination.value.onChange(2, 50);
    expect([page.value, pageSize.value]).toEqual([1, 50]);
  });
});
