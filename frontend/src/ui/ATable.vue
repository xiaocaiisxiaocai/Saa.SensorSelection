<script setup lang="ts" generic="T">
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-vue-next';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import AEmptyState from './AEmptyState.vue';
import ASpinner from './ASpinner.vue';
import ATooltip from './ATooltip.vue';
import { nextSortState, sortRows } from './table-sort';
import type { TableColumn, TableRowHeight, TableSortState } from './types';

// 行高常量与 tokens.css 中 --row-height / --row-height-loose 保持同步
const ROW_HEIGHT_COMPACT = 36;
const ROW_HEIGHT_LOOSE = 44;
const DEFAULT_COLUMN_MIN_WIDTH = 120;
/** 拖动能把列压到的最窄宽度，再窄就看不清内容了 */
const MIN_RESIZED_COLUMN_WIDTH = 56;
/** 键盘调整列宽的步长 */
const RESIZE_KEY_STEP = 16;
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
     * 注意：虚拟滚动按固定行高推算占位高度，而正文列现在是完整换行、
     * 行高随内容变化的，两者一起用会让滚动位置漂移。
     * 注意：启用后 column.rowSpan 将失效，请勿同时使用。
     */
    virtual?: boolean;
    /**
     * 给这张表一个稳定标识，用户拖出来的列宽就会按这个 key 记在本地。
     * 不传也能拖，只是刷新后回到默认宽度。
     */
    storageKey?: string;
  }>(),
  {
    emptyText: '暂无数据',
    striped: false,
    rowHeight: 'loose',
    virtual: false,
    storageKey: undefined,
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

// ─── 排序状态 ────────────────────────────────────────────────────
// 合并单元格（rowSpan）依赖原始行序分组，一旦重排就会错位，因此存在
// rowSpan 列时整表不可排序，即使某一列显式声明了 sortable 也会被忽略。
const hasRowSpanColumn = computed(() =>
  props.columns.some((column) => Boolean(column.rowSpan)),
);
/**
 * 分页表格要绑 `v-model:sort`，并用 `sortRows` 在切片前排完整数据集；
 * 不分页的表格不用管，不绑时这就是组件自己的内部状态。
 */
const sort = defineModel<TableSortState | null>('sort', { default: null });

function toggleSort(column: TableColumn<T>) {
  if (!column.sortable || hasRowSpanColumn.value) return;
  sort.value = nextSortState(sort.value, column.key);
}

function columnAriaSort(
  column: TableColumn<T>,
): 'ascending' | 'descending' | 'none' | undefined {
  if (!column.sortable || hasRowSpanColumn.value) return undefined;
  return sort.value?.key === column.key ? sort.value.direction : 'none';
}

const sortedRows = computed(() => {
  if (hasRowSpanColumn.value || !sort.value) return props.rows;
  if (!props.columns.some((column) => column.key === sort.value?.key)) {
    return props.rows;
  }
  return sortRows(props.rows, sort.value);
});

// ─── 虚拟滚动状态 ────────────────────────────────────────────────
const containerHeight = ref(0);
const containerWidth = ref(0);
const scrollTop = ref(0);

const unitRowHeight = computed(() =>
  props.rowHeight === 'loose' ? ROW_HEIGHT_LOOSE : ROW_HEIGHT_COMPACT,
);

const tableMinWidth = computed(() =>
  props.columns.reduce((total, column) => total + columnFloor(column), 0),
);

/** 列的宽度下限：`width` 列就是它本身，其余取 `minWidth`，都没有则用默认值 */
function columnFloor(column: TableColumn<T>): number {
  return column.width ?? column.minWidth ?? DEFAULT_COLUMN_MIN_WIDTH;
}

// ─── 拖动调整列宽 ────────────────────────────────────────────────
/** 用户拖出来的列宽（px），优先于自动分配；传了 storageKey 时记在本地 */
const columnWidthOverrides = ref(new Map<string, number>(restoreColumnWidths()));
const resizingKey = ref<string | null>(null);

function widthStorageKey(): string | null {
  return props.storageKey ? `a-table:widths:${props.storageKey}` : null;
}

function restoreColumnWidths(): Map<string, number> {
  const storageKey = props.storageKey
    ? `a-table:widths:${props.storageKey}`
    : null;
  if (!storageKey) return new Map();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return new Map();
    return new Map(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]),
      ),
    );
  } catch {
    return new Map();
  }
}

