<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { Pencil, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import type { CustomerReqItem } from '@/domain';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import {
  rowClick,
  scrollX,
  sortBy,
  useTablePagination,
} from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import ReqFormDialog from './ReqFormDialog.vue';

const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const formDialog = ref<InstanceType<typeof ReqFormDialog>>();
const query = ref('');
const typeFilters = ref<string[]>([]);
const sourceFilters = ref<string[]>([]);

const typeOptions = computed(() =>
  store
    .dictionaryNames('customer-req')
    .map((name) => ({ label: name, value: name })),
);
const sourceOptions = computed(() =>
  store
    .dictionaryNames('customer-req-source')
    .map((name) => ({ label: name, value: name })),
);

const items = computed(
  () => store.crudItems('customer-req', props.entityName) as CustomerReqItem[],
);
const filtered = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return items.value.filter(
    (item) =>
      (typeFilters.value.length === 0 ||
        typeFilters.value.includes(item.type)) &&
      (sourceFilters.value.length === 0 ||
        sourceFilters.value.includes(item.source)) &&
      (!value ||
        [
          item.type,
          item.machine,
          item.process,
          item.content,
          item.source,
          item.note,
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
    sourceFilters.value.length > 0,
);
const columns = computed(() => {
  const cols: TableColumnType<CustomerReqItem>[] = [
    // 136/108：最长字典值「02 两片检测标准」实测 113px、「04 产品迭代」84px，
    // 加上单元格左右内边距才不会折成两行把行高撑乱。
    {
      key: 'type',
      dataIndex: 'type',
      title: '要求分类',
      width: 136,
      fixed: 'left',
      sorter: sortBy<CustomerReqItem>('type'),
    },
    { key: 'machine', dataIndex: 'machine', title: '适用机型', width: 90 },
    { key: 'process', dataIndex: 'process', title: '适用制程', width: 130 },
    { key: 'content', dataIndex: 'content', title: '要求内容', width: 230 },
    {
      key: 'source',
      dataIndex: 'source',
      title: '来源',
      width: 108,
      sorter: sortBy<CustomerReqItem>('source'),
    },
    { key: 'note', dataIndex: 'note', title: '备注', width: 140 },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', title: '操作', width: 96, fixed: 'right' });
  }
  return cols;
});
const customRow = computed(() =>
  rowClick<CustomerReqItem>((row) => {
    if (writable.value) editItem(row);
  }),
);

watch(
  () => props.entityName,
  () => {
    query.value = '';
    typeFilters.value = [];
    sourceFilters.value = [];
  },
);

function resetFilters() {
  query.value = '';
  typeFilters.value = [];
  sourceFilters.value = [];
}

function editItem(item: CustomerReqItem) {
  formDialog.value?.open(item);
}

async function deleteItem(item: CustomerReqItem) {
  const ok = await confirmDelete('删除要求', `确认删除“${item.content}”吗？`);
  if (!ok) return;
  notifyResult(
    store.deleteCrud('customer-req', props.entityName, item.id),
    '要求已删除',
    { stale: '该要求已被其他页面删除' },
  );
}

// 分页条始终显示；筛选变化回到第一页
const { pagination, onChange: onPageChange } = useTablePagination(
  () => filtered.value.length,
  [query, typeFilters, sourceFilters, () => props.entityName],
);
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <a-select
        v-model:value="typeFilters"
        class="selection-toolbar__filter"
        mode="multiple"
        :options="typeOptions"
        placeholder="要求分类"
        aria-label="要求分类筛选"
        :max-tag-count="1"
        allow-clear
      />
      <a-select
        v-model:value="sourceFilters"
        class="selection-toolbar__filter"
        mode="multiple"
        :options="sourceOptions"
        placeholder="要求来源"
        aria-label="要求来源筛选"
        :max-tag-count="1"
        allow-clear
      />
      <a-input
        v-model:value="query"
        class="selection-toolbar__filter"
        placeholder="搜索分类、机型、制程、内容、来源或备注"
        aria-label="搜索客户要求"
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
        新增要求
      </a-button>
    </div>
    <a-table
      :columns="columns"
      :data-source="filtered"
      row-key="id"
      :pagination="pagination"
      :custom-row="customRow"
      :scroll="{ x: scrollX(columns) }"
      :locale="{
        emptyText: hasActiveFilters ? '没有匹配的要求记录' : '暂无要求记录',
      }"
      @change="onPageChange"
    >
      <template #bodyCell="{ column, record, text }">
        <a-space v-if="column.key === 'actions'" :size="4">
          <a-tooltip title="编辑">
            <a-button
              type="text"
              size="small"
              aria-label="编辑"
              @click="editItem(record as CustomerReqItem)"
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
              @click="deleteItem(record as CustomerReqItem)"
            >
              <template #icon><Trash2 :size="14" /></template>
            </a-button>
          </a-tooltip>
        </a-space>
        <template v-else>{{ text || '—' }}</template>
      </template>
    </a-table>
    <ReqFormDialog ref="formDialog" :entity-name="entityName" />
  </div>
</template>
