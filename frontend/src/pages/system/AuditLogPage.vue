<script setup lang="ts">
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
import { toast } from '@/ui/toast';
import { formatAuditTarget } from './audit-target';
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
  type TableSortState,
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
  // 缺了这条时表格会直接显示原始操作码 store.entity-groups.reorder，
  // 又长又要折行，和其他行的中文标签也对不齐。
  'store.entity-groups.reorder': '调整分类顺序',
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
// 日志是服务端分页的，排序必须下推给后端，否则只排到当前这 20 条。
const sort = ref<TableSortState | null>(null);
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
  // 192 而非 180：完整时间戳实测要 168px 文字宽 + 16px 内边距，180 会被截成
  // 「2026-08-17 20:00:…」，而审计日志里精确到秒是有意义的。
  { key: 'timestamp', label: '时间', width: 192, fixed: 'start', sortable: true },
  { key: 'username', label: '用户', width: 120, sortable: true },
  // 「操作」列显示的是中文标签、排序依据却是底层操作码，排出来看着像乱序，
  // 且已有专门的操作类型筛选，这里不提供排序。
  { key: 'action', label: '操作', width: 120 },
  // 失败原因不再单独占一列（绝大多数行是空的），失败时显示在目标下方
  {
    key: 'target',
    label: '目标',
    minWidth: 240,
    align: 'start',
  },
  { key: 'detail', label: '详情', width: 96 },
  { key: 'result', label: '结果', width: 88, sortable: true },
  { key: 'ip', label: 'IP', width: 120 },
];

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

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

function openDetail(log: AuditLogItem) {
  selectedLog.value = log;
  detailOpen.value = true;
}

/*
 * 业务详情是后端拼出来的「键：值；键：值」串，直接原样显示就是一大坨，
 * 和上面那些整齐的标签-值行格格不入。这里把它还原成结构化的行。
 *
 * 格式不是登录独有的：用户增改、组织、角色、数据写入都用同一套拼法，
 * 所以按通用规则解析；任何一条对不上格式的，整体退回纯文本显示，
 * 避免把没见过的写法解析得七零八落。
 */
const parsedDetail = computed(() => {
  const raw = selectedLog.value?.detail?.trim();
  if (!raw) return null;

  const summary: string[] = [];
  const pairs: { label: string; value: string; items?: string[] }[] = [];
  for (const segment of raw.split('；')) {
    const text = segment.trim();
    if (!text) continue;
    const at = text.indexOf('：');
    if (at <= 0) {
      // 没有「：」的段是「登录成功」这类独立短语，留作开头一句话
      if (pairs.length > 0) return null;
      summary.push(text);
      continue;
    }
    const label = text.slice(0, at).trim();
    const value = text.slice(at + 1).trim();
    if (!label) return null;
    const items = value.includes('、')
      ? value.split('、').map((item) => item.trim()).filter(Boolean)
      : undefined;
    pairs.push({ label, value: value || '—', items });
  }

  // 一个键值对都没有说明这就是一句普通话，按原文显示即可
  if (pairs.length === 0) return null;
  return { summary: summary.join('；'), pairs };
});

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
      direction: sort.value
        ? sort.value.direction === 'ascending'
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
    items.value = pageData.items;
    total.value = pageData.total;
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : '加载操作日志失败');
  } finally {
    loading.value = false;
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
      />
      <ASelect
        v-model="filters.result"
        class="selection-toolbar__filter audit-toolbar__result"
        :options="resultOptions"
        placeholder="全部结果"
        aria-label="操作结果筛选"
      />
      <ADatePicker
        v-model="filters.dateRange"
        class="audit-toolbar__date"
        range
        :placeholder="['开始时间', '结束时间']"
      />
      <AFilterResetButton :active="hasActiveFilters" @reset="resetFilters" />
    </div>
    <ATable
      v-model:sort="sort"
      storage-key="audit-log"
      :columns="columns"
      :rows="items"
      row-key="id"
      empty-text="暂无日志"
      :loading="loading"
      @activate="openDetail"
    >
      <template #cell-timestamp="{ row }">
        {{ formatLocalDateTime(new Date(row.timestamp)) }}
      </template>
      <template #cell-username="{ value }">{{ value || '—' }}</template>
      <template #cell-action="{ row }">{{ actionLabel(row.action) }}</template>
      <template #cell-target="{ row }">
        <span class="audit-target" :title="row.target || undefined">
          {{ formatAuditTarget(row.target) || '—' }}
        </span>
        <span v-if="!row.result && row.error" class="audit-target__error">
          {{ row.error }}
        </span>
      </template>
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
          <dd>{{ formatAuditTarget(selectedLog.target) || '—' }}</dd>
        </div>
        <div
          v-if="
            selectedLog.target &&
              formatAuditTarget(selectedLog.target) !== selectedLog.target
          "
          class="audit-detail__row"
        >
          <dt>目标键</dt>
          <dd class="audit-detail__mono">{{ selectedLog.target }}</dd>
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
          <dd>
            <template v-if="parsedDetail">
              <p v-if="parsedDetail.summary" class="audit-detail__summary">
                {{ parsedDetail.summary }}
              </p>
              <dl class="audit-detail__pairs">
                <div
                  v-for="pair in parsedDetail.pairs"
                  :key="pair.label"
                  class="audit-detail__pair"
                >
                  <dt>{{ pair.label }}</dt>
                  <dd>
                    <!-- 权限/角色这类是顿号分隔的长列表，排成标签块比挤成
                         一行好读；单值仍然按普通文本显示。 -->
                    <span v-if="pair.items" class="audit-detail__tags">
                      <span
                        v-for="item in pair.items"
                        :key="item"
                        class="audit-detail__tag"
                      >
                        {{ item }}
                      </span>
                    </span>
                    <template v-else>{{ pair.value }}</template>
                  </dd>
                </div>
              </dl>
            </template>
            <template v-else>{{ selectedLog.detail || '—' }}</template>
          </dd>
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

  /* h1 现在是 visually-hidden（绝对定位，不参与网格布局），
     所以这里少了一列——直接从筛选字段开始。 */
  grid-template-columns:
    minmax(8rem, 1fr) minmax(8rem, 1fr) minmax(6rem, 0.75fr)
    minmax(17rem, 1.5fr) auto;
  gap: var(--space-2);
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

  .audit-toolbar__user,
  .audit-toolbar__date {
    grid-column: 1 / -1;
  }
}

.audit-target,
.audit-target__error {
  display: block;
}

.audit-target__error {
  margin-top: var(--space-1);
  font: var(--text-caption);
  color: var(--sys-red);
}

.audit-detail__mono {
  font-family: var(--font-mono);
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

/* 业务详情里解析出来的键值对：沿用外层的标签列宽，视觉上连成一套 */
.audit-detail__summary {
  margin: 0 0 var(--space-3);
}

.audit-detail__pairs {
  display: grid;
  gap: var(--space-2);
  margin: 0;
}

.audit-detail__pair {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: baseline;
}

.audit-detail__pair dt {
  font: var(--text-caption);
  color: var(--label-2);
}

.audit-detail__pair dd {
  font: var(--text-caption);
  white-space: normal;
}

.audit-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.audit-detail__tag {
  padding: 1px var(--space-2);
  font: var(--text-caption);
  color: var(--label-2);
  background: var(--fill-3);
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
</style>
