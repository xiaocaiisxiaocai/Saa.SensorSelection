import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import ATable from './ATable.vue';
import type { TableColumn } from './types';

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
    expect(wrapper.get('th').classes()).toContain('a-table__cell--center');
    expect(wrapper.get('td').classes()).toContain('a-table__cell--center');
    expect(wrapper.get('td .a-table__ellipsis').text()).toContain('E3Z-D61');
    expect(wrapper.text()).toContain('型号');
    expect(wrapper.text()).toContain('E3Z-D61');
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
});