function persistColumnWidths() {
  const storageKey = widthStorageKey();
  if (!storageKey) return;
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify(Object.fromEntries(columnWidthOverrides.value)),
    );
  } catch {
    // 本地存储不可用时，本次会话内拖出来的宽度仍然有效
  }
}

function setColumnWidth(column: TableColumn<T>, width: number) {
  const next = new Map(columnWidthOverrides.value);
  next.set(column.key, Math.max(MIN_RESIZED_COLUMN_WIDTH, Math.round(width)));
  columnWidthOverrides.value = next;
  persistColumnWidths();
}

function onResizeStart(column: TableColumn<T>, event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement;
  const startX = event.clientX;
  const startWidth =
    resolvedColumnWidths.value.get(column.key) ?? columnFloor(column);
  resizingKey.value = column.key;
  handle.setPointerCapture(event.pointerId);

  const onMove = (move: PointerEvent) => {
    setColumnWidth(column, startWidth + (move.clientX - startX));
  };
  const onEnd = () => {
    resizingKey.value = null;
    handle.releasePointerCapture(event.pointerId);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onEnd);
    handle.removeEventListener('pointercancel', onEnd);
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onEnd);
  handle.addEventListener('pointercancel', onEnd);
  event.preventDefault();
}

/** 键盘也要能改列宽：拖动手柄是 separator，左右键每次 16px，Home 还原 */
function onResizeKeydown(column: TableColumn<T>, event: KeyboardEvent) {
  const current =
    resolvedColumnWidths.value.get(column.key) ?? columnFloor(column);
  if (event.key === 'ArrowLeft') {
    setColumnWidth(column, current - RESIZE_KEY_STEP);
  } else if (event.key === 'ArrowRight') {
    setColumnWidth(column, current + RESIZE_KEY_STEP);
  } else if (event.key === 'Home') {
    resetColumnWidth(column);
  } else {
    return;
  }
  event.preventDefault();
}

/** 双击手柄或按 Home：把这一列交回自动分配 */
function resetColumnWidth(column: TableColumn<T>) {
  if (!columnWidthOverrides.value.has(column.key)) return;
  const next = new Map(columnWidthOverrides.value);
  next.delete(column.key);
  columnWidthOverrides.value = next;
  persistColumnWidths();
}

/*
 * 列宽必须在 JS 里算出具体像素，不能交给 CSS：
 *
 * table-layout:fixed 下浏览器只认单元格的 `width`，规范明确忽略 `min-width`。
 * 曾经给 minWidth 列写 CSS min-width，结果这些列等于没宽度，被平均分配——
 * 机型表 9 列全变成 120px，声明 220px 的「规格」列被压到 120px，品牌名被
 * 从词中间断开。反过来，若给所有列都写死 width，多余空间又会按比例摊到
 * 图标列和操作列上，把它们撑得异常宽。
 *
 * 所以：`width` 列永远是它声明的值（不伸不缩），多余空间只按各自下限的
 * 比例分给 `minWidth` 列；空间不够时所有列停在下限上，由容器横向滚动。
 */
