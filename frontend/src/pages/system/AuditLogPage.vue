<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

import { api, ApiError, type AuditLogItem } from '@/api';
import { formatLocalDateTime } from '@/domain';
import { toast } from '@/ui/toast';
import {
  ABadge,
  AButton,
  ADatePicker,
  AField,
  AFilterResetButton,
  APagination,
  ASelect,
  ASheet,
  ATable,
  type SelectOption,
  type TableColumn,
} from '@/ui';

import '../shared/selection-page.css';

const ACTION_LABELS: Record<string, string> = {
  'auth.change-password': '修改密码',
  'auth.login': '登录',
  'org.create': '创建组织',
  'org.delete': '删除组织',
  'org.update': '更新组织',
  'role.create': '创建角色',
  'role.delete': '删除角色',
  'role.update': '更新角色',
  'store.delete': '删除数据',
  'store.replace-all': '整体导入',
  'store.upsert': '写入数据',
  'user.create': '创建用户',
  'user.delete': '删除用户',
  'user.reset-password': '重置密码',
  'user.update': '更新用户',
};

const actionOptions: SelectOption[] = [
  { label: '全部操作', value: '' },
  ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ label, value })),
];
const resultOptions: SelectOption[] = [
  { label: '全部结果', value: '' },
  { label: '成功', value: 'true' },
  { label: '失败', value: 'false' },
];

