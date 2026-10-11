import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';

import ATable from './ATable.vue';
import type { TableColumn, TableSortState } from './types';

function mountTable<T>(options: {
  props: {
    columns: TableColumn<T>[];
    rows: T[];
    rowKey: string | ((row: T) => string | number);
    emptyText?: string;
    loading?: boolean;
    striped?: boolean;
    rowHeight?: 'compact' | 'loose';
    virtual?: boolean;
    selectedKey?: string | number | null;
    sort?: TableSortState | null;
  };
  slots?: object;
}) {
  // vue-test-utils instantiates the generic SFC as unknown, which rejects
  // TableColumn<T> under strictFunctionTypes. The helper keeps that check.
  return mount(ATable, options as never);
}

interface SensorRow {
  id: string;
  model: string;
  note?: string | null;
  group?: string;
  detail?: string;
  actions?: string;
}

const columns: TableColumn<SensorRow>[] = [
  { key: 'model', label: '型号' },
  { key: 'note', label: '说明' },
  { key: 'actions', label: '操作', fixed: 'end' },
];

const rows: SensorRow[] = [
  { id: '1', model: 'E3Z-D61', note: '漫反射' },
  { id: '2', model: 'PZ-G41', note: '对射' },
];

function antTable(wrapper: ReturnType<typeof mount>) {
  const match = wrapper
    .findAllComponents({ name: 'ATable' })
    .find((item) => {
      const first = (item.props('columns') as { title?: string }[] | undefined)?.[0];
      return Boolean(first && 'title' in first);
    });
  if (!match) throw new Error('ant table not found');
  return match;
}

function columnProps(wrapper: ReturnType<typeof mount>) {
  return antTable(wrapper).props('columns') as Array<{
    title: string;
    dataIndex: string;
    key: string;
    width?: number;
    align?: string;
    fixed?: string;
    sorter?: boolean;
    sortOrder?: 'ascend' | 'descend' | null;
    customCell?: (row: SensorRow, index?: number) => { rowSpan?: number };
    customHeaderCell?: () => { style?: Record<string, string> };
  }>;
}

function dataRows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('tbody tr.ant-table-row');
}

