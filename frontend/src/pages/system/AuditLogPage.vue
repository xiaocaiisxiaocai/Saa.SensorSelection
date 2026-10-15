<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { message } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import { RotateCcw, Search } from 'lucide-vue-next';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';

import { api, ApiError, type AuditOperationItem } from '@/api';
import { formatLocalDateTime } from '@/domain';
import { useResizableColumns } from '@/pages/shared/column-widths';
import {
  columnFilter,
  columnFilterValues,
  isColumnFilterChange,
  PAGINATION_PROPS,
  rowClick,
  scrollX,
  type ColumnFilterMap,
} from '@/pages/shared/table';
import AuditOperationDrawer from '@/pages/system/audit/AuditOperationDrawer.vue';
import {
  entryName,
  operationKindOptions,
  entrySummary,
  operationObject,
  operationSummary,
  operationTitle,
} from '@/pages/system/audit/audit-changes';

import '../shared/selection-page.css';

/*
 * 操作日志按「一次操作」列出：用户在界面上点一下保存 / 删除产生的多条日志归成一行，
 * 变更摘要说清改了什么，点开右侧抽屉看每个字段改前改后。
 */

// 「操作」筛选按操作类型：选项是日志里实际出现过的类型，和「操作」列显示的名称对得上
const kindOptions = ref<ReturnType<typeof operationKindOptions>>([]);

async function loadKinds() {
  try {
    kindOptions.value = operationKindOptions(
      await api.listAuditOperationKinds(),
    );
  } catch {
    // 选项加载失败不影响列表，下次加载数据时再试
  }
}

/** 选中的显示文字 → 后端的操作类型 / 操作码 */
function selectedKinds(): string[] {
  return kindOptions.value
    .filter((option) => filters.actions.includes(option.value))
    .flatMap((option) => option.kinds);
}
// 「用户」筛选：日志里出现过的用户，显示名和账号都列出来，按账号筛
const userOptions = ref<{ label: string; value: string }[]>([]);

async function loadUsers() {
  try {
    userOptions.value = (await api.listAuditOperationUsers()).map((user) => ({
      label:
        user.displayName && user.displayName !== user.username
          ? `${user.displayName}（${user.username}）`
          : user.username,
      value: user.username,
    }));
  } catch {
    // 选项加载失败不影响列表
  }
}

const resultOptions = [
  { label: '成功', value: 'true' },
  { label: '失败', value: 'false' },
];

const loading = ref(false);
const items = ref<AuditOperationItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const selected = ref<AuditOperationItem | null>(null);
const filters = reactive({
  actions: [] as string[],
  dateRange: null as [string, string] | null,
  keyword: '',
  result: '' as string | null,
  users: [] as string[],
});
const hasActiveFilters = computed(
  () =>
    Boolean(filters.keyword.trim()) ||
    filters.actions.length > 0 ||
    Boolean(filters.result) ||
    filters.users.length > 0 ||
    Boolean(filters.dateRange?.some(Boolean)),
);

const baseColumns = computed<TableColumnType[]>(() => [
  // 完整时间戳实测要 140px 文字宽 + 内边距；精确到秒在审计里是有意义的
  {
    key: 'timestamp',
    dataIndex: 'timestamp',
    title: '时间',
    width: 168,
    fixed: 'left',
    // 日期范围在表头里选（自定义筛选面板），选了日期漏斗高亮
    customFilterDropdown: true,
    filteredValue: filters.dateRange?.some(Boolean) ? ['range'] : null,
  },
  {
    key: 'user',
    title: '用户',
    width: 112,
    ...columnFilter({
      options: userOptions.value,
      value: filters.users,
      search: true,
    }),
  },
  {
    key: 'action',
    title: '操作',
    width: 176,
    ...columnFilter({
      options: kindOptions.value,
      value: filters.actions,
      search: true,
    }),
  },
  // 列宽合计 976：1280 屏（内容区约 1024，含展开列）不出横向滚动，宽屏按比例放大
  { key: 'object', title: '对象', width: 176 },
  { key: 'summary', title: '变更摘要', width: 256 },
  {
    key: 'result',
    dataIndex: 'result',
    title: '结果',
    width: 88,
    ...columnFilter({
      options: resultOptions,
      value: filters.result ? [filters.result] : [],
      multiple: false,
    }),
  },
]);
const { columns, onResizeColumn } = useResizableColumns(
  'audit-log',
  () => baseColumns.value,
);