const loading = ref(false);
const items = ref<AuditLogItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const detailOpen = ref(false);
const selectedLog = ref<AuditLogItem | null>(null);
const filters = reactive({
  action: '' as string | null,
  dateRange: null as [string | null, string | null] | null,
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

const columns: TableColumn[] = [
  { key: 'timestamp', label: '时间', width: 180, fixed: 'start' },
  { key: 'username', label: '用户', width: 120 },
  { key: 'action', label: '操作', width: 120 },
  {
    key: 'target',
    label: '目标',
    minWidth: 180,
    ellipsis: true,
    align: 'start',
  },
  { key: 'detail', label: '详情', width: 96 },
  { key: 'result', label: '结果', width: 88 },
  {
    key: 'error',
    label: '说明',
    minWidth: 180,
    ellipsis: true,
    align: 'start',
  },
  { key: 'ip', label: 'IP', width: 120 },
];

watch([page, pageSize], loadData);

onMounted(loadData);

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

function openDetail(log: AuditLogItem) {
  selectedLog.value = log;
  detailOpen.value = true;
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

async function loadData() {
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
    items.value = pageData.items;
    total.value = pageData.total;
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : '加载操作日志失败');
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  void loadData();
}

function resetFilters() {
  const reloadOnCurrentPage = page.value === 1;
  filters.username = '';
  filters.action = '';
  filters.result = '';
  filters.dateRange = null;
  page.value = 1;
  if (reloadOnCurrentPage) void loadData();
}
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar audit-toolbar">
      <h1 class="docs-heading">操作日志</h1>
      <AField
        v-model="filters.username"
        class="selection-toolbar__filter audit-toolbar__user"
        placeholder="操作用户"
        aria-label="操作用户"
      />
      <ASelect
        v-model="filters.action"
        class="selection-toolbar__filter audit-toolbar__action"
        :options="actionOptions"
        placeholder="全部操作"
        aria-label="操作类型筛选"
        clearable
      />
      <ASelect
        v-model="filters.result"
        class="selection-toolbar__filter audit-toolbar__result"
        :options="resultOptions"
        placeholder="全部结果"
        aria-label="操作结果筛选"
        clearable
      />
      <ADatePicker
        v-model="filters.dateRange"
        class="audit-toolbar__date"
        range
        :placeholder="['开始时间', '结束时间']"
      />
      <AButton variant="filled" @click="search">筛选</AButton>
      <AFilterResetButton :active="hasActiveFilters" @reset="resetFilters" />
    </div>
    <ATable
      :columns="columns"
      :rows="items"
      row-key="id"
      empty-text="暂无日志"
      :loading="loading"
      striped
      virtual
    >
      <template #cell-timestamp="{ row }">
        {{ formatLocalDateTime(new Date(row.timestamp)) }}
      </template>
      <template #cell-username="{ value }">{{ value || '—' }}</template>
      <template #cell-action="{ row }">{{ actionLabel(row.action) }}</template>
      <template #cell-target="{ value }">{{ value || '—' }}</template>
      <template #cell-detail="{ row }">
        <AButton
          size="small"
          variant="borderless"
          @click.stop="openDetail(row)"
        >
          查看
        </AButton>
      </template>
      <template #cell-result="{ row }">
        <ABadge
          :label="row.result ? '成功' : '失败'"
          :tone="row.result ? 'green' : 'red'"
        />
      </template>
      <template #cell-error="{ value }">{{ value || '—' }}</template>
      <template #cell-ip="{ value }">{{ value || '—' }}</template>
    </ATable>
    <APagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
    />
    <ASheet v-model:open="detailOpen" title="操作详情" :width="640">
      <dl v-if="selectedLog" class="audit-detail">
        <div class="audit-detail__row">
          <dt>日志编号</dt>
          <dd>#{{ selectedLog.id }}</dd>
        </div>
        <div class="audit-detail__row">
          <dt>时间</dt>
          <dd>{{ formatLocalDateTime(new Date(selectedLog.timestamp)) }}</dd>
        </div>
        <div class="audit-detail__row">
          <dt>用户</dt>
          <dd>{{ selectedLog.username || '—' }}</dd>
        </div>
        <div class="audit-detail__row">
          <dt>操作</dt>
          <dd>{{ actionLabel(selectedLog.action) }}</dd>
        </div>
        <div class="audit-detail__row">
          <dt>操作编码</dt>
          <dd>{{ selectedLog.action }}</dd>
        </div>
        <div class="audit-detail__row">
          <dt>目标</dt>
          <dd>{{ selectedLog.target || '—' }}</dd>
        </div>
        <div class="audit-detail__row">
          <dt>结果</dt>
          <dd>
            <ABadge
              :label="selectedLog.result ? '成功' : '失败'"
              :tone="selectedLog.result ? 'green' : 'red'"
            />
          </dd>
        </div>
        <div class="audit-detail__row">
          <dt>IP</dt>
          <dd>{{ selectedLog.ip || '—' }}</dd>
        </div>
        <div class="audit-detail__row audit-detail__row--wide">
          <dt>业务详情</dt>
          <dd>{{ selectedLog.detail || '—' }}</dd>
        </div>
        <div class="audit-detail__row audit-detail__row--wide">
          <dt>说明</dt>
          <dd>{{ selectedLog.error || '—' }}</dd>
        </div>
      </dl>
      <template #footer>
        <AButton @click="detailOpen = false">关闭</AButton>
      </template>
    </ASheet>
  </section>
</template>

<style scoped>
.audit-toolbar {
  display: grid;
  grid-template-columns:
    auto minmax(8rem, 1fr) minmax(8rem, 1fr) minmax(6rem, 0.75fr)
    minmax(17rem, 1.5fr) auto auto;
  gap: var(--space-2);
}

.audit-toolbar .docs-heading {
  margin-right: 0;
}

.audit-toolbar .selection-toolbar__filter,
.audit-toolbar__date {
  width: 100%;
  min-width: 0;
}

@media (width <= 60rem) {
  .audit-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .audit-toolbar .docs-heading,
  .audit-toolbar__user,
  .audit-toolbar__date {
    grid-column: 1 / -1;
  }
}

.audit-detail {
  display: grid;
  gap: var(--space-3);
  margin: 0;
}

.audit-detail__row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
  min-height: var(--control-height-md);
  padding-bottom: var(--space-3);
  border-bottom: 0.5px solid var(--separator);
}

.audit-detail__row--wide {
  grid-template-columns: 1fr;
  gap: var(--space-2);
}

.audit-detail dt {
  color: var(--label-2);
  font: var(--text-control-em);
}

.audit-detail dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--label);
  font: var(--text-control);
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
