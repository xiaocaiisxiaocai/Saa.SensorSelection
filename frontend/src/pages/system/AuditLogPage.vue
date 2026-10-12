<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { message } from 'ant-design-vue';
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
  PAGINATION_PROPS,
  rowClick,
  scrollX,
  sortFromChange,
  sortOrderOf,
  type TableSortState,
} from '@/pages/shared/table';
import AuditDetailDialog from '@/pages/system/audit/AuditDetailDialog.vue';
import { ACTION_LABELS, actionLabel } from '@/pages/system/audit/audit-actions';
import { formatAuditTarget } from '@/pages/system/audit-target';

import '../shared/selection-page.css';

const actionOptions = [
  { label: '全部操作', value: '' },
  ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ label, value })),
];
const resultOptions = [
  { label: '全部结果', value: '' },
  { label: '成功', value: 'true' },
  { label: '失败', value: 'false' },
];

const loading = ref(false);
const items = ref<AuditLogItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const selectedLog = ref<AuditLogItem | null>(null);
// 日志是服务端分页的，排序必须下推给后端，否则只排到当前这 20 条。
const sort = ref<TableSortState | null>(null);
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

// 受控排序：sortOrder 要跟着 sort 变，所以列定义必须是 computed
const columns = computed<TableColumnType[]>(() => [
  // 192 而非 180：完整时间戳实测要 168px 文字宽 + 16px 内边距，180 会被截成
  // 「2026-08-17 20:00:…」，而审计日志里精确到秒是有意义的。
  {
    key: 'timestamp',
    dataIndex: 'timestamp',
    title: '时间',
    width: 192,
    fixed: 'left',
    sorter: true,
    sortOrder: sortOrderOf(sort.value, 'timestamp'),
  },
  {
    key: 'username',
    dataIndex: 'username',
    title: '用户',
    width: 120,
    sorter: true,
    sortOrder: sortOrderOf(sort.value, 'username'),
  },
  // 「操作」列显示的是中文标签、排序依据却是底层操作码，排出来看着像乱序，
  // 且已有专门的操作类型筛选，这里不提供排序。
  { key: 'action', dataIndex: 'action', title: '操作', width: 120 },
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
    width: 88,
    sorter: true,
    sortOrder: sortOrderOf(sort.value, 'result'),
  },
  { key: 'ip', dataIndex: 'ip', title: 'IP', width: 120 },
]);

watch([page, pageSize], loadData);
watch(sort, () => {
  // 换了排序，原来的页码没有意义了，回到第一页重新取。
  if (page.value === 1) void loadData();
  else page.value = 1;
});

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
      direction: sort.value
        ? sort.value.order === 'ascend'
          ? 'asc'
          : 'desc'
        : undefined,
      from: toIsoStart(from),
      page: page.value,
      pageSize: pageSize.value,
      result: resultFilter(),
      sort: sort.value?.key,
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
      <a-select
        v-model:value="filters.action"
        class="selection-toolbar__filter audit-toolbar__action"
        :options="actionOptions"
        placeholder="全部操作"
        aria-label="操作类型筛选"
      />
      <a-select
        v-model:value="filters.result"
        class="selection-toolbar__filter audit-toolbar__result"
        :options="resultOptions"
        placeholder="全部结果"
        aria-label="操作结果筛选"
      />
      <a-range-picker
        v-model:value="filters.dateRange"
        class="audit-toolbar__date"
        value-format="YYYY-MM-DD"
        :placeholder="['开始时间', '结束时间']"
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
      @change="
        (_p: unknown, _f: unknown, sorter: unknown) =>
          (sort = sortFromChange(sorter))
      "
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
