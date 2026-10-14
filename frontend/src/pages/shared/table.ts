import type { TablePaginationConfig } from 'ant-design-vue';
import {
  cloneVNode,
  computed,
  ref,
  watch,
  type VNode,
  type WatchSource,
} from 'vue';

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
  // 手机宽度下自动换成小号分页条，页码少时不会把「下一页」挤到第二行
  responsive: true,
} as const;

/**
 * a-table / a-list 内置分页。
 * 分页条始终显示；`resetOn` 里的筛选条件变化时回到第一页，数据变少时收回越界页。
 * 表格不在这里重排，行序就是传入的数据顺序。
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

export interface ColumnFilterOption {
  label: string;
  value: string | number;
}

/** `@change` 里 antd 交回来的各列筛选值。空选是 null。 */
export type ColumnFilterMap = Record<
  string,
  readonly (boolean | string | number)[] | null
>;

/**
 * 表头漏斗。筛选在传入表格之前做完，这里不设 `onFilter`
 * （那只会滤当前页，并打乱合并单元格和分组）。
 * 空选传 `filteredValue: null`，漏斗不高亮。
 */
export function columnFilter(input: {
  options: readonly ColumnFilterOption[];
  value: readonly (string | number)[];
  multiple?: boolean;
  search?: boolean;
}) {
  return {
    filters: input.options.map((item) => ({
      text: item.label,
      value: item.value,
    })),
    filteredValue: input.value.length > 0 ? [...input.value] : null,
    filterMultiple: input.multiple !== false,
    ...(input.search ? { filterSearch: true as const } : {}),
  };
}

/** 取出某一列确认后的筛选值；没有这一列或已清空时是空数组。 */
export function columnFilterValues(
  filters: ColumnFilterMap | undefined,
  key: string,
): Array<string | number> {
  const value = filters?.[key];
  if (!value) return [];
  return value.filter(
    (item): item is string | number =>
      typeof item === 'string' || typeof item === 'number',
  );
}

/** 翻页也会触发 `@change`。只有筛选动作能改筛选条件，否则会把页码打回第一页。 */
export function isColumnFilterChange(extra: { action?: string } | undefined) {
  return extra?.action === 'filter';
}

/** 内容相同就不替换，避免无意义地触发「筛选变化回到第一页」。 */
export function setColumnFilter<T extends string | number>(
  current: { value: T[] },
  next: readonly T[],
) {
  const values = [...next];
  if (
    current.value.length === values.length &&
    current.value.every((item, index) => item === values[index])
  ) {
    return;
  }
  current.value = values;
}
