<script setup lang="ts" generic="T">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import AEmptyState from './AEmptyState.vue';
import ASpinner from './ASpinner.vue';
import ATooltip from './ATooltip.vue';
import type { TableColumn, TableRowHeight } from './types';

// 行高常量与 tokens.css 中 --row-height / --row-height-loose 保持同步
const ROW_HEIGHT_COMPACT = 36;
const ROW_HEIGHT_LOOSE = 44;
const DEFAULT_COLUMN_MIN_WIDTH = 120;
/** 虚拟滚动上下各额外预渲染的行数，避免快速滚动时出现空白 */
const OVERSCAN = 5;

const props = withDefaults(
  defineProps<{
    columns: TableColumn<T>[];
    rows: T[];
    rowKey: string | ((row: T) => string | number);
    emptyText?: string;
    loading?: boolean;
    striped?: boolean;
    rowHeight?: TableRowHeight;
    /**
     * 启用虚拟滚动。数据量大（> 200 行）且无 rowSpan 的场景建议开启。
     * 注意：启用后 column.rowSpan 将失效，请勿同时使用。
     */
    virtual?: boolean;
  }>(),
  {
    emptyText: '暂无数据',
    striped: false,
    rowHeight: 'compact',
    virtual: false,
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
const canScrollStart = ref(false);
const canScrollEnd = ref(false);
const focusedKey = ref<string | number | null>(null);

// ─── 虚拟滚动状态 ────────────────────────────────────────────────
const containerHeight = ref(0);
const scrollTop = ref(0);

const unitRowHeight = computed(() =>
  props.rowHeight === 'loose' ? ROW_HEIGHT_LOOSE : ROW_HEIGHT_COMPACT,
);

const tableMinWidth = computed(() =>
  props.columns.reduce(
    (total, column) =>
      total + (column.width ?? column.minWidth ?? DEFAULT_COLUMN_MIN_WIDTH),
    0,
  ),
);

/** 当前可视范围（行下标，左闭右开） */
const virtualRange = computed(() => {
  if (!props.virtual || props.rows.length === 0) {
    return { start: 0, end: props.rows.length };
  }
  const rh = unitRowHeight.value;
  const start = Math.max(0, Math.floor(scrollTop.value / rh) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight.value / rh);
  const end = Math.min(props.rows.length, start + visibleCount + OVERSCAN * 2);
  return { start, end };
});

/** 实际渲染的行切片 */
const visibleRows = computed(() =>
  props.virtual
    ? props.rows.slice(virtualRange.value.start, virtualRange.value.end)
    : props.rows,
);

/** 顶部占位行高度（px） */
const spacerTopHeight = computed(() =>
  props.virtual ? virtualRange.value.start * unitRowHeight.value : 0,
);

/** 底部占位行高度（px） */
const spacerBottomHeight = computed(() =>
  props.virtual
    ? (props.rows.length - virtualRange.value.end) * unitRowHeight.value
    : 0,
);

let resizeObserver: ResizeObserver | null = null;

function setupResizeObserver() {
  if (!props.virtual || !scroller.value) return;
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry) containerHeight.value = entry.contentRect.height;
  });
  resizeObserver.observe(scroller.value);
  containerHeight.value = scroller.value.clientHeight;
}

onMounted(() => {
  if (props.virtual) setupResizeObserver();
  void nextTick(updateOverflowMetrics);
  window.addEventListener('resize', updateOverflowMetrics);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('resize', updateOverflowMetrics);
});

watch(
  () => props.virtual,
  (enabled) => {
    if (enabled) {
      void nextTick(setupResizeObserver);
    } else {
      resizeObserver?.disconnect();
      resizeObserver = null;
    }
  },
);
// ─────────────────────────────────────────────────────────────────

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

function cellValue(row: T, column: TableColumn<T>): unknown {
  return (row as Record<string, unknown>)[column.key];
}

function cellText(row: T, column: TableColumn<T>): string {
  const value = cellValue(row, column);
  if (value == null) {
    return '';
  }

  return String(value);
}

function displayText(row: T, column: TableColumn<T>): string {
  return cellText(row, column).trim() || '—';
}

function tooltipText(row: T, column: TableColumn<T>): string {
  const text = cellText(row, column).trim();
  return text === '—' ? '' : text;
}

function isActionColumn(column: TableColumn<T>): boolean {
  return column.key === 'actions' || column.fixed === 'end';
}

