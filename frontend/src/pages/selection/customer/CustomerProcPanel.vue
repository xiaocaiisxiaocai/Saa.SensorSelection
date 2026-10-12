<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { Pencil, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import type { CustomerProcItem } from '@/domain';
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

import ProcFormDialog from './ProcFormDialog.vue';

const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const formDialog = ref<InstanceType<typeof ProcFormDialog>>();
const query = ref('');
const typeFilters = ref<Array<string | number>>([]);

const typeOptions = computed(() =>
  store
    .dictionaryNames('customer-proc')
    .map((name) => ({ label: name, value: name })),
);
const items = computed(
  () =>
    store.crudItems('customer-proc', props.entityName) as CustomerProcItem[],
);
const filtered = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return items.value.filter(
    (item) =>
      (typeFilters.value.length === 0 ||
        typeFilters.value.includes(item.type)) &&
      (!value ||
        [item.type, item.role, item.feature, item.sensorNote, item.note]
          .join(' ')
          .toLocaleLowerCase('zh-CN')
          .includes(value)),
  );
});
const hasActiveFilters = computed(
  () => Boolean(query.value.trim()) || typeFilters.value.length > 0,
);
const columns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    // 104：最长字典值只要 80px，但表头「制程分类」加排序图标要 86px，
    // 同时和另外两个 Tab 的首列保持相近宽度。
    {
      key: 'type',
      dataIndex: 'type',
      title: '制程分类',
      width: 104,
      fixed: 'left',
      sorter: sortBy('type'),
    },
    { key: 'role', dataIndex: 'role', title: '制程作用', width: 150 },
    { key: 'feature', dataIndex: 'feature', title: '制程特性', width: 150 },
    {
      key: 'sensorNote',
      dataIndex: 'sensorNote',
      title: 'sensor使用注意事项',
      width: 190,
    },
    { key: 'note', dataIndex: 'note', title: '备注', width: 130 },
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
  },
);

function resetFilters() {
  query.value = '';
  typeFilters.value = [];
}

function editItem(item: CustomerProcItem) {
  formDialog.value?.open(item);
}

async function deleteItem(item: CustomerProcItem) {
  const ok = await confirmDelete('删除注意事项', `确认删除“${item.role}”吗？`);
  if (!ok) return;
  notifyResult(
    store.deleteCrud('customer-proc', props.entityName, item.id),
    '注意事项已删除',
  );
}

// 分页条始终显示；筛选变化回到第一页
const { pagination, onChange: onPageChange } = useTablePagination(
  () => filtered.value.length,
  [query, typeFilters, () => props.entityName],
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
        placeholder="制程分类"
        aria-label="制程分类筛选"
        :max-tag-count="1"
        allow-clear
        option-filter-prop="label"
      />
      <a-input
        v-model:value="query"
        class="selection-toolbar__filter"
        placeholder="搜索分类、作用、特性、sensor注意或备注"
        aria-label="搜索制程注意事项"
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
          query.trim() || typeFilters.length
            ? '没有匹配的注意事项'
            : '暂无注意事项',
      }"
      :custom-row="writable ? rowClick(editItem) : undefined"
      @change="onPageChange"
    >
      <template #bodyCell="{ column, record: row, text: value }">
        <template v-if="column.key === 'actions'">
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
    <ProcFormDialog ref="formDialog" :entity-name="entityName" />
  </div>
</template>