describe('ATable', () => {
  it('renders labelled columns and row text in an ant table', () => {
    const wrapper = mountTable( {
      props: { columns, rows, rowKey: 'id' },
    });

    expect(wrapper.get('.a-table').classes()).toContain('a-table');
    expect(wrapper.find('table').exists()).toBe(true);
    expect(wrapper.text()).toContain('型号');
    expect(wrapper.text()).toContain('E3Z-D61');
    expect(wrapper.text()).toContain('对射');
    expect(antTable(wrapper).props('pagination')).toBe(false);
    expect(wrapper.get('.a-table').attributes('aria-busy')).toBeUndefined();

    const rendered = columnProps(wrapper);
    expect(rendered.map((column) => column.title)).toEqual(['型号', '说明', '操作']);
    expect(rendered.map((column) => column.dataIndex)).toEqual([
      'model',
      'note',
      'actions',
    ]);
    expect(rendered[2]?.fixed).toBe('right');
  });

  it('maps alignment, width, minWidth, and fixed edges onto ant columns', () => {
    const wrapper = mountTable( {
      props: {
        columns: [
          { key: 'model', label: '型号', width: 100, align: 'end', fixed: 'start' },
          { key: 'note', label: '说明', minWidth: 220, align: 'center' },
          { key: 'actions', label: '操作', align: 'start', fixed: 'end' },
        ],
        rows,
        rowKey: 'id',
      },
    });

    const rendered = columnProps(wrapper);
    expect(rendered[0]).toMatchObject({
      width: 100,
      align: 'right',
      fixed: 'left',
    });
    // minWidth 列不写 width，只在表头单元格上设 min-width，让它吸收多余宽度。
    expect(rendered[1]).toMatchObject({ align: 'center' });
    expect(rendered[1]?.width).toBeUndefined();
    expect(rendered[1]?.customHeaderCell?.().style).toEqual({
      minWidth: '220px',
    });
    expect(rendered[1]?.fixed).toBeUndefined();
    expect(rendered[2]).toMatchObject({ align: 'left', fixed: 'right' });
  });

  it('renders a custom cell slot with the row', () => {
    const wrapper = mountTable( {
      props: { columns, rows, rowKey: 'id' },
      slots: {
        'cell-model': ({ row }: { row: SensorRow }) => `#${row.model}`,
        'cell-note': ({ value }: { value: unknown }) => `值:${String(value)}`,
      },
    });

    expect(wrapper.text()).toContain('#E3Z-D61');
    expect(wrapper.text()).toContain('#PZ-G41');
    expect(wrapper.text()).toContain('值:漫反射');
    expect(wrapper.text()).toContain('值:对射');
  });

  it('renders an em dash for null and blank cells', () => {
    const wrapper = mountTable( {
      props: {
        columns: [
          { key: 'model', label: '型号' },
          { key: 'note', label: '说明' },
          { key: 'missing', label: '缺失' },
        ],
        rows: [{ id: '1', model: '', note: '   ' }],
        rowKey: 'id',
      },
    });

    const cells = dataRows(wrapper)[0]?.findAll('td') ?? [];
    expect(cells.map((cell) => cell.text())).toEqual(['—', '—', '—']);
  });

  it('shows the default empty text, or the empty slot when one is provided', () => {
    const defaults = mountTable( {
      props: { columns, rows: [], rowKey: 'id' },
    });
    expect(defaults.text()).toContain('暂无数据');
    expect(defaults.getComponent({ name: 'AEmpty' }).props('description')).toBe(
      '暂无数据',
    );
    expect(dataRows(defaults)).toHaveLength(0);

    const custom = mountTable( {
      props: { columns, rows: [], rowKey: 'id', emptyText: '暂无型号' },
      slots: { empty: '<p class="custom-empty">没有型号</p>' },
    });
    expect(custom.get('.custom-empty').text()).toBe('没有型号');
    expect(custom.findComponent({ name: 'AEmpty' }).exists()).toBe(false);
    expect(custom.text()).not.toContain('暂无型号');
  });

  it('marks the table busy while loading', () => {
    const wrapper = mountTable( {
      props: { columns, rows, rowKey: 'id', loading: true },
    });

    expect(wrapper.get('.a-table').attributes('aria-busy')).toBe('true');
    expect(antTable(wrapper).props('loading')).toBe(true);
    expect(wrapper.find('.ant-spin-spinning').exists()).toBe(true);
  });

  it('sorts through ascending, descending, and cleared using the sort model', async () => {
    const sortable: TableColumn<SensorRow>[] = [
      { key: 'model', label: '型号', sortable: true },
      { key: 'note', label: '说明', sortable: true },
    ];
    const unsorted: SensorRow[] = [
      { id: '1', model: 'PZ-G41', note: '对射' },
      { id: '2', model: 'E3Z-D61', note: '漫反射' },
    ];
    const wrapper = mountTable( {
      props: { columns: sortable, rows: unsorted, rowKey: 'id' },
    });
    const header = () => {
      const cell = wrapper
        .findAll('th.ant-table-column-has-sorters')
        .find((item) => item.text().includes('型号'));
      if (!cell) throw new Error('sortable model header not found');
      return cell;
    };
    const models = () => dataRows(wrapper).map((row) => row.findAll('td')[0]?.text());

    await header().trigger('click');
    await nextTick();
    expect(wrapper.emitted('update:sort')?.[0]).toEqual([
      { key: 'model', direction: 'ascending' },
    ]);
    expect(models()).toEqual(['E3Z-D61', 'PZ-G41']);
    expect(header().attributes('aria-sort')).toBe('ascending');
    expect(columnProps(wrapper)[0]?.sortOrder).toBe('ascend');

    await header().trigger('click');
    await nextTick();
    expect(wrapper.emitted('update:sort')?.[1]).toEqual([
      { key: 'model', direction: 'descending' },
    ]);
    expect(models()).toEqual(['PZ-G41', 'E3Z-D61']);
    expect(header().attributes('aria-sort')).toBe('descending');

    await header().trigger('click');
    await nextTick();
    expect(wrapper.emitted('update:sort')?.[2]).toEqual([null]);
    expect(models()).toEqual(['PZ-G41', 'E3Z-D61']);
    expect(header().attributes('aria-sort')).toBe('none');
  });

  it('keeps a controlled sort and ignores a sort key that is not a column', () => {
    const sortable: TableColumn<SensorRow>[] = [
      { key: 'model', label: '型号', sortable: true },
      { key: 'note', label: '说明' },
    ];
    const unsorted: SensorRow[] = [
      { id: '1', model: 'PZ-G41', note: '对射' },
      { id: '2', model: 'E3Z-D61', note: '漫反射' },
    ];
    const sorted = mountTable( {
      props: {
        columns: sortable,
        rows: unsorted,
        rowKey: 'id',
        sort: { key: 'model', direction: 'descending' },
      },
    });
    expect(dataRows(sorted).map((row) => row.findAll('td')[0]?.text())).toEqual([
      'PZ-G41',
      'E3Z-D61',
    ]);

    const unknown = mountTable( {
      props: {
        columns: sortable,
        rows: unsorted,
        rowKey: 'id',
        sort: { key: 'missing', direction: 'ascending' },
      },
    });
    expect(dataRows(unknown).map((row) => row.findAll('td')[0]?.text())).toEqual([
      'PZ-G41',
      'E3Z-D61',
    ]);
  });

  it('passes rowSpan through customCell and ignores sorting while a span column exists', () => {
    const spanned: TableColumn<SensorRow>[] = [
      {
        key: 'group',
        label: '功能作用',
        sortable: true,
        rowSpan: (_row, index) => (index === 0 ? 2 : 0),
      },
      { key: 'detail', label: '传感器类型', sortable: true },
    ];
    const grouped: SensorRow[] = [
      { id: '1-a', model: '', group: '进板检测', detail: 'b' },
      { id: '1-b', model: '', group: '进板检测', detail: 'a' },
    ];
    const wrapper = mountTable( {
      props: {
        columns: spanned,
        rows: grouped,
        rowKey: 'id',
        sort: { key: 'detail', direction: 'ascending' },
      },
    });

    const rendered = columnProps(wrapper);
    expect(rendered.every((column) => column.sorter === false)).toBe(true);
    expect(wrapper.find('th.ant-table-column-has-sorters').exists()).toBe(false);
    expect(rendered[0]?.customCell?.(grouped[0]!, 0)).toEqual({ rowSpan: 2 });
    expect(rendered[0]?.customCell?.(grouped[1]!, 1)).toEqual({ rowSpan: 0 });
    expect(
      rendered[0]?.customCell?.(grouped[0]!, undefined),
    ).toEqual({});

    const body = dataRows(wrapper);
    expect(body).toHaveLength(2);
    expect(body[0]?.find('td').attributes('rowspan')).toBe('2');
    expect(body[0]?.text()).toContain('进板检测');
    expect(body[0]?.text()).toContain('b');
    expect(body[1]?.text()).toContain('a');
    expect(body[1]?.text()).not.toContain('进板检测');

    const invalid: TableColumn<SensorRow>[] = [
      { key: 'group', label: '功能作用', rowSpan: () => -1 },
      { key: 'detail', label: '传感器类型', rowSpan: () => 1.5 },
    ];
    const rejected = mountTable( {
      props: {
        columns: invalid,
        rows: grouped,
        rowKey: 'id',
      },
    });
    const rejectedColumns = columnProps(rejected);
    expect(rejectedColumns[0]?.customCell?.(grouped[0]!, 0)).toEqual({ rowSpan: 1 });
    expect(rejectedColumns[1]?.customCell?.(grouped[0]!, 0)).toEqual({ rowSpan: 1 });
  });

  it('activates a row click and marks the selected row', async () => {
    const wrapper = mountTable( {
      props: {
        columns,
        rows,
        rowKey: (row: SensorRow) => row.id,
      },
    });

    await dataRows(wrapper)[1]?.trigger('click');
    await nextTick();

    expect(wrapper.emitted('activate')?.[0]).toEqual([rows[1]]);
    expect(wrapper.emitted('update:selectedKey')?.[0]).toEqual(['2']);
    expect(dataRows(wrapper)[1]?.classes()).toContain('a-table__row--selected');
    expect(dataRows(wrapper)[0]?.classes()).not.toContain('a-table__row--selected');
  });

  it('keeps a controlled selected key on the matching row', () => {
    const wrapper = mountTable( {
      props: { columns, rows, rowKey: 'id', selectedKey: '1' },
    });

    expect(dataRows(wrapper)[0]?.classes()).toContain('a-table__row--selected');
    expect(dataRows(wrapper)[1]?.classes()).not.toContain('a-table__row--selected');
  });

  it('does not activate a row when the click is inside an interactive control', async () => {
    const wrapper = mountTable( {
      props: { columns, rows, rowKey: 'id' },
      slots: {
        'cell-actions': () =>
          h('div', [
            h('button', { type: 'button', class: 'row-button' }, '删除'),
            h('a', { href: '#detail', class: 'row-link' }, '链接'),
            h('input', { class: 'row-input' }),
            h('textarea', { class: 'row-textarea' }),
            h('select', { class: 'row-select' }, [h('option', 'A')]),
            h('span', { role: 'button', class: 'row-role' }, '更多'),
          ]),
      },
    });

    for (const selector of [
      '.row-button',
      '.row-link',
      '.row-input',
      '.row-textarea',
      '.row-select',
      '.row-role',
    ]) {
      await dataRows(wrapper)[0]?.get(selector).trigger('click');
    }
    await nextTick();

    expect(wrapper.emitted('activate')).toBeUndefined();
    expect(wrapper.emitted('update:selectedKey')).toBeUndefined();
    expect(dataRows(wrapper)[0]?.classes()).not.toContain('a-table__row--selected');
  });

  it('passes striped, compact, and virtual options through', () => {
    const wrapper = mountTable( {
      props: {
        columns,
        rows,
        rowKey: 'id',
        striped: true,
        rowHeight: 'compact',
        virtual: true,
      },
    });

    expect(wrapper.get('.a-table').attributes('data-striped')).toBe('');
    const table = antTable(wrapper);
    expect(table.props('size')).toBe('small');
    // ant-design-vue 4 has no virtual prop; the flag only enables a fixed body height.
    expect(table.props('scroll')).toEqual({ x: 'max-content', y: 480 });
  });

  it('scrolls horizontally from the declared column widths so flexible columns wrap', () => {
    const wrapper = mountTable({
      props: {
        columns: [
          { key: 'model', label: '型号', width: 120 },
          { key: 'note', label: '说明', minWidth: 240 },
          { key: 'actions', label: '操作', width: 96, fixed: 'end' },
        ],
        rows,
        rowKey: 'id',
      },
    });

    expect(antTable(wrapper).props('scroll')).toEqual({ x: 456, y: undefined });
    expect(antTable(wrapper).props('tableLayout')).toBe('auto');
  });
});