function onTableChange(
  _pagination: unknown,
  nextFilters: ColumnFilterMap,
  _order: unknown,
  extra: { action?: string },
) {
  if (!isColumnFilterChange(extra)) return;
  filters.actions = columnFilterValues(nextFilters, 'action').map(String);
  filters.users = columnFilterValues(nextFilters, 'user').map(String);
  const result = columnFilterValues(nextFilters, 'result').map(String)[0] ?? '';
  filters.result = result === 'true' || result === 'false' ? result : '';
}

watch([page, pageSize], loadData);

onMounted(() => {
  void loadKinds();
  void loadUsers();
  void loadData();
});

// 即改即筛；输入框防抖，避免每敲一个字就请求一次后端。
const FILTER_DEBOUNCE_MS = 300;
let filterTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [
    filters.keyword.trim(),
    filters.actions.join(','),
    filters.result,
    filters.users.join(','),
    filters.dateRange?.[0] ?? null,
    filters.dateRange?.[1] ?? null,
  ],
  () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(applyFilters, FILTER_DEBOUNCE_MS);
  },
);
onBeforeUnmount(() => clearTimeout(filterTimer));

function openDetail(operation: AuditOperationItem) {
  selected.value = operation;
}

function rowExpandable(operation: AuditOperationItem): boolean {
  return operation.entryCount > 1;
}

function resultFilter(): boolean | undefined {
  if (filters.result === 'true') return true;
  if (filters.result === 'false') return false;
  return undefined;
}

// 日志只会有过去的记录：快捷范围都截止到今天，今天之后的日期不可选，
// 面板默认显示上个月和本月（而不是本月和全是禁用日期的下个月）。
// antd-vue 的 presets 不接受函数值，所以每次打开时按当天重新生成。
function buildDatePicker() {
  const today = dayjs();
  const lastDays = (days: number): [Dayjs, Dayjs] => [
    today.subtract(days - 1, 'day'),
    today,
  ];
  return {
    defaultPickerValue: [
      today.subtract(1, 'month').format('YYYY-MM-DD'),
      today.format('YYYY-MM-DD'),
    ] as [string, string],
    presets: [
      { label: '今天', value: lastDays(1) },
      { label: '最近 7 天', value: lastDays(7) },
      { label: '最近 30 天', value: lastDays(30) },
    ],
  };
}
const datePicker = ref(buildDatePicker());

// 日历弹层挂在筛选面板里面，点日历时表头筛选面板不会当成「点到外面」而收起
const dateFilterPanel = ref<HTMLElement>();
function dateFilterContainer(): HTMLElement {
  return dateFilterPanel.value ?? document.body;
}

function onDateRangeChange(
  value: unknown,
  confirm: (options?: { closeDropdown?: boolean }) => void,
) {
  filters.dateRange =
    Array.isArray(value) && value.length === 2
      ? [String(value[0]), String(value[1])]
      : null;
  confirm({ closeDropdown: true });
}

function onDatePickerOpenChange(open: boolean) {
  if (open) datePicker.value = buildDatePicker();
}

function isFutureDate(date: Dayjs): boolean {
  return date.isAfter(dayjs(), 'day');
}