function fixedSide(column: TableColumn<T>, columnIndex: number) {
  if (column.fixed === 'start') {
    return columnIndex === 0 ? 'start' : undefined;
  }
  return column.fixed;
}

const hoverTip = ref('');

function hasOverflowingContent(el: HTMLElement): boolean {
  const elements = [el, ...el.querySelectorAll<HTMLElement>('*')];
  return elements.some(
    (content) => content.scrollWidth > content.clientWidth + 1,
  );
}

function onEllipsisEnter(event: Event) {
  const el = event.currentTarget as HTMLElement | null;
  if (!el) {
    hoverTip.value = '';
    return;
  }
  const text = (el.innerText || el.textContent || '').trim();
  if (!text || text === '—') {
    hoverTip.value = '';
    return;
  }
  hoverTip.value = hasOverflowingContent(el) ? text : '';
}

function cellStyle(column: TableColumn<T>) {
  const size = column.width ?? column.minWidth;
  if (size == null) return undefined;
  return { width: `${size}px` };
}

function cellRowSpan(column: TableColumn<T>, row: T, rowIndex: number): number {
  const span = column.rowSpan?.(row, rowIndex);
  return Number.isInteger(span) && span != null && span >= 0 ? span : 1;
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
  updateOverflowMetrics();
  if (props.virtual) {
    scrollTop.value = scroller.value?.scrollTop ?? 0;
  }
}

function updateOverflowMetrics() {
  const element = scroller.value;
  if (!element) return;
  const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
  canScrollStart.value = element.scrollLeft > 1;
  canScrollEnd.value = element.scrollLeft < maxScrollLeft - 1;
}

function onScrollerKeydown(event: KeyboardEvent) {
  if (event.target !== scroller.value) return;
  const element = scroller.value;
  if (!element || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  element.scrollLeft += direction * Math.max(120, element.clientWidth * 0.6);
  updateOverflowMetrics();
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
      'a-table--virtual': virtual,
      'a-table--overflow-start': canScrollStart,
      'a-table--overflow-end': canScrollEnd,
    }"
    :aria-busy="loading ? true : undefined"
    :aria-label="
      canScrollStart || canScrollEnd
        ? '数据表格，可使用左右方向键横向滚动'
        : undefined
    "
    :tabindex="canScrollStart || canScrollEnd ? 0 : undefined"
    @scroll="onScroll"
    @keydown="onScrollerKeydown"
  >
    <table :style="{ minWidth: `${tableMinWidth}px` }">
      <thead>
        <tr>
          <th
            v-for="(column, columnIndex) in columns"
            :key="column.key"
            scope="col"
            :class="[
              `a-table__cell--${column.align ?? 'start'}`,
              {
                'a-table__cell--fixed': Boolean(fixedSide(column, columnIndex)),
                [`a-table__cell--fixed-${fixedSide(column, columnIndex)}`]:
                  Boolean(fixedSide(column, columnIndex)),
              },
            ]"
            :style="cellStyle(column)"
          >
            <ATooltip :content="column.label">
              <template #trigger>
                <span class="a-table__ellipsis a-table__header-content">{{
                  column.label
                }}</span>
              </template>
            </ATooltip>
          </th>
        </tr>
      </thead>
      <tbody v-if="rows.length">
        <!-- 顶部占位行：撑开被虚拟跳过的行的空间 -->
        <tr
          v-if="spacerTopHeight > 0"
          class="a-table__spacer"
          :style="{ height: `${spacerTopHeight}px` }"
          aria-hidden="true"
        />
        <tr
          v-for="(row, i) in visibleRows"
          :key="rowId(row)"
          :data-row-key="rowId(row)"
          :class="{ 'a-table__row--selected': selectedKey === rowId(row) }"
          :tabindex="focusedKey === rowId(row) ? 0 : -1"
          @click="onRowClick(row)"
          @keydown="onRowKeydown($event, row)"
        >
          <template v-for="(column, columnIndex) in columns" :key="column.key">
            <td
              v-if="cellRowSpan(column, row, virtualRange.start + i) !== 0"
              :class="[
                `a-table__cell--${column.align ?? 'start'}`,
                {
                  'a-table__cell--fixed': Boolean(
                    fixedSide(column, columnIndex),
                  ),
                  [`a-table__cell--fixed-${fixedSide(column, columnIndex)}`]:
                    Boolean(fixedSide(column, columnIndex)),
                  'a-table__cell--mono': column.mono,
                },
              ]"
              :rowspan="
                cellRowSpan(column, row, virtualRange.start + i) > 1
                  ? cellRowSpan(column, row, virtualRange.start + i)
                  : undefined
              "
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
                :content="column.ellipsis ? tooltipText(row, column) : hoverTip"
                :disabled="
                  column.ellipsis ? !tooltipText(row, column) : !hoverTip
                "
              >
                <template #trigger>
                  <div
                    class="a-table__ellipsis a-table__body-content"
                    @mouseenter="onEllipsisEnter"
                  >
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
          </template>
        </tr>
        <!-- 底部占位行：撑开末尾被虚拟跳过的行的空间 -->
        <tr
          v-if="spacerBottomHeight > 0"
          class="a-table__spacer"
          :style="{ height: `${spacerBottomHeight}px` }"
          aria-hidden="true"
        />
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
  box-sizing: border-box;
  min-width: 0;
  overflow: auto;
  background: var(--bg-content);
  border: 1px solid var(--separator);
  border-radius: var(--radius-lg);
}

