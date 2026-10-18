<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { Pencil, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import type { ProcessStepItem } from '@/domain';
import AdminColumnSettingsMenu from '@/pages/shared/AdminColumnSettingsMenu.vue';
import { useManagedTableColumns } from '@/pages/shared/managed-table-columns';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import {
  cellText,
  columnFilter,
  columnFilterValues,
  isColumnFilterChange,
  PAGINATION_PROPS,
  rowClick,
  scrollX,
  setColumnFilter,
  type ColumnFilterMap,
} from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { AHighlightText } from '@/ui';

import ProcessStepDialog from './ProcessStepDialog.vue';

/** 「工艺制程」页签：分层筛选 + 搜索 + 表格。搜索词要同步到地址栏，由父页面持有。 */
const query = defineModel<string>('query', { required: true });

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const stepDialog = ref<InstanceType<typeof ProcessStepDialog>>();
const layerFilters = ref<string[]>([]);
const page = ref(1);
const pageSize = ref(20);

const layerOptions = computed(() =>
  store
    .dictionaryNames('process-layer')
    .map((name) => ({ label: name, value: name })),
);
const hasActiveFilters = computed(
  () => Boolean(query.value.trim()) || layerFilters.value.length > 0,
);

const filteredItems = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return store.processSteps.filter(
    (item) =>
      (layerFilters.value.length === 0 ||
        layerFilters.value.includes(item.layer)) &&
      (!value ||
        [item.layer, item.name, item.role, item.feature, item.note]
          .join(' ')
          .toLocaleLowerCase('zh-CN')
          .includes(value)),
  );
});

const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredItems.value.slice(start, start + pageSize.value);
});

const baseColumns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    {
      key: 'layer',
      dataIndex: 'layer',
      title: '制程',
      width: 120,
      fixed: 'left',
      ...columnFilter({
        options: layerOptions.value,
        value: layerFilters.value,
      }),
    },
    // 固定宽度：工艺制程名很短（实测最长 107px），设成弹性列会按比例吃掉
    // 大量多余空间（实测占到 375px），把宽度从真正需要的「作用」列抢走。
    {
      key: 'name',
      dataIndex: 'name',
      title: '工艺制程',
      width: 160,
    },
    { key: 'role', dataIndex: 'role', title: '作用', width: 160 },
    { key: 'feature', dataIndex: 'feature', title: '制程特性', width: 160 },
    {
      key: 'note',
      dataIndex: 'note',
      title: '备注',
      width: 120,
      className: 'cell-pre-line',
    },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', title: '操作', width: 96, fixed: 'right' });
  }
  return cols;
});
const {
  canManage: canManageColumns,
  columns,
  hidden: hiddenColumns,
  onResizeColumn,
  options: columnOptions,
  setVisible: setColumnVisible,
  showAll: showAllColumns,
} = useManagedTableColumns('process-steps', () => baseColumns.value);

watch([query, layerFilters, pageSize], () => {
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
  layerFilters.value = [];
  page.value = 1;
}

function onTableChange(
  _pagination: unknown,
  filters: ColumnFilterMap,
  _order: unknown,
  extra: { action?: string },
) {
  if (!isColumnFilterChange(extra)) return;
  setColumnFilter(
    layerFilters,
    columnFilterValues(filters, 'layer').map(String),
  );
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
      <AdminColumnSettingsMenu
        :can-manage="canManageColumns"
        :columns="columnOptions"
        :hidden="hiddenColumns"
        :on-set-visible="setColumnVisible"
        :on-show-all="showAllColumns"
      />
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
          query.trim() || layerFilters.length
            ? '没有匹配的工艺制程'
            : '暂无工艺制程',
      }"
      :custom-row="writable ? rowClick(editItem) : undefined"
      @resize-column="onResizeColumn"
      @change="onTableChange"
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
        <template v-else>
          <AHighlightText :text="cellText(value)" :query="query" />
        </template>
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
