import { h, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import {
  cellText,
  columnFilter,
  columnFilterValues,
  isColumnFilterChange,
  rowClick,
  scrollX,
  setColumnFilter,
  PAGINATION_PROPS,
  useTablePagination,
} from './table';

describe('table helpers', () => {
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

  it('builds a controlled header filter and ignores a repeated selection', () => {
    const idle = columnFilter({
      options: [
        { label: '现用', value: '现用' },
        { label: '备选', value: '备选' },
      ],
      value: [],
    });
    expect(idle.filteredValue).toBeNull();
    expect(idle.filterMultiple).toBe(true);
    expect('filterSearch' in idle).toBe(false);

    const active = columnFilter({
      options: [{ label: '登录', value: 'auth.login' }],
      value: ['auth.login'],
      multiple: false,
      search: true,
    });
    expect(active.filteredValue).toEqual(['auth.login']);
    expect(active.filterMultiple).toBe(false);
    expect(active.filterSearch).toBe(true);
    expect(
      columnFilterValues({ action: active.filteredValue }, 'action'),
    ).toEqual(['auth.login']);
    expect(columnFilterValues({ action: null }, 'missing')).toEqual([]);
    expect(columnFilterValues(undefined, 'action')).toEqual([]);
    expect(isColumnFilterChange({ action: 'filter' })).toBe(true);
    expect(isColumnFilterChange({ action: 'paginate' })).toBe(false);
    expect(isColumnFilterChange(undefined)).toBe(false);

    const current = ref(['现用']);
    const same = current.value;
    setColumnFilter(current, ['现用']);
    expect(current.value).toBe(same);
    setColumnFilter(current, ['备选', '停用']);
    expect(current.value).toEqual(['备选', '停用']);
  });

  it('drives a-list paging through the config callback', () => {
    const { page, pageSize, listPagination } = useTablePagination(() => 100);

    listPagination.value.onChange(2, 20);
    expect(page.value).toBe(2);
    listPagination.value.onChange(2, 50);
    expect([page.value, pageSize.value]).toEqual([1, 50]);
  });
});