.a-table--overflow-end {
  box-shadow: inset -14px 0 12px -14px var(--label-2);
}

.a-table--overflow-start {
  box-shadow: inset 14px 0 12px -14px var(--label-2);
}

.a-table--overflow-start.a-table--overflow-end {
  box-shadow:
    inset 14px 0 12px -14px var(--label-2),
    inset -14px 0 12px -14px var(--label-2);
}

.a-table:focus-visible {
  outline: 0;
  box-shadow: var(--focus-ring);
}

.a-table::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.a-table::-webkit-scrollbar-thumb {
  background: var(--fill-1);
  border: 2px solid var(--bg-content);
  border-radius: var(--radius-pill);
}

table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}

th,
td {
  height: var(--row-height);
  padding: var(--space-1) var(--space-3);
  overflow: hidden;
  font: var(--text-control);
  color: var(--label);
  text-align: center;
  vertical-align: middle;
  box-shadow: inset 0 -0.5px 0 var(--separator);
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  font: var(--text-field-em);
  color: var(--label);
  white-space: nowrap;
  background: var(--bg-grouped);
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
  z-index: 1;
  overflow: hidden;
  white-space: nowrap;
  background: var(--bg-content);
  box-shadow:
    inset 0.5px 0 0 var(--control-stroke),
    inset 0 -0.5px 0 var(--separator);
}

.a-table__cell--fixed-start {
  left: 0;
}

.a-table__cell--fixed-end {
  right: 0;
}

.a-table__cell--fixed-end::before {
  position: absolute;
  top: 0;
  bottom: 0.5px;
  left: calc(var(--space-3) * -1);
  width: var(--space-3);
  pointer-events: none;
  content: '';
  background: linear-gradient(to right, transparent, var(--bg-content));
  opacity: 0;
  transition: opacity var(--dur-1) var(--ease-out);
}

.a-table--overflow-end .a-table__cell--fixed-end::before {
  opacity: 1;
}

.a-table__cell--fixed-start::before {
  position: absolute;
  top: 0;
  right: calc(var(--space-3) * -1);
  bottom: 0.5px;
  width: var(--space-3);
  pointer-events: none;
  content: '';
  background: linear-gradient(to left, transparent, var(--bg-content));
  opacity: 0;
  transition: opacity var(--dur-1) var(--ease-out);
}

.a-table--overflow-start .a-table__cell--fixed-start::before {
  opacity: 1;
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
}

.a-table__header-content {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a-table__body-content {
  overflow: visible;
  overflow-wrap: anywhere;
  white-space: normal;
}

/* 虚拟滚动依赖固定行高；显式启用时保留单行模式，避免占位高度漂移。 */
.a-table--virtual th,
.a-table--virtual td {
  padding-block: 0;
}

.a-table--virtual .a-table__body-content {
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

@media (width <= 40rem) {
  .a-table__cell--fixed {
    position: static;
  }

  .a-table__cell--fixed::before {
    display: none;
  }
}

/* 虚拟滚动占位行：不显示分隔线，不响应 hover/选中/斑马纹 */
.a-table__spacer {
  pointer-events: none;
  box-shadow: none;
}

.a-table__spacer td {
  box-shadow: none;
}

tbody tr:last-child td {
  box-shadow: none;
}

tbody tr:last-child td.a-table__cell--fixed {
  box-shadow: inset 0.5px 0 0 var(--control-stroke);
}
</style>