const resolvedColumnWidths = computed(() => {
  const widths = new Map<string, number>();
  // 用户拖过的列按拖出来的宽度走，不再参与自动分配
  const auto = props.columns.filter(
    (column) => !columnWidthOverrides.value.has(column.key),
  );
  const flexible = auto.filter((column) => column.width == null);
  const flexibleFloor = flexible.reduce(
    (total, column) => total + columnFloor(column),
    0,
  );
  const extra = Math.max(0, containerWidth.value - tableMinWidth.value);

  let distributed = 0;
  flexible.forEach((column, index) => {
    const floor = columnFloor(column);
    const share =
      index === flexible.length - 1
        ? extra - distributed // 最后一列吃掉取整误差，避免差 1px 触发横向滚动
        : Math.floor(flexibleFloor > 0 ? (extra * floor) / flexibleFloor : 0);
    distributed += share;
    widths.set(column.key, floor + share);
  });
  auto.forEach((column) => {
    if (column.width != null) widths.set(column.key, column.width);
  });
  columnWidthOverrides.value.forEach((width, key) => widths.set(key, width));
  return widths;
});

/** 当前可视范围（行下标，左闭右开） */
const virtualRange = computed(() => {
  if (!props.virtual || sortedRows.value.length === 0) {
    return { start: 0, end: sortedRows.value.length };
  }
  const rh = unitRowHeight.value;
  const start = Math.max(0, Math.floor(scrollTop.value / rh) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight.value / rh);
  const end = Math.min(
    sortedRows.value.length,
    start + visibleCount + OVERSCAN * 2,
  );
  return { start, end };
});

/** 实际渲染的行切片 */
const visibleRows = computed(() =>
  props.virtual
    ? sortedRows.value.slice(virtualRange.value.start, virtualRange.value.end)
    : sortedRows.value,
);

/** 顶部占位行高度（px） */
const spacerTopHeight = computed(() =>
  props.virtual ? virtualRange.value.start * unitRowHeight.value : 0,
);

/** 底部占位行高度（px） */
const spacerBottomHeight = computed(() =>
  props.virtual
    ? (sortedRows.value.length - virtualRange.value.end) * unitRowHeight.value
    : 0,
);

let resizeObserver: ResizeObserver | null = null;

// 列宽依赖容器宽度，所以这个观察器要一直开着，不再只为虚拟滚动服务。
function setupResizeObserver() {
  if (resizeObserver || !scroller.value) return;
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    containerHeight.value = entry.contentRect.height;
    containerWidth.value = entry.contentRect.width;
  });
  resizeObserver.observe(scroller.value);
  containerHeight.value = scroller.value.clientHeight;
  containerWidth.value = scroller.value.clientWidth;
}

onMounted(() => {
  setupResizeObserver();
  void nextTick(updateOverflowMetrics);
  window.addEventListener('resize', updateOverflowMetrics);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('resize', updateOverflowMetrics);
});
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

function isActionColumn(column: TableColumn<T>): boolean {
  return column.key === 'actions' || column.fixed === 'end';
}

function fixedSide(column: TableColumn<T>, columnIndex: number) {
  if (column.fixed === 'start') {
    return columnIndex === 0 ? 'start' : undefined;
  }
  return column.fixed;
}

const hasFixedStart = computed(() =>
  props.columns.some((column, index) => fixedSide(column, index) === 'start'),
);
const hasFixedEnd = computed(() =>
  props.columns.some((column, index) => fixedSide(column, index) === 'end'),
);

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
  const resolved = resolvedColumnWidths.value.get(column.key);
  return resolved == null ? undefined : { width: `${resolved}px` };
}

function cellRowSpan(column: TableColumn<T>, row: T, rowIndex: number): number {
  const span = column.rowSpan?.(row, rowIndex);
  return Number.isInteger(span) && span != null && span >= 0 ? span : 1;
}

