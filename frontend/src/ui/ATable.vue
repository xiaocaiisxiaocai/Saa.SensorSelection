<script setup lang="ts" generic="T">
import { computed, nextTick, ref, watch } from 'vue';

import AEmptyState from './AEmptyState.vue';
import ASpinner from './ASpinner.vue';
import ATooltip from './ATooltip.vue';
import type { TableColumn, TableRowHeight } from './types';

const props = withDefaults(
  defineProps<{
    columns: TableColumn[];
    rows: T[];
    rowKey: string | ((row: T) => string | number);
    emptyText?: string;
    loading?: boolean;
    striped?: boolean;
    rowHeight?: TableRowHeight;
  }>(),
  {
    emptyText: '暂无数据',
    striped: false,
    rowHeight: 'compact',
  },
);

const emit = defineEmits<{
  activate: [row: T];
}>();

const selectedKey = defineModel<string | number | null>('selectedKey', {
  default: null,
});

const scroller = ref<HTMLElement | null>(null);
const scrolled = ref(false);
const focusedKey = ref<string | number | null>(null);

function rowId(row: T): string | number {
  const key = props.rowKey;
  const value =
    typeof key === 'function'
      ? key(row)
      : (row as Record<PropertyKey, unknown>)[key as PropertyKey];
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }

  return String(value);
}

function cellValue(row: T, column: TableColumn): unknown {
  return (row as Record<string, unknown>)[column.key];
}

function cellText(row: T, column: TableColumn): string {
  const value = cellValue(row, column);
  if (value == null) {
    return '';
  }

  return String(value);
}

function displayText(row: T, column: TableColumn): string {
  return cellText(row, column).trim() || '—';
}

function isActionColumn(column: TableColumn): boolean {
  return column.key === 'actions' || column.fixed === 'end';
}

const hoverTip = ref('');

function onEllipsisEnter(event: Event) {
  const text = (event.currentTarget as HTMLElement).innerText.trim();
  hoverTip.value = !text || text === '—' ? '' : text;
}

function cellStyle(column: TableColumn) {
  const size = column.width ?? column.minWidth;
  if (size == null) return undefined;
  return { width: `${size}px` };
}

const ids = computed(() => props.rows.map((row) => rowId(row)));

function focusRow(key: string | number) {
  focusedKey.value = key;
  void nextTick(() => {
    const row = scroller.value?.querySelector<HTMLElement>(
      `[data-row-key="${String(key).replace(/"/g, '')}"]`,
    );
    row?.focus();
  });
}

function onRowClick(row: T) {
  const key = rowId(row);
  selectedKey.value = key;
  focusedKey.value = key;
}

function onRowKeydown(event: KeyboardEvent, row: T) {
  const index = ids.value.indexOf(rowId(row));
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    const next = ids.value[index + 1];
    if (next != null) {
      focusRow(next);
    }
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    const prev = ids.value[index - 1];
    if (prev != null) {
      focusRow(prev);
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    selectedKey.value = rowId(row);
    emit('activate', row);
  }
}

function onScroll() {
  scrolled.value = (scroller.value?.scrollTop ?? 0) > 0;
}

