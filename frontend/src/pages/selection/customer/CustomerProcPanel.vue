<script setup lang="ts">
import type { TableColumnType, TablePaginationConfig } from 'ant-design-vue';
import { Pencil, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import type { CustomerProcItem } from '@/domain';
import AdminColumnSettingsMenu from '@/pages/shared/AdminColumnSettingsMenu.vue';
import { useManagedTableColumns } from '@/pages/shared/managed-table-columns';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import {
  cellText,
  columnFilter,
  columnFilterValues,
  isColumnFilterChange,
  rowClick,
  scrollX,
  setColumnFilter,
  useTablePagination,
  type ColumnFilterMap,
} from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { AHighlightText } from '@/ui';

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
const baseColumns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    // 128：标题、漏斗和最长字典值（约 80px）放在一行里。
    {
      key: 'type',
      dataIndex: 'type',
      title: '制程分类',
      width: 128,
      fixed: 'left',
      ...columnFilter({
        options: typeOptions.value,
        value: typeFilters.value,
      }),
    },
    { key: 'role', dataIndex: 'role', title: '制程作用', width: 150 },
    { key: 'feature', dataIndex: 'feature', title: '制程特性', width: 150 },
    {
      key: 'sensorNote',
      dataIndex: 'sensorNote',
      title: 'sensor使用注意事项',
      width: 190,
    },
    {
      key: 'note',
      dataIndex: 'note',
      title: '备注',
      width: 130,
      className: 'cell-pre-line',
    },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', title: '操作', width: 96 });
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
} = useManagedTableColumns('customer-proc', () => baseColumns.value);

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

function onTableChange(
  next: TablePaginationConfig,
  filters: ColumnFilterMap,
  _order: unknown,
  extra: { action?: string },
) {
  if (isColumnFilterChange(extra)) {
    setColumnFilter(typeFilters, columnFilterValues(filters, 'type'));
  }
  onPageChange(next);
}
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <a-input
        v-model:value="query"
        class="selection-toolbar__filter"
        placeholder="搜索注意事项"
        aria-label="搜索制程注意事项"
        allow-clear
      >
        <template #prefix><Search :size="14" /></template>
      </a-input>
      <a-tooltip
        :title="
          hasActiveFilters ? '清除搜索和表头筛选' : '当前没有可清除的筛选'
        "
      >
        <span class="selection-toolbar__reset">
          <a-button
            type="text"
            :disabled="!hasActiveFilters"
            aria-label="重置筛选"
            @click="resetFilters"
          >
            <template #icon><RotateCcw :size="14" /></template>
            重置
          </a-button>
        </span>
      </a-tooltip>
      <div class="selection-toolbar__actions">
        <AdminColumnSettingsMenu
          :can-manage="canManageColumns"
          :columns="columnOptions"
          :hidden="hiddenColumns"
          :on-set-visible="setColumnVisible"
          :on-show-all="showAllColumns"
        />
        <a-button v-if="writable" type="primary" @click="formDialog?.open()">
          新增注意事项
        </a-button>
      </div>
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
    <ProcFormDialog ref="formDialog" :entity-name="entityName" />
  </div>
</template>
