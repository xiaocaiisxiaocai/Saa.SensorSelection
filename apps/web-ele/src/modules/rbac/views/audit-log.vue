<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';

import {
  ElButton,
  ElDatePicker,
  ElInput,
  ElMessage,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';

import { api, type AuditLogItem } from '#/modules/selection/api';

/** 操作码 → 中文标签（后端 AuditLog.Action）。 */
const ACTION_LABELS: Record<string, string> = {
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

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

const loading = ref(false);
const items = ref<AuditLogItem[]>([]);
const total = ref(0);
const filters = reactive({
  action: '',
  dateRange: undefined as [Date, Date] | undefined,
  result: '' as '' | 'false' | 'true',
  username: '',
});
const pagination = reactive({
  page: 1,
  pageSize: 20,
});

async function loadData() {
  loading.value = true;
  try {
    const page = await api.listAuditLogs({
      action: filters.action || undefined,
      from: filters.dateRange?.[0]?.toISOString(),
      page: pagination.page,
      pageSize: pagination.pageSize,
      result: resultFilter(),
      to: filters.dateRange?.[1]?.toISOString(),
      username: filters.username.trim() || undefined,
    });
    items.value = page.items;
    total.value = page.total;
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : '加载操作日志失败',
    );
  } finally {
    loading.value = false;
  }
}

function resultFilter(): boolean | undefined {
  if (filters.result === 'true') return true;
  if (filters.result === 'false') return false;
  return undefined;
}

function search() {
  pagination.page = 1;
  loadData();
}

function resetFilters() {
  Object.assign(filters, {
    action: '',
    dateRange: undefined,
    result: '',
    username: '',
  });
  pagination.page = 1;
  loadData();
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', { hour12: false });
}

onMounted(loadData);
</script>

<template>
  <div class="rbac-page">
    <div class="rbac-page__toolbar">
      <h2 class="rbac-page__title">操作日志</h2>
      <div class="rbac-audit__filters">
        <ElInput
          v-model="filters.username"
          clearable
          placeholder="操作用户"
          style="width: 150px"
          @keyup.enter="search"
        />
        <ElSelect
          v-model="filters.action"
          clearable
          placeholder="全部操作"
          style="width: 150px"
        >
          <ElOption
            v-for="(label, code) in ACTION_LABELS"
            :key="code"
            :label="label"
            :value="code"
          />
        </ElSelect>
        <ElSelect
          v-model="filters.result"
          clearable
          placeholder="全部结果"
          style="width: 120px"
        >
          <ElOption label="成功" value="true" />
          <ElOption label="失败" value="false" />
        </ElSelect>
        <ElDatePicker
          :model-value="filters.dateRange"
          end-placeholder="结束时间"
          start-placeholder="开始时间"
          style="width: 320px"
          type="datetimerange"
          @update:model-value="
            (value) => {
              filters.dateRange =
                value == null ? undefined : (value as [Date, Date]);
            }
          "
        />
        <ElButton type="primary" @click="search">查询</ElButton>
        <ElButton @click="resetFilters">重置</ElButton>
      </div>
    </div>

    <div class="rbac-panel">
      <ElTable :data="items" stripe v-loading="loading">
        <ElTableColumn label="时间" min-width="170">
          <template #default="{ row }">
            {{ formatTime(row.timestamp) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="用户" min-width="110">
          <template #default="{ row }">
            <span>{{ row.username || '（匿名）' }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" min-width="110">
          <template #default="{ row }">{{ actionLabel(row.action) }}</template>
        </ElTableColumn>
        <ElTableColumn label="目标" min-width="160">
          <template #default="{ row }">
            <span :title="row.target ?? ''">{{ row.target || '—' }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="详情" min-width="140">
          <template #default="{ row }">
            <span :title="row.detail ?? ''">{{ row.detail || '—' }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="结果" width="90">
          <template #default="{ row }">
            <ElTag :type="row.result ? 'success' : 'danger'" size="small">
              {{ row.result ? '成功' : '失败' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="说明" min-width="160">
          <template #default="{ row }">
            <span :title="row.error ?? ''" class="rbac-muted">
              {{ row.error || '—' }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="IP" width="130">
          <template #default="{ row }">
            <span class="rbac-muted">{{ row.ip || '—' }}</span>
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="rbac-audit__pagination">
        <ElPagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[20, 50, 100]"
          :total="total"
          background
          layout="total, sizes, prev, pager, next"
          @current-change="loadData"
          @size-change="search"
        />
      </div>
      <p class="rbac-hint">
        记录登录、业务数据写入/删除与用户/角色/组织管理操作；失败操作同样记录（含原因）。超过保留上限的旧记录会被自动清理。
      </p>
    </div>
  </div>
</template>

<style scoped>
.rbac-audit__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.rbac-audit__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

<style src="../rbac.css"></style>