watch(
  ids,
  (next) => {
    if (focusedKey.value == null || !next.includes(focusedKey.value)) {
      focusedKey.value = next[0] ?? null;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div
    ref="scroller"
    class="a-table"
    :class="{
      'a-table--scrolled': scrolled,
      'a-table--loose': rowHeight === 'loose',
      'a-table--striped': striped,
    }"
    :aria-busy="loading ? true : undefined"
    @scroll="onScroll"
  >
    <table>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            scope="col"
            :class="[
              `a-table__cell--${column.align ?? 'center'}`,
              { 'a-table__cell--fixed': column.fixed === 'end' },
            ]"
            :style="cellStyle(column)"
          >
            <ATooltip :content="column.label" :disabled="column.label.length < 6">
              <template #trigger>
                <span class="a-table__ellipsis">{{ column.label }}</span>
              </template>
            </ATooltip>
          </th>
        </tr>
      </thead>
      <tbody v-if="rows.length">
        <tr
          v-for="row in rows"
          :key="rowId(row)"
          :data-row-key="rowId(row)"
          :class="{ 'a-table__row--selected': selectedKey === rowId(row) }"
          :tabindex="focusedKey === rowId(row) ? 0 : -1"
          @click="onRowClick(row)"
          @keydown="onRowKeydown($event, row)"
        >
          <td
            v-for="column in columns"
            :key="column.key"
            :class="[
              `a-table__cell--${column.align ?? 'center'}`,
              {
                'a-table__cell--fixed': column.fixed === 'end',
                'a-table__cell--mono': column.mono,
              },
            ]"
            :style="cellStyle(column)"
          >
            <slot
              v-if="isActionColumn(column)"
              :name="`cell-${column.key}`"
              :row="row"
              :column="column"
              :value="cellValue(row, column)"
            />
            <ATooltip
              v-else
              :content="hoverTip"
              :disabled="!hoverTip"
            >
              <template #trigger>
                <div class="a-table__ellipsis" @mouseenter="onEllipsisEnter">
                  <slot
                    :name="`cell-${column.key}`"
                    :row="row"
                    :column="column"
                    :value="cellValue(row, column)"
                  >
                    {{ displayText(row, column) }}
                  </slot>
                </div>
              </template>
            </ATooltip>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!rows.length && !loading" class="a-table__empty">
      <slot name="empty">
        <AEmptyState :title="emptyText" />
      </slot>
    </div>
    <div v-if="loading" class="a-table__loading">
      <ASpinner :size="24" />
    </div>
  </div>
</template>

<style scoped>
.a-table {
  position: relative;
  min-width: 0;
  overflow: hidden auto;
  background: var(--bg-content);
}

table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}

th,
td {
  height: var(--row-height);
  padding: 0 var(--space-3);
  overflow: hidden;
  font: var(--text-control);
  color: var(--label);
  text-align: center;
  white-space: nowrap;
  vertical-align: middle;
  box-shadow: inset 0 -0.5px 0 var(--separator);
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  font: var(--text-control-em);
  color: var(--label-2);
  background: var(--bg-content);
}

.a-table--scrolled th {
  box-shadow:
    var(--shadow-1),
    inset 0 -0.5px 0 var(--separator);
}

.a-table--loose th,
.a-table--loose td {
  height: var(--row-height-loose);
}

tbody tr {
  cursor: default;
  transition: background-color var(--dur-1) var(--ease-out);
}

tbody tr:hover {
  background: var(--fill-4);
}

.a-table--striped tbody tr:nth-child(even) {
  background: var(--fill-4);
}

.a-table__row--selected,
.a-table__row--selected:hover {
  background: var(--sys-blue-fill);
}

.a-table__cell--start {
  text-align: start;
}

.a-table__cell--center {
  text-align: center;
}

.a-table__cell--end {
  text-align: end;
}

.a-table__cell--mono {
  font-family: var(--font-mono);
}

.a-table__cell--fixed {
  position: sticky;
  right: 0;
  z-index: 1;
  overflow: hidden;
  white-space: nowrap;
  background: var(--bg-content);
  box-shadow:
    inset 0.5px 0 0 var(--separator),
    inset 0 -0.5px 0 var(--separator);
}

.a-table__cell--fixed::before {
  position: absolute;
  top: 0;
  bottom: 0.5px;
  left: calc(var(--space-3) * -1);
  width: var(--space-3);
  pointer-events: none;
  content: '';
  background: linear-gradient(to right, transparent, var(--bg-content));
}

th.a-table__cell--fixed {
  z-index: 2;
}

.a-table__row--selected .a-table__cell--fixed,
tbody tr:hover .a-table__cell--fixed,
.a-table--striped tbody tr:nth-child(even) .a-table__cell--fixed {
  background: inherit;
}

.a-table__ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a-table__empty {
  min-height: calc(var(--space-9) * 5);
}

.a-table__loading {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  background: var(--fill-1);
}

@media (prefers-reduced-motion: reduce) {
  tbody tr {
    transition: none;
  }
}
</style>
