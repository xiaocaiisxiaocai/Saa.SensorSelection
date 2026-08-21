<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';

import { api, ApiError, type AuditLogItem } from '@/api';
import { formatLocalDateTime } from '@/domain';
import { toast } from '@/ui/toast';
import {
  ABadge,
  AButton,
  ADatePicker,
  AField,
  APagination,
  ASelect,
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
  { label: '全部', value: '' },
  { label: '成功', value: 'true' },
  { label: '失败', value: 'false' },
];

const loading = ref(false);
const items = ref<AuditLogItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const filters = reactive({
  action: '' as string | null,
  dateRange: null as [string | null, string | null] | null,
  result: '' as string | null,
  username: '',
});

const columns: TableColumn[] = [
  { key: 'timestamp', label: '时间', width: 180 },
  { key: 'username', label: '用户', width: 120 },
  { key: 'action', label: '操作', width: 120 },
  { key: 'target', label: '目标', minWidth: 140, ellipsis: true },
  { key: 'detail', label: '详情', minWidth: 180, ellipsis: true },
  { key: 'result', label: '结果', width: 88 },
  { key: 'error', label: '说明', minWidth: 140, ellipsis: true },
  { key: 'ip', label: 'IP', width: 130 },
];

watch([page, pageSize], loadData);

onMounted(loadData);

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

function resultFilter(): boolean | undefined {
  if (filters.result === 'true') return true;
  if (filters.result === 'false') return false;
  return undefined;
}

async function loadData() {
  loading.value = true;
  try {
    const [from, to] = filters.dateRange ?? [null, null];
    const pageData = await api.listAuditLogs({
      action: filters.action || undefined,
      from: from ? `${from}T00:00:00.000Z` : undefined,
      page: page.value,
      pageSize: pageSize.value,
      result: resultFilter(),
      to: to ? `${to}T23:59:59.999Z` : undefined,
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
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar">
      <h1 class="docs-heading">操作日志</h1>
      <AField
        v-model="filters.username"
        class="selection-toolbar__filter"
        placeholder="操作用户"
      />
      <ASelect
        v-model="filters.action"
        class="selection-toolbar__filter"
        :options="actionOptions"
        placeholder="全部操作"
        clearable
      />
      <ASelect
        v-model="filters.result"
        class="selection-toolbar__filter"
        :options="resultOptions"
        placeholder="全部"
        clearable
      />
      <ADatePicker
        v-model="filters.dateRange"
        range
        :placeholder="['开始时间', '结束时间']"
      />
      <AButton variant="filled" @click="search">筛选</AButton>
    </div>
    <ATable
      :columns="columns"
      :rows="items"
      row-key="id"
      empty-text="暂无日志"
      :loading="loading"
      striped
    >
      <template #cell-timestamp="{ row }">
        {{ formatLocalDateTime(new Date(row.timestamp)) }}
      </template>
      <template #cell-username="{ value }">{{ value || '—' }}</template>
      <template #cell-action="{ row }">{{ actionLabel(row.action) }}</template>
      <template #cell-target="{ value }">{{ value || '—' }}</template>
      <template #cell-detail="{ value }">{{ value || '—' }}</template>
      <template #cell-result="{ row }">
        <ABadge
          :label="row.result ? '成功' : '失败'"
          :tone="row.result ? 'green' : 'red'"
        />
      </template>
      <template #cell-error="{ value }">{{ value || '—' }}</template>
      <template #cell-ip="{ value }">{{ value || '—' }}</template>
    </ATable>
    <APagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
  </section>
</template>