function toIsoStart(dateStr: string | null): string | undefined {
  if (!dateStr) return undefined;
  const date = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toIsoEnd(dateStr: string | null): string | undefined {
  if (!dateStr) return undefined;
  const date = new Date(`${dateStr}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// 筛选/翻页可能连续触发多次加载，响应先后不定；只接受最新一次请求的结果，
// 也只由它关闭 loading，避免旧响应覆盖新结果。
let loadSeq = 0;

async function loadData() {
  const seq = ++loadSeq;
  loading.value = true;
  try {
    const [from, to] = filters.dateRange ?? [null, null];
    const pageData = await api.listAuditOperations({
      kinds: selectedKinds(),
      from: toIsoStart(from),
      keyword: filters.keyword.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
      result: resultFilter(),
      to: toIsoEnd(to),
      users: filters.users,
    });
    if (seq !== loadSeq) return;
    items.value = pageData.items;
    // 表头筛选选项之前没取到（如后端刚重启）时，借这次成功加载补取
    if (kindOptions.value.length === 0) void loadKinds();
    if (userOptions.value.length === 0) void loadUsers();
    total.value = pageData.total;
  } catch (error) {
    if (seq !== loadSeq) return;
    message.error(
      error instanceof ApiError ? error.message : '加载操作日志失败',
    );
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

function applyFilters() {
  // 不在第一页时改页码即可，由页码的 watch 触发加载，避免重复请求
  if (page.value === 1) void loadData();
  else page.value = 1;
}

async function resetFilters() {
  filters.keyword = '';
  filters.actions = [];
  filters.result = '';
  filters.users = [];
  filters.dateRange = null;
  // 重置是明确的一次性操作，不必等防抖
  await nextTick();
  clearTimeout(filterTimer);
  applyFilters();
}
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar audit-toolbar">
      <h1 class="visually-hidden">操作日志</h1>
      <a-input
        v-model:value="filters.keyword"
        class="selection-toolbar__filter"
        placeholder="搜索用户、对象或改动内容"
        aria-label="搜索操作日志"
        allow-clear
      >
        <template #prefix><Search :size="14" /></template>
      </a-input>
      <a-button
        type="text"
        :disabled="!hasActiveFilters"
        aria-label="重置筛选"
        @click="resetFilters"
      >
        <template #icon><RotateCcw :size="14" /></template>
        重置
      </a-button>
    </div>
    <a-table
      :columns="columns"
      :data-source="items"
      row-key="operationId"
      :loading="loading"
      :pagination="false"
      :scroll="{ x: scrollX(columns) }"
      :locale="{ emptyText: '暂无日志' }"
      :custom-row="rowClick(openDetail)"
      :row-expandable="rowExpandable"
      @resize-column="onResizeColumn"
      @change="onTableChange"
    >
      <!-- 「时间」列的表头筛选：日期范围；选完即筛并收起 -->
      <template #customFilterDropdown="{ column, confirm }">
        <div
          v-if="column.key === 'timestamp'"
          ref="dateFilterPanel"
          class="audit-date-filter"
        >
          <a-range-picker
            :value="filters.dateRange"
            value-format="YYYY-MM-DD"
            :placeholder="['开始日期', '结束日期']"
            :presets="datePicker.presets"
            :default-picker-value="datePicker.defaultPickerValue"
            :disabled-date="isFutureDate"
            :get-popup-container="dateFilterContainer"
            aria-label="按日期筛选"
            @open-change="onDatePickerOpenChange"
            @change="(value: unknown) => onDateRangeChange(value, confirm)"
          />
        </div>
      </template>
      <template #bodyCell="{ column, record: row }">
        <template v-if="column.key === 'timestamp'">
          {{ formatLocalDateTime(new Date(row.timestamp)) }}
        </template>
        <template v-else-if="column.key === 'user'">
          <span class="audit-user">{{
            row.displayName || row.username || '—'
          }}</span>
          <span
            v-if="row.displayName && row.username !== row.displayName"
            class="audit-user__account"
          >
            {{ row.username }}
          </span>
        </template>
        <template v-else-if="column.key === 'action'">
          <span class="audit-text">{{ operationTitle(row) }}</span>
          <span v-if="row.entryCount > 1" class="audit-count">
            {{ row.entryCount }} 条记录
          </span>
        </template>
        <template v-else-if="column.key === 'object'">
          <span class="audit-text">{{ operationObject(row) }}</span>
        </template>
        <template v-else-if="column.key === 'summary'">
          <span
            v-if="operationSummary(row)"
            class="audit-text"
            :class="{ 'audit-text--error': !row.result }"
          >
            {{ operationSummary(row) }}
          </span>
          <span v-else class="audit-text audit-text--muted">—</span>
        </template>
        <template v-else-if="column.key === 'result'">
          <a-tag :color="row.result ? 'green' : 'red'">
            {{ row.result ? '成功' : '失败' }}
          </a-tag>
        </template>
      </template>
      <!-- 一次操作含多条记录时展开看每一条 -->
      <template #expandedRowRender="{ record: row }">
        <ol class="audit-entries">
          <li v-for="entry in row.entries" :key="entry.id">
            <span class="audit-entries__name">{{ entryName(entry) }}</span>
            <span
              v-if="entrySummary(entry)"
              :class="{ 'audit-text--error': !entry.result }"
            >
              {{ entrySummary(entry) }}
            </span>
          </li>
        </ol>
      </template>
    </a-table>
    <a-pagination
      v-model:current="page"
      v-model:page-size="pageSize"
      class="table-pagination"
      :total="total"
      v-bind="PAGINATION_PROPS"
    />
    <AuditOperationDrawer v-model="selected" />
  </section>
</template>

<style scoped src="./AuditLogPage.css"></style>
