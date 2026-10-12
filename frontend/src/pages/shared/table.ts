import type { TablePaginationConfig } from 'ant-design-vue';
import {
  cloneVNode,
  computed,
  ref,
  watch,
  type VNode,
  type WatchSource,
} from 'vue';

const collator = new Intl.Collator('zh', {
  numeric: true,
  sensitivity: 'base',
});

/** 数字按大小，其余按中文自然顺序（"型号2" < "型号10"）比较。 */
export function compareValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return collator.compare(String(left ?? ''), String(right ?? ''));
}

/** 给 a-table 列的 `sorter` 用：`sorter: sortBy('name')`。 */
export function sortBy<T = Record<string, unknown>>(
  key: string | ((row: T) => unknown),
) {
  const read =
    typeof key === 'function'
      ? key
      : (row: T) => (row as Record<string, unknown>)[key];
  return (a: T, b: T) => compareValues(read(a), read(b));
}

/** 空值单元格统一显示破折号。 */
export function cellText(value: unknown): string {
  if (value == null || String(value).trim() === '') return '—';
  return String(value);
}

export const PAGE_SIZE_OPTIONS = ['20', '50', '100'];

/**
 * 所有列表分页条的共用属性：`<a-pagination v-bind="PAGINATION_PROPS">`。
 * 不隐藏单页分页条——数据只有一页时也显示「共 N 条」和每页条数，
 * 分页条位置固定，用户一眼能看出列表是否完整。
 */
// antd 的翻页按钮只有图标，提示文字写在外层 li 的 title 上；按钮本身补上可读名称
const PAGER_LABELS: Record<string, string> = {
  prev: '上一页',
  next: '下一页',
  'jump-prev': '向前 5 页',
  'jump-next': '向后 5 页',
};

function labelPagerItem({
  type,
  originalElement,
}: {
  type: string;
  originalElement: VNode;
}) {
  const label = PAGER_LABELS[type];
  return label
    ? cloneVNode(originalElement, { 'aria-label': label })
    : originalElement;
}

export const PAGINATION_PROPS = {
  pageSizeOptions: PAGE_SIZE_OPTIONS,
  showSizeChanger: true,
  showTotal: (count: number) => `共 ${count} 条`,
  itemRender: labelPagerItem,
} as const;

/**
 * a-table / a-list 内置分页（排序交给 antd 的表格用这个，排序和分页都作用于整个数据集）。
 * 分页条始终显示；`resetOn` 里的筛选条件变化时回到第一页，数据变少时收回越界页。
 */
export function useTablePagination(
  total: () => number,
  resetOn: WatchSource[] = [],
) {
  const page = ref(1);
  const pageSize = ref(20);

  const pagination = computed<TablePaginationConfig>(() => ({
    ...PAGINATION_PROPS,
    current: page.value,
    pageSize: pageSize.value,
    total: total(),
  }));

  function onChange(next: TablePaginationConfig) {
    if (next.pageSize && next.pageSize !== pageSize.value) {
      pageSize.value = next.pageSize;
      page.value = 1;
      return;
    }
    page.value = next.current ?? 1;
  }

  if (resetOn.length > 0) {
    watch(resetOn, () => {
      page.value = 1;
    });
  }
  watch(
    () => Math.max(1, Math.ceil(total() / pageSize.value)),
    (last) => {
      if (page.value > last) page.value = last;
    },
  );

  /** a-list 的分页配置：a-list 不发 change 事件，翻页回调写在配置里。 */
  const listPagination = computed(() => ({
    ...pagination.value,
    onChange: (current: number, size: number) =>
      onChange({ current, pageSize: size }),
  }));

  /** 翻到第 index 条（从 0 数）所在的页，用于从别处跳转定位到某一条。 */
  function showIndex(index: number) {
    if (index >= 0) page.value = Math.floor(index / pageSize.value) + 1;
  }

  return { page, pageSize, pagination, listPagination, onChange, showIndex };
}

const INTERACTIVE =
  'button, a, input, textarea, select, label, [role="button"], .ant-checkbox-wrapper';

/**
 * 整行点击打开详情/编辑，但点在行内按钮、链接、输入框上时不触发。
 * 用法：`:custom-row="rowClick(editItem)"`。
 */
export function rowClick<T>(onActivate: (row: T) => void) {
  return (record: T) => ({
    onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(INTERACTIVE)) return;
      onActivate(record);
    },
  });
}

/**
 * 横向滚动基准宽度取各列声明宽度之和：容器更宽时 antd 会铺满，
 * 更窄时出现横向滚动条，固定列（操作列）始终可见。
 */
export function scrollX(columns: ReadonlyArray<{ width?: number | string }>) {
  const total = columns.reduce(
    (sum, column) =>
      sum + (typeof column.width === 'number' ? column.width : 0),
    0,
  );
  return total > 0 ? total : 'max-content';
}

/** 受控排序状态，order 直接用 antd 的 'ascend' / 'descend'。 */
export interface TableSortState {
  key: string;
  order: 'ascend' | 'descend';
}

/**
 * 分页表格必须先排完整数据集再切片：只排当前页会让翻页后顺序对不上。
 */
export function sortRows<T>(
  rows: readonly T[],
  sort: TableSortState | null,
): T[] {
  if (!sort) return [...rows];
  const direction = sort.order === 'ascend' ? 1 : -1;
  const compare = sortBy<T>(sort.key);
  return [...rows].sort((a, b) => compare(a, b) * direction);
}

/** 列定义里的 `sortOrder: sortOrderOf(sort.value, 'name')`。 */
export function sortOrderOf(sort: TableSortState | null, key: string) {
  return sort?.key === key ? sort.order : null;
}

/** a-table `@change` 的第三个参数 → 受控排序状态。 */
export function sortFromChange(sorter: unknown): TableSortState | null {
  const current = (Array.isArray(sorter) ? sorter[0] : sorter) as
    | {
        columnKey?: unknown;
        field?: unknown;
        order?: 'ascend' | 'descend' | null;
      }
    | undefined;
  if (!current?.order) return null;
  const key = String(current.columnKey ?? current.field ?? '');
  return key ? { key, order: current.order } : null;
}
