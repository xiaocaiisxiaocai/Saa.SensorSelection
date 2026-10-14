<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { message } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import { RotateCcw } from 'lucide-vue-next';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';

import { api, ApiError, type AuditLogItem } from '@/api';
import { formatLocalDateTime } from '@/domain';
import {
  cellText,
  columnFilter,
  columnFilterValues,
  isColumnFilterChange,
  PAGINATION_PROPS,
  rowClick,
  scrollX,
  type ColumnFilterMap,
} from '@/pages/shared/table';
import AuditDetailDialog from '@/pages/system/audit/AuditDetailDialog.vue';
import { ACTION_LABELS, actionLabel } from '@/pages/system/audit/audit-actions';
import { formatAuditTarget } from '@/pages/system/audit-target';

import '../shared/selection-page.css';

const actionOptions = Object.entries(ACTION_LABELS).map(([value, label]) => ({
  label,
  value,
}));
const resultOptions = [
  { label: '成功', value: 'true' },
  { label: '失败', value: 'false' },
];

const loading = ref(false);
const items = ref<AuditLogItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const selectedLog = ref<AuditLogItem | null>(null);
const filters = reactive({
  action: '' as string | null,
  dateRange: null as [string, string] | null,
  result: '' as string | null,
  username: '',
});
const hasActiveFilters = computed(
  () =>
    Boolean(filters.username.trim()) ||
    Boolean(filters.action) ||
    Boolean(filters.result) ||
    Boolean(filters.dateRange?.some(Boolean)),
);

const columns = computed<TableColumnType[]>(() => [
  // 192 而非 180：完整时间戳实测要 168px 文字宽 + 16px 内边距，180 会被截成
  // 「2026-08-17 20:00:…」，而审计日志里精确到秒是有意义的。
  {
    key: 'timestamp',
    dataIndex: 'timestamp',
    title: '时间',
    width: 192,
    fixed: 'left',
  },
  {
    key: 'username',
    dataIndex: 'username',
    title: '用户',
    width: 120,
  },
  {
    key: 'action',
    dataIndex: 'action',
    title: '操作',
    width: 120,
    ...columnFilter({
      options: actionOptions,
      value: filters.action ? [filters.action] : [],
      multiple: false,
      search: true,
    }),
  },
  // 失败原因不再单独占一列（绝大多数行是空的），失败时显示在目标下方
  {
    key: 'target',
    dataIndex: 'target',
    title: '目标',
    width: 240,
    align: 'left',
  },
  { key: 'detail', dataIndex: 'detail', title: '详情', width: 96 },
  {
    key: 'result',
    dataIndex: 'result',
    title: '结果',
    width: 112,
    ...columnFilter({
      options: resultOptions,
      value: filters.result ? [filters.result] : [],
      multiple: false,
    }),
  },
  { key: 'ip', dataIndex: 'ip', title: 'IP', width: 120 },
]);

function onTableChange(
  _pagination: unknown,
  nextFilters: ColumnFilterMap,
  _order: unknown,
  extra: { action?: string },
) {
  if (!isColumnFilterChange(extra)) return;
  const action = columnFilterValues(nextFilters, 'action').map(String)[0] ?? '';
  const result = columnFilterValues(nextFilters, 'result').map(String)[0] ?? '';
  filters.action = action;
  filters.result = result === 'true' || result === 'false' ? result : '';
}

watch([page, pageSize], loadData);

onMounted(loadData);

// 和其它页面一样即改即筛；输入框防抖，避免每敲一个字就请求一次后端。
const FILTER_DEBOUNCE_MS = 300;
let filterTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [
    filters.username.trim(),
    filters.action,
    filters.result,
    filters.dateRange?.[0] ?? null,
    filters.dateRange?.[1] ?? null,
  ],
  () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(applyFilters, FILTER_DEBOUNCE_MS);
  },
);
onBeforeUnmount(() => clearTimeout(filterTimer));

function openDetail(log: AuditLogItem) {
  selectedLog.value = log;
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
    const pageData = await api.listAuditLogs({
      action: filters.action || undefined,
      from: toIsoStart(from),
      page: page.value,
      pageSize: pageSize.value,
      result: resultFilter(),
      to: toIsoEnd(to),
      username: filters.username.trim() || undefined,
    });
    if (seq !== loadSeq) return;
    items.value = pageData.items;
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
  filters.username = '';
  filters.action = '';
  filters.result = '';
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
        v-model:value="filters.username"
        class="selection-toolbar__filter audit-toolbar__user"
        placeholder="操作用户"
        aria-label="操作用户"
        allow-clear
      />
      <a-range-picker
        v-model:value="filters.dateRange"
        class="audit-toolbar__date"
        value-format="YYYY-MM-DD"
        :placeholder="['开始日期', '结束日期']"
        :presets="datePicker.presets"
        :default-picker-value="datePicker.defaultPickerValue"
        :disabled-date="isFutureDate"
        @open-change="onDatePickerOpenChange"
      />
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
      row-key="id"
      :loading="loading"
      :pagination="false"
      :scroll="{ x: scrollX(columns) }"
      :locale="{ emptyText: '暂无日志' }"
      :custom-row="rowClick(openDetail)"
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record: row, text: value }">
        <template v-if="column.key === 'timestamp'">
          {{ formatLocalDateTime(new Date(row.timestamp)) }}
        </template>
        <template v-else-if="column.key === 'username'">
          {{ value || '—' }}
        </template>
        <template v-else-if="column.key === 'action'">
          {{ actionLabel(row.action) }}
        </template>
        <template v-else-if="column.key === 'target'">
          <span class="audit-target" :title="row.target || undefined">
            {{ formatAuditTarget(row.target) || '—' }}
          </span>
          <span v-if="!row.result && row.error" class="audit-target__error">
            {{ row.error }}
          </span>
        </template>
        <template v-else-if="column.key === 'detail'">
          <a-button type="link" size="small" @click.stop="openDetail(row)">
            查看
          </a-button>
        </template>
        <template v-else-if="column.key === 'result'">
          <a-tag :color="row.result ? 'green' : 'red'">
            {{ row.result ? '成功' : '失败' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'ip'">{{ value || '—' }}</template>
        <template v-else>{{ cellText(value) }}</template>
      </template>
    </a-table>
    <a-pagination
      v-model:current="page"
      v-model:page-size="pageSize"
      class="table-pagination"
      :total="total"
      v-bind="PAGINATION_PROPS"
    />
    <AuditDetailDialog v-model="selectedLog" />
  </section>
</template>

<style scoped src="./AuditLogPage.css"></style>