const ids = computed(() => sortedRows.value.map((row) => rowId(row)));

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
  if (event.key === 'Home') {
    event.preventDefault();
    const first = ids.value[0];
    if (first != null) {
      focusRow(first);
    }
    return;
  }
  if (event.key === 'End') {
    event.preventDefault();
    const last = ids.value[ids.value.length - 1];
    if (last != null) {
      focusRow(last);
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
      'a-table--fixed-start': hasFixedStart,
      'a-table--fixed-end': hasFixedEnd,
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
            :aria-sort="columnAriaSort(column)"
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
            <button
              v-if="column.sortable && !hasRowSpanColumn"
              type="button"
              class="a-table__sort-button"
              @click="toggleSort(column)"
            >
              <span class="a-table__ellipsis a-table__header-content">{{
                column.label
              }}</span>
              <ArrowUp
                v-if="sort?.key === column.key && sort.direction === 'ascending'"
                class="a-table__sort-icon"
                :size="14"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              <ArrowDown
                v-else-if="sort?.key === column.key"
                class="a-table__sort-icon"
                :size="14"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              <ChevronsUpDown
                v-else
                class="a-table__sort-icon a-table__sort-icon--idle"
                :size="14"
                :stroke-width="1.5"
                aria-hidden="true"
              />
            </button>
            <ATooltip v-else :content="column.label">
              <template #trigger>
                <span class="a-table__ellipsis a-table__header-content">{{
                  column.label
                }}</span>
              </template>
            </ATooltip>
            <!--
              列宽拖动手柄，刻意不进 Tab 顺序（tabindex="-1"）。
              每列一个手柄意味着每列多一个停留点：Sensor 表实测 36 个 Tab
              停留点里有 11 个是手柄，键盘用户想走到表格行或分页得先穿过
              它们，得不偿失。列宽只是显示偏好，调不了也不影响读到任何内容
              （单元格会换行、表格能横向滚动），所以这里选择不占 Tab 顺序。
              键盘处理保留着，手柄被聚焦时左右键/Home 仍然有效。
            -->
            <span
              v-if="columnIndex < columns.length - 1"
              class="a-table__resizer"
              :class="{ 'a-table__resizer--active': resizingKey === column.key }"
              role="separator"
              aria-orientation="vertical"
              tabindex="-1"
              :aria-label="`调整${column.label}列宽`"
              @pointerdown="onResizeStart(column, $event)"
              @keydown="onResizeKeydown(column, $event)"
              @dblclick="resetColumnWidth(column)"
            />
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
              <!--
                正文不再截断，所以 tooltip 只在内容真的放不下时才出现，
                由 onEllipsisEnter 实测 scrollWidth 决定；否则它只是把已经
                看得见的文字重复一遍，还会挡住相邻行。
              -->
              <ATooltip v-else :content="hoverTip" :disabled="!hoverTip">
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
                      <span
                        v-if="!cellText(row, column).trim()"
                        class="a-table__placeholder"
                      >—</span>
                      <template v-else>{{ displayText(row, column) }}</template>
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
  --a-table-fade: var(--space-6);

  position: relative;
  box-sizing: border-box;
  min-width: 0;
  overflow: auto;
  background: var(--bg-content);
  border: 1px solid var(--separator);
  border-radius: var(--radius-lg);
}

/* 有横向溢出内容时常驻一条淡滚动条，不再要求鼠标先悬停到表格上才现形，
   否则用户不移到表格上根本不知道右侧还有内容可以横向滚动。

   横向滚动提示阴影只画在没有固定列的一侧：固定列的单元格背景只铺到最后一行，
   容器内阴影会在行下方的空白区露成一条竖带（暗色下尤其刺眼）。固定列一侧的
   提示改由固定列单元格自身的外阴影承担。阴影色用专门的 token，不能借文字色，
   否则暗色主题下文字色是浅色，阴影会变成一条白带。 */
.a-table--overflow-start,
.a-table--overflow-end {
  scrollbar-color: var(--scrollbar-thumb) transparent;
  box-shadow:
    var(--a-table-edge-start, 0 0 transparent),
    var(--a-table-edge-end, 0 0 transparent);
}

.a-table--overflow-start:not(.a-table--fixed-start) {
  --a-table-edge-start: inset 20px 0 16px -16px var(--shadow-scroll-edge);
}

.a-table--overflow-end:not(.a-table--fixed-end) {
  --a-table-edge-end: inset -20px 0 16px -16px var(--shadow-scroll-edge);
}

.a-table:focus-visible {
  outline: 0;
  box-shadow: var(--focus-ring);
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
  font-variant-numeric: tabular-nums;
  color: var(--label);

  /* 每个单元格都会带 .a-table__cell--{align}（默认 start），这里只是兜底：
     文本左对齐是 Apple 表格的默认，居中只留给显式声明 align="center" 的列。 */
  text-align: start;
  vertical-align: middle;
  box-shadow: inset 0 -0.5px 0 var(--separator);
}

/*
 * 表头底色：--bg-grouped 和内容底色只差 1.5%（浅色下实测亮度比 1.034），
 * 长表格滚动时几乎分不出表头在哪。改成在不透明底色上叠一层 --fill-4，
 * 深浅两种主题都能看出表头是独立的一条。
 */
th {
  position: sticky;
  top: 0;
  z-index: 1;
  font: var(--text-field-em);
  color: var(--label);
  white-space: nowrap;
  background-color: var(--bg-content);
  background-image: linear-gradient(var(--fill-4), var(--fill-4));
}

/*
 * 拖动手柄整体放在表头单元格内部：th 有 overflow:hidden，探到单元格外的
 * 部分会被裁掉。所以贴右边缘、向内取 12px 作为热区。
 */
.a-table__resizer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  width: var(--space-4);
  cursor: col-resize;
  touch-action: none;
  user-select: none;
}

