<script setup lang="ts" generic="T">
import { Table as AntTable, type TableColumnType } from 'ant-design-vue';
import { computed, useSlots } from 'vue';

import { sortRows } from './table-sort';
import type { TableColumn, TableRowHeight, TableSortState } from './types';

const props = withDefaults(
  defineProps<{
    columns: TableColumn<T>[];
    rows: T[];
    rowKey: string | ((row: T) => string | number);
    emptyText?: string;
    loading?: boolean;
    striped?: boolean;
    rowHeight?: TableRowHeight;
    virtual?: boolean;
    storageKey?: string;
  }>(),
  {
    emptyText: '暂无数据',
    striped: false,
    rowHeight: 'loose',
    virtual: false,
  },
);

const emit = defineEmits<{
  activate: [row: T];
}>();

const selectedKey = defineModel<string | number | null>('selectedKey', {
  default: null,
});
const sort = defineModel<TableSortState | null>('sort', { default: null });
const slots = useSlots();

function rowId(row: T): string | number {
  const key = props.rowKey;
  const value =
    typeof key === 'function'
      ? key(row)
      : (row as Record<PropertyKey, unknown>)[key as PropertyKey];
  if (typeof value === 'string' || typeof value === 'number') return value;
  return String(value);
}

const hasRowSpanColumn = computed(() =>
  props.columns.some((column) => Boolean(column.rowSpan)),
);

const sortedRows = computed(() => {
  if (hasRowSpanColumn.value || !sort.value) return props.rows;
  if (!props.columns.some((column) => column.key === sort.value?.key)) {
    return props.rows;
  }
  return sortRows(props.rows, sort.value);
});

const antdColumns = computed(() =>
  props.columns.map((column) => {
    const align =
      column.align === 'end'
        ? 'right'
        : column.align === 'center'
          ? 'center'
          : 'left';
    // 只给定宽列写 width。表格是 table-layout:auto + width:max-content，
    // 如果 minWidth 列也写成 width，容器比列宽总和宽时浏览器会把所有列
    // 等比放大（「排序」「ALL」这类短列被撑得很宽）；只留 min-width，
    // 多出来的宽度才会全部分给这些弹性列。
    return {
      title: column.label,
      dataIndex: column.key,
      key: column.key,
      width: column.width,
      align,
      fixed:
        column.fixed === 'start'
          ? 'left'
          : column.fixed === 'end'
            ? 'right'
            : undefined,
      customHeaderCell: () => {
        const sorting = sort.value?.key === column.key;
        return {
          style:
            column.width != null
              ? { width: `${column.width}px` }
              : column.minWidth != null
                ? { minWidth: `${column.minWidth}px` }
                : undefined,
          'aria-sort': !column.sortable
            ? undefined
            : sorting
              ? sort.value?.direction === 'ascending'
                ? 'ascending'
                : 'descending'
              : 'none',
        };
      },
      sorter: Boolean(column.sortable) && !hasRowSpanColumn.value,
      sortOrder:
        sort.value?.key === column.key
          ? sort.value.direction === 'ascending'
            ? 'ascend'
            : 'descend'
          : null,
      customCell: (record: T, index?: number) => {
        if (!column.rowSpan || index == null) return {};
        const span = column.rowSpan(record, index);
        return {
          rowSpan: Number.isInteger(span) && span != null && span >= 0 ? span : 1,
        };
      },
    } satisfies TableColumnType<T>;
  }),
);

// 横向滚动的基准宽度取各列声明宽度之和，而不是 max-content：后者会让弹性列
// 按整段文字的单行宽度撑开（长备注不换行，钻到右侧固定的操作列底下）。
// 容器更宽时 antd 的 min-width:100% 仍会把表格铺满，余量交给弹性列。
// x 为数字时 antd 默认切到 table-layout:fixed（无宽度列平分余量、无视
// min-width），所以模板里显式固定为 auto。
const scrollX = computed(() => {
  const total = props.columns.reduce(
    (sum, column) => sum + (column.width ?? column.minWidth ?? 0),
    0,
  );
  return total > 0 ? total : 'max-content';
});

function cellText(row: T, key: string) {
  const value = (row as Record<string, unknown>)[key];
  if (value == null || String(value).trim() === '') return '—';
  return String(value);
}

function onChange(
  _pagination: unknown,
  _filters: unknown,
  sorter:
    | { columnKey?: unknown; field?: unknown; order?: 'ascend' | 'descend' | null }
    | Array<{ columnKey?: unknown; field?: unknown; order?: 'ascend' | 'descend' | null }>,
) {
  const current = Array.isArray(sorter) ? sorter[0] : sorter;
  if (!current?.order) {
    sort.value = null;
    return;
  }
  const key = String(current.columnKey ?? current.field ?? '');
  if (!key) return;
  sort.value = {
    key,
    direction: current.order === 'ascend' ? 'ascending' : 'descending',
  };
}

function customRow(record: T) {
  return {
    onClick: (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('button, a, input, textarea, select, [role="button"]')) {
        return;
      }
      selectedKey.value = rowId(record);
      emit('activate', record);
    },
  };
}

function rowClassName(record: T) {
  return selectedKey.value === rowId(record) ? 'a-table__row--selected' : '';
}
</script>

<template>
  <div
    class="a-table"
    :aria-busy="loading ? true : undefined"
    :data-striped="striped ? '' : undefined"
  >
    <AntTable
      :columns="antdColumns"
      :custom-row="customRow"
      :data-source="sortedRows"
      :loading="loading"
      :pagination="false"
      :row-class-name="rowClassName"
      :row-key="rowId"
      :scroll="{ x: scrollX, y: virtual ? 480 : undefined }"
      table-layout="auto"
      :size="rowHeight === 'compact' ? 'small' : 'middle'"
      :virtual="virtual"
      @change="onChange"
    >
      <template #bodyCell="{ column, record }">
        <slot
          v-if="slots[`cell-${String(column.key)}`]"
          :name="`cell-${String(column.key)}`"
          :row="(record as T)"
          :column="column"
          :value="(record as Record<string, unknown>)[String(column.key)]"
        />
        <template v-else>{{ cellText(record as T, String(column.key)) }}</template>
      </template>
      <template #emptyText>
        <slot name="empty">
          <a-empty :description="emptyText" />
        </slot>
      </template>
    </AntTable>
  </div>
</template>

<style scoped>
.a-table {
  min-width: 0;
  min-height: 0;
}

.a-table :deep(.ant-table-wrapper) {
  min-width: 0;
}
</style>
