<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { History, Pencil, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import type { TimelineItem } from '@/domain';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import {
  cellText,
  rowClick,
  scrollX,
  sortBy,
  useTablePagination,
} from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import FeedbackFormDialog from './FeedbackFormDialog.vue';
import FeedbackHistoryDialog from './FeedbackHistoryDialog.vue';

const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const formDialog = ref<InstanceType<typeof FeedbackFormDialog>>();
const historyItem = ref<TimelineItem>();
const query = ref('');
const typeFilters = ref<Array<string | number>>([]);
const statusFilters = ref<Array<string | number>>([]);

const typeOptions = computed(() =>
  store
    .dictionaryNames('customer-feedback')
    .map((name) => ({ label: name, value: name })),
);
const statusOptions = computed(() =>
  store
    .dictionaryNames('customer-feedback-status')
    .map((name) => ({ label: name, value: name })),
);

const items = computed(
  () =>
    store.crudItems('customer-feedback', props.entityName) as TimelineItem[],
);
const filtered = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return items.value.filter(
    (item) =>
      (typeFilters.value.length === 0 ||
        typeFilters.value.includes(item.type)) &&
      (statusFilters.value.length === 0 ||
        statusFilters.value.includes(item.status)) &&
      (!value ||
        [
          item.type,
          item.machine,
          item.problem,
          item.measure,
          item.date,
          item.status,
        ]
          .join(' ')
          .toLocaleLowerCase('zh-CN')
          .includes(value)),
  );
});
const hasActiveFilters = computed(
  () =>
    Boolean(query.value.trim()) ||
    typeFilters.value.length > 0 ||
    statusFilters.value.length > 0,
);
const columns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    // 168：最长字典值「02 两片检测品质异常」实测 143px + 左右内边距 16px。
    {
      key: 'type',
      dataIndex: 'type',
      title: '问题分类',
      width: 168,
      fixed: 'left',
      sorter: sortBy('type'),
    },
    { key: 'machine', dataIndex: 'machine', title: '适用机型', width: 90 },
    { key: 'problem', dataIndex: 'problem', title: '问题点', width: 205 },
    { key: 'measure', dataIndex: 'measure', title: '改善对策', width: 205 },
    // 120：完整日期「2026-08-25」按表格的等宽数字实测 98px + 左右内边距 16px。
    {
      key: 'date',
      dataIndex: 'date',
      title: '反馈时间',
      width: 120,
      sorter: sortBy('date'),
    },
    {
      key: 'status',
      dataIndex: 'status',
      title: '处理状态',
      width: 112,
      sorter: sortBy('status'),
    },
    { key: 'history', dataIndex: 'history', title: '历史', width: 60 },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', title: '操作', width: 96, fixed: 'right' });
  }
  return cols;
});

watch(
  () => props.entityName,
  () => {
    query.value = '';
    typeFilters.value = [];
    statusFilters.value = [];
    historyItem.value = undefined;
  },
);

/** 处理状态对应的 a-tag 预设色 */
function statusColor(status: string): string {
  const normalizedStatus = status.trim().replace(/^\d+\s*[.、_\-:：]?\s*/, '');
  if (normalizedStatus === '已解决') return 'green';
  if (normalizedStatus === '处理中' || normalizedStatus === '测试中') {
    return 'orange';
  }
  return 'default';
}

function resetFilters() {
  query.value = '';
  typeFilters.value = [];
  statusFilters.value = [];
}

function editItem(item: TimelineItem) {
  formDialog.value?.open(item);
}

function activateRow(item: TimelineItem) {
  if (writable.value) {
    editItem(item);
    return;
  }
  historyItem.value = item;
}

async function deleteItem(item: TimelineItem) {
  const ok = await confirmDelete('删除反馈', `确认删除“${item.problem}”吗？`);
  if (!ok) return;
  notifyResult(
    store.deleteCrud('customer-feedback', props.entityName, item.id),
    '反馈已删除',
  );
}

// 分页条始终显示；筛选变化回到第一页
const { pagination, onChange: onPageChange } = useTablePagination(
  () => filtered.value.length,
  [query, typeFilters, statusFilters, () => props.entityName],
);
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <a-select
        v-model:value="typeFilters"
        mode="multiple"
        class="selection-toolbar__filter"
        :options="typeOptions"
        placeholder="问题分类"
        aria-label="问题分类筛选"
        :max-tag-count="1"
        allow-clear
        option-filter-prop="label"
      />
      <a-select
        v-model:value="statusFilters"
        mode="multiple"
        class="selection-toolbar__filter"
        :options="statusOptions"
        placeholder="处理状态"
        aria-label="处理状态筛选"
        :max-tag-count="1"
        allow-clear
        option-filter-prop="label"
      />
      <a-input
        v-model:value="query"
        class="selection-toolbar__filter"
        placeholder="搜索分类、机型、问题点、对策、时间或状态"
        aria-label="搜索客户反馈"
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
      <a-button v-if="writable" type="primary" @click="formDialog?.open()">
        新增
      </a-button>
    </div>
    <a-table
      :columns="columns"
      :data-source="filtered"
      row-key="id"
      :pagination="pagination"
      :scroll="{ x: scrollX(columns) }"
      :locale="{
        emptyText:
          query.trim() || typeFilters.length || statusFilters.length
            ? '没有匹配的反馈记录'
            : '暂无反馈记录',
      }"
      :custom-row="rowClick(activateRow)"
      @change="onPageChange"
    >
      <template #bodyCell="{ column, record: row, text: value }">
        <template v-if="column.key === 'status'">
          <a-tag :color="statusColor(row.status)">{{ row.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'history'">
          <a-tooltip title="查看改善对策历史">
            <a-button
              type="text"
              size="small"
              aria-label="查看改善对策历史"
              @click="historyItem = row"
            >
              <template #icon><History :size="14" /></template>
            </a-button>
          </a-tooltip>
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-space :size="4">
            <a-tooltip title="编辑">
              <a-button
                type="text"
                size="small"
                aria-label="编辑"
                @click="editItem(row)"
              >
                <template #icon><Pencil :size="14" /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip title="删除">
              <a-button
                type="text"
                size="small"
                danger
                aria-label="删除"
                @click="deleteItem(row)"
              >
                <template #icon><Trash2 :size="14" /></template>
              </a-button>
            </a-tooltip>
          </a-space>
        </template>
        <template v-else>{{ cellText(value) }}</template>
      </template>
    </a-table>
    <FeedbackHistoryDialog v-model="historyItem" />
    <FeedbackFormDialog ref="formDialog" :entity-name="entityName" />
  </div>
</template>