.a-table__resizer::before {
  position: absolute;
  top: 25%;
  right: 0;
  bottom: 25%;
  width: 1px;
  content: '';
  background: transparent;
  transition: background-color var(--dur-1) var(--ease-out);
}

.a-table__resizer:hover::before,
.a-table__resizer:focus-visible::before,
.a-table__resizer--active::before {
  background: var(--sys-blue);
}

.a-table__resizer:focus-visible {
  outline: 0;
}

/* 拖动过程中整条分隔线贯穿表头，给出明确的落点反馈 */
.a-table__resizer--active::before {
  top: 0;
  bottom: 0;
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

/* 空值占位符在等宽列里会被等宽字体画成短横（–），和其它列的长横（—）
   不一致。统一用界面字体；页面自定义单元格插槽也用这个类。 */
.a-table :deep(.a-table__placeholder) {
  font-family: var(--font-ui);
}

.a-table__cell--fixed {
  /* 行状态（悬停/斑马纹/选中/表头）的半透明底色。固定列不能直接继承行的
     半透明底色，否则滚到下面的内容会透出来；改为不透明底 + 叠一层行底色。 */
  --a-table-row-tint: transparent;

  position: sticky;
  z-index: 1;

  /* 覆盖 th/td 的 overflow:hidden，裁剪改由下面的 clip-path 负责 */
  overflow: visible;
  white-space: nowrap;
  background-color: var(--bg-content);
  background-image: linear-gradient(
    var(--a-table-row-tint),
    var(--a-table-row-tint)
  );
  box-shadow:
    inset 0.5px 0 0 var(--control-stroke),
    inset 0 -0.5px 0 var(--separator);
}

/*
 * 固定列被横向滚动的内容压在下面时，内侧用一段渐变把被压住的文字淡出，
 * 而不是在分界线上硬切成半个字。
 *
 * 两个坑：
 * 1. 不能用 overflow:hidden 裁单元格内容——它会连同探出单元格的渐变一起裁掉。
 *    改用 clip-path，只在渐变那一侧放宽 --a-table-fade 的距离。
 * 2. 不能改用单元格外阴影：border-collapse:collapse 下 Chrome 根本不绘制
 *    td 的外 box-shadow（实测红色阴影也不出现）。
 */
.a-table__cell--fixed-start {
  left: 0;
  clip-path: inset(0 calc(var(--a-table-fade) * -1) 0 0);
}

.a-table__cell--fixed-end {
  right: 0;
  clip-path: inset(0 0 0 calc(var(--a-table-fade) * -1));
}

.a-table__cell--fixed-start::before,
.a-table__cell--fixed-end::before {
  position: absolute;
  top: 0;
  bottom: 0.5px;
  width: var(--a-table-fade);
  pointer-events: none;
  content: '';
  opacity: 0;
  transition: opacity var(--dur-1) var(--ease-out);
}

/* 渐变终点 = 固定列自身的底色（不透明底 + 行底色），悬停/选中/表头都不出亮条 */
.a-table__cell--fixed-end::before {
  left: calc(var(--a-table-fade) * -1);
  background:
    linear-gradient(to right, transparent, var(--a-table-row-tint)),
    linear-gradient(to right, transparent, var(--bg-content));
}

.a-table__cell--fixed-start::before {
  right: calc(var(--a-table-fade) * -1);
  background:
    linear-gradient(to left, transparent, var(--a-table-row-tint)),
    linear-gradient(to left, transparent, var(--bg-content));
}

.a-table--overflow-end .a-table__cell--fixed-end::before,
.a-table--overflow-start .a-table__cell--fixed-start::before {
  opacity: 1;
}

/* 固定列的表头格要跟着整行走：.a-table__cell--fixed 的 --bg-content 会盖过
   上面的 th 规则，让表头第一格变成表体色，整条表头出现断缝。 */
th.a-table__cell--fixed {
  --a-table-row-tint: var(--fill-4);

  z-index: 2;
}

tbody tr:hover .a-table__cell--fixed,
.a-table--striped tbody tr:nth-child(even) .a-table__cell--fixed {
  --a-table-row-tint: var(--fill-4);
}

/* 选中行（含选中且悬停）优先：选择器特异度要高于上面的斑马纹规则 */
.a-table tbody tr.a-table__row--selected .a-table__cell--fixed {
  --a-table-row-tint: var(--sys-blue-fill);
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

.a-table__sort-button {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;

  /* 最小 24px 热区：表头文字本身只有 18px 高，直接当按钮点不达标。
     负外边距让扩出来的热区不撑高表头行。 */
  min-height: 24px;
  max-width: 100%;
  padding: 0 var(--space-1);
  margin: 0 calc(var(--space-1) * -1);
  color: inherit;
  font: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--radius-xs);
}

.a-table__sort-button:hover {
  color: var(--sys-blue);
}

.a-table__sort-button:focus-visible {
  box-shadow: var(--focus-ring);
}

.a-table__sort-icon {
  flex-shrink: 0;
  color: var(--sys-blue);
}

.a-table__sort-icon--idle {
  color: var(--label-3);
  opacity: 0;
  transition: opacity var(--dur-1) var(--ease-out);
}

.a-table__sort-button:hover .a-table__sort-icon--idle,
.a-table__sort-button:focus-visible .a-table__sort-icon--idle {
  opacity: 1;
}

.a-table__body-content {
  overflow: visible;

  /*
   * break-word 而不是 anywhere：anywhere 允许在任意字符处断行，会把
   * OMRON / SICK / Keyence 这类品牌名和料号从词中间劈开（实测断成
   * 「OMRO / N」「SIC / K」）。break-word 只在整词确实放不下时才断，
   * 正常情况下保持单词完整。
   */
  overflow-wrap: break-word;
  white-space: normal;
}

/*
 * 正文列一律完整显示，不做行数截断：规格参数、特性与注意这类内容必须一眼
 * 读全，不能逼用户逐格 hover 才能看到后半句。代价是行高随内容变化、不再
 * 等高——这是明确取舍过的：完整可读 > 视觉等高。
 *
 * 也因此 ATable 不能再和虚拟滚动同时使用（虚拟滚动按固定行高推算占位）。
 */

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
    clip-path: none;
  }

  .a-table__cell--fixed::before {
    display: none;
  }

  /* 窄屏固定列取消吸附，滚动提示回到容器两侧 */
  .a-table--overflow-start.a-table--fixed-start {
    --a-table-edge-start: inset 20px 0 16px -16px var(--shadow-scroll-edge);
  }

  .a-table--overflow-end.a-table--fixed-end {
    --a-table-edge-end: inset -20px 0 16px -16px var(--shadow-scroll-edge);
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
