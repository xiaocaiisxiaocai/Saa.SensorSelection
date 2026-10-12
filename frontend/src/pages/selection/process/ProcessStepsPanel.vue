<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { Pencil, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import type { ProcessStepItem } from '@/domain';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import {
  cellText,
  PAGINATION_PROPS,
  rowClick,
  scrollX,
  sortFromChange,
  sortOrderOf,
  sortRows,
  type TableSortState,
} from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import ProcessStepDialog from './ProcessStepDialog.vue';

/** 「工艺制程」页签：分层筛选 + 搜索 + 表格。搜索词要同步到地址栏，由父页面持有。 */
const query = defineModel<string>('query', { required: true });

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const stepDialog = ref<InstanceType<typeof ProcessStepDialog>>();
const layerFilter = ref<string | null>(null);
const page = ref(1);
const pageSize = ref(20);
const sort = ref<TableSortState | null>(null);

const layerOptions = computed(() =>
  store
    .dictionaryNames('process-layer')
    .map((name) => ({ label: name, value: name })),
);
const hasActiveFilters = computed(
  () => Boolean(query.value.trim()) || Boolean(layerFilter.value),
);

const filteredItems = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return store.processSteps.filter(
    (item) =>
      (!layerFilter.value || item.layer === layerFilter.value) &&
      (!value ||
        [item.layer, item.name, item.role, item.feature, item.note]
          .join(' ')
          .toLocaleLowerCase('zh-CN')
          .includes(value)),
  );
});

// 排序必须发生在分页切片之前，否则只会把当前这一页重排。
const sortedItems = computed(() => sortRows(filteredItems.value, sort.value));

const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedItems.value.slice(start, start + pageSize.value);
});

const columns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    {
      key: 'layer',
      dataIndex: 'layer',
      title: '制程',
      width: 88,
      fixed: 'left',
      sorter: true,
      sortOrder: sortOrderOf(sort.value, 'layer'),
    },
    // 固定宽度：工艺制程名很短（实测最长 107px），设成弹性列会按比例吃掉
    // 大量多余空间（实测占到 375px），把宽度从真正需要的「作用」列抢走。
    {
      key: 'name',
      dataIndex: 'name',
      title: '工艺制程',
      width: 160,
      sorter: true,
      sortOrder: sortOrderOf(sort.value, 'name'),
    },
    { key: 'role', dataIndex: 'role', title: '作用', width: 160 },
    { key: 'feature', dataIndex: 'feature', title: '制程特性', width: 160 },
    { key: 'note', dataIndex: 'note', title: '备注', width: 120 },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', title: '操作', width: 96, fixed: 'right' });
  }
  return cols;
});

watch([query, layerFilter, pageSize, sort], () => {
  page.value = 1;
});

watch(
  () => [filteredItems.value.length, pageSize.value] as const,
  () => {
    const maxPage = Math.max(
      1,
      Math.ceil(filteredItems.value.length / pageSize.value),
    );
    if (page.value > maxPage) page.value = maxPage;
  },
);

function resetFilters() {
  query.value = '';
  layerFilter.value = null;
  page.value = 1;
}

function editItem(item: ProcessStepItem) {
  stepDialog.value?.open(item);
}

async function deleteItem(item: ProcessStepItem) {
  const ok = await confirmDelete('删除工艺制程', `确认删除“${item.name}”吗？`);
  if (!ok) return;
  notifyResult(store.deleteProcessStep(item.id), '工艺制程已删除');
}
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <a-select
        v-model:value="layerFilter"
        class="selection-toolbar__filter"
        :options="layerOptions"
        placeholder="制程分层"
        aria-label="制程分层筛选"
        allow-clear
      />
      <a-input
        v-model:value="query"
        class="selection-toolbar__filter"
        placeholder="搜索制程、工艺、作用、特性或备注"
        aria-label="搜索制程"
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
      <a-button v-if="writable" type="primary" @click="stepDialog?.open()">
        新增
      </a-button>
    </div>
    <a-table
      :columns="columns"
      :data-source="tableData"
      row-key="id"
      :pagination="false"
      :scroll="{ x: scrollX(columns) }"
      :locale="{
        emptyText:
          query.trim() || layerFilter ? '没有匹配的工艺制程' : '暂无工艺制程',
      }"
      :custom-row="writable ? rowClick(editItem) : undefined"
      @change="
        (_p: unknown, _f: unknown, sorter: unknown) =>
          (sort = sortFromChange(sorter))
      "
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
    <a-pagination
      v-model:current="page"
      v-model:page-size="pageSize"
      class="table-pagination"
      :total="filteredItems.length"
      v-bind="PAGINATION_PROPS"
    />
    <ProcessStepDialog ref="stepDialog" />
  </div>
</template>
