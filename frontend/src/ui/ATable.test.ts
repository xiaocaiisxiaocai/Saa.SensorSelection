import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import ATable from './ATable.vue';
import ATooltip from './ATooltip.vue';
import type { TableColumn } from './types';

const tableSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ATable.vue'),
  'utf8',
);

interface SensorRow {
  id: string;
  model: string;
  note: string;
}

const columns: TableColumn[] = [
  { key: 'model', label: '型号', mono: true },
  { key: 'note', label: '说明', ellipsis: true },
  { key: 'actions', label: '操作', fixed: 'end' },
];

const rows: SensorRow[] = [
  { id: '1', model: 'E3Z-D61', note: '漫反射' },
  { id: '2', model: 'PZ-G41', note: '对射' },
];

describe('ATable', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a labelled data table', () => {
    const wrapper = mount(ATable, {
      props: { columns, rows, rowKey: 'id' },
    });

    expect(wrapper.get('table')).toBeTruthy();
    expect(wrapper.get('.a-table').classes()).toContain('a-table');
    expect(wrapper.get('th').attributes('scope')).toBe('col');
    expect(wrapper.get('th').classes()).toContain('a-table__cell--start');
    expect(wrapper.get('td').classes()).toContain('a-table__cell--start');
    expect(wrapper.get('td .a-table__ellipsis').text()).toContain('E3Z-D61');
    expect(wrapper.text()).toContain('型号');
    expect(wrapper.text()).toContain('E3Z-D61');
  });

  it('wraps body content while keeping table headers on one line', () => {
    const wrapper = mount(ATable, {
      attachTo: document.body,
      props: { columns, rows, rowKey: 'id' },
    });

    expect(wrapper.get('thead .a-table__ellipsis').classes()).toContain(
      'a-table__header-content',
    );
    expect(wrapper.get('tbody .a-table__ellipsis').classes()).toContain(
      'a-table__body-content',
    );

    wrapper.unmount();
  });

  it('uses start alignment when a column requests it', () => {
    const wrapper = mount(ATable, {
      props: {
        columns: [{ key: 'model', label: '型号', align: 'start' }],
        rows,
        rowKey: 'id',
      },
    });

    expect(wrapper.get('th').classes()).toContain('a-table__cell--start');
    expect(wrapper.get('td').classes()).toContain('a-table__cell--start');
  });

  it('keeps declared column widths instead of crushing text on narrow screens', () => {
    const wrapper = mount(ATable, {
      props: {
        columns: [
          { key: 'model', label: '型号', width: 100 },
          { key: 'note', label: '说明', minWidth: 220 },
          { key: 'actions', label: '操作' },
        ],
        rows,
        rowKey: 'id',
      },
    });

    expect(wrapper.get('table').attributes('style')).toContain(
      'min-width: 440px',
    );
  });

  it('keeps a fixed-start identity column visible during horizontal scrolling', () => {
    const wrapper = mount(ATable, {
      props: {
        columns: [
          { key: 'model', label: '型号', fixed: 'start' },
          { key: 'note', label: '说明', minWidth: 400 },
        ],
        rows,
        rowKey: 'id',
      },
    });

    expect(wrapper.get('th').classes()).toContain('a-table__cell--fixed-start');
    expect(wrapper.get('td').classes()).toContain('a-table__cell--fixed-start');
  });

  it('ignores fixed-start on non-leading columns to prevent overlap', () => {
    const wrapper = mount(ATable, {
      props: {
        columns: [
          { key: 'note', label: '说明' },
          { key: 'model', label: '型号', fixed: 'start' },
        ],
        rows,
        rowKey: 'id',
      },
    });

    expect(wrapper.findAll('th')[1]?.classes()).not.toContain(
      'a-table__cell--fixed-start',
    );
    expect(wrapper.findAll('td')[1]?.classes()).not.toContain(
      'a-table__cell--fixed-start',
    );
  });

  it('releases fixed columns on narrow screens', () => {
    expect(tableSource).toMatch(
      /@media \(width <= 40rem\)[\s\S]*\.a-table__cell--fixed\s*\{[^}]*position:\s*static;/s,
    );
  });

  it('renders a custom cell slot', () => {
    const wrapper = mount(ATable, {
      props: { columns, rows, rowKey: 'id' },
      slots: {
        'cell-model': (props: { row: unknown }) =>
          `#${(props.row as SensorRow).model}`,
      },
    });

    expect(wrapper.text()).toContain('#E3Z-D61');
  });

  it('shows the full custom cell text when a nested element is truncated', async () => {
    const fullSpec =
      'OMRON E3Z-D61 · 检测距离 0~300mm；12~24V DC；PNP/NPN；IP67';
    const wrapper = mount(ATable, {
      props: {
        columns: [{ key: 'spec', label: '规格', ellipsis: true }],
        rows: [{ id: '1', spec: fullSpec }],
        rowKey: 'id',
      },
      slots: {
        'cell-spec': (props: { value: unknown }) =>
          h('div', { class: 'spec-lines' }, String(props.value)),
      },
    });

    const cell = wrapper.findAll('.a-table__ellipsis')[1];
    expect(cell).toBeTruthy();
    if (!cell) return;
    const nestedContent = cell.get('.spec-lines').element;
    Object.defineProperty(cell.element, 'clientWidth', {
      value: 244,
      configurable: true,
    });
    Object.defineProperty(cell.element, 'scrollWidth', {
      value: 244,
      configurable: true,
    });
    Object.defineProperty(nestedContent, 'clientWidth', {
      value: 244,
      configurable: true,
    });
    Object.defineProperty(nestedContent, 'scrollWidth', {
      value: 430,
      configurable: true,
    });

    await cell.trigger('mouseenter');
    await nextTick();

    const tooltip = wrapper.findAllComponents(ATooltip)[1];
    expect(tooltip?.props('content')).toBe(fullSpec);
    expect(tooltip?.props('disabled')).toBe(false);
  });

  it('supports row-spanned cells while keeping detail cells on each physical row', () => {
    const groupedRows = [
      { id: '1-a', group: '进板检测', detail: '漫反射' },
      { id: '1-b', group: '进板检测', detail: '对射' },
    ];
    const wrapper = mount(ATable, {
      props: {
        columns: [
          {
            key: 'group',
            label: '功能作用',
            rowSpan: (_row, index) => (index === 0 ? 2 : 0),
          },
          { key: 'detail', label: '传感器类型' },
        ],
        rows: groupedRows,
        rowKey: 'id',
      },
    });

    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    expect(
      wrapper.findAll('tbody tr')[0]?.find('td')?.attributes('rowspan'),
    ).toBe('2');
    expect(wrapper.findAll('tbody tr')[1]?.findAll('td')).toHaveLength(1);
    expect(wrapper.text()).toContain('漫反射');
    expect(wrapper.text()).toContain('对射');
  });

  it('shows an empty state when there are no rows', () => {
    const wrapper = mount(ATable, {
      props: { columns, rows: [], rowKey: 'id', emptyText: '暂无型号' },
    });

    expect(wrapper.text()).toContain('暂无型号');
    expect(wrapper.find('tbody tr').exists()).toBe(false);
  });

  it('marks the table busy while loading', () => {
    const wrapper = mount(ATable, {
      props: { columns, rows, rowKey: 'id', loading: true },
    });

    expect(wrapper.get('.a-table').attributes('aria-busy')).toBe('true');
    expect(wrapper.find('.a-spinner').exists()).toBe(true);
  });

  it('moves row focus with the arrow keys', async () => {
    const wrapper = mount(ATable, {
      attachTo: document.body,
      props: { columns, rows, rowKey: 'id' },
    });

    const first = wrapper.get('tbody tr');
    await first.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();

    const bodyRows = wrapper.findAll('tbody tr');
    expect(document.activeElement).toBe(bodyRows[1]?.element);

    wrapper.unmount();
  });

  it('announces and exposes keyboard scrolling when columns overflow', async () => {
    const wrapper = mount(ATable, {
      attachTo: document.body,
      props: { columns, rows, rowKey: 'id' },
    });
    const scroller = wrapper.get('.a-table');
    Object.defineProperty(scroller.element, 'clientWidth', {
      value: 320,
      configurable: true,
    });
    Object.defineProperty(scroller.element, 'scrollWidth', {
      value: 720,
      configurable: true,
    });

    await scroller.trigger('scroll');
    expect(scroller.attributes('tabindex')).toBe('0');
    expect(scroller.attributes('aria-label')).toContain('横向滚动');
    expect(scroller.classes()).toContain('a-table--overflow-end');

    await scroller.trigger('keydown', { key: 'ArrowRight' });
    expect(scroller.element.scrollLeft).toBeGreaterThan(0);
    wrapper.unmount();
  });
  it('renders only the visible window of rows when virtual=true', async () => {
    // 生成 100 行数据
    const manyRows = Array.from({ length: 100 }, (_, i) => ({
      id: String(i + 1),
      model: `Sensor-${i + 1}`,
      note: `说明${i + 1}`,
    }));

    const wrapper = mount(ATable, {
      attachTo: document.body,
      props: { columns, rows: manyRows, rowKey: 'id', virtual: true },
    });

    // JSDOM 中 clientHeight 默认为 0，需要模拟容器高度。
    Object.defineProperty(wrapper.element, 'clientHeight', {
      value: 160,
      configurable: true,
    });
    // 触发 ResizeObserver 回调（JSDOM 不实现 ResizeObserver，直接注入值）
    // 通过模拟 scrollTop=0，验证默认只渲染 start..end 范围
    await nextTick();

    // virtual=true 时，visibleRows 应远小于 100
    const dataRows = wrapper.findAll('tbody tr:not(.a-table__spacer)');
    // OVERSCAN=5，containerHeight=0 时 visibleCount=0，因此 end = min(100, 0+0+10) = 10
    expect(dataRows.length).toBeLessThan(manyRows.length);
    expect(dataRows.length).toBeLessThanOrEqual(10 + 5); // overscan 窗口

    // 底部占位行应存在（总行数 - 渲染行数 > 0）
    expect(wrapper.find('.a-table__spacer').exists()).toBe(true);

    wrapper.unmount();
  });
});
