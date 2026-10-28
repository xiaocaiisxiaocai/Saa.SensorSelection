<script setup lang="ts">
import {
  message,
  type TableColumnType,
  type TablePaginationConfig,
} from 'ant-design-vue';
import { Download, Pencil, RotateCcw, Trash2, Upload } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import { DICTIONARY_DEFINITIONS, type DictionaryItem } from '@/domain';
import AdminColumnSettingsMenu from '@/pages/shared/AdminColumnSettingsMenu.vue';
import { useManagedTableColumns } from '@/pages/shared/managed-table-columns';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import {
  buildExcelWorkbook,
  downloadExcelFile,
  formatExcelDate,
  readWorkbook,
} from '@/pages/shared/excel';
import ImportResultDialog from '@/pages/shared/ImportResultDialog.vue';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import {
  type ColumnFilterMap,
  columnFilter,
  columnFilterValues,
  isColumnFilterChange,
  rowClick,
  setColumnFilter,
  useTablePagination,
} from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import {
  DICTIONARY_EXPORT_HEADERS,
  mapDictionaryWorkbook,
} from './dictionary-excel';

import '../shared/selection-page.css';

const store = useSelectionStore();
const { canWrite, has } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const canExport = computed(() => has('data:transfer'));
const canImport = computed(() => canExport.value && writable.value);
const importResult = ref<InstanceType<typeof ImportResultDialog>>();
const importInput = ref<HTMLInputElement>();

const activeCode = ref(DICTIONARY_DEFINITIONS[0]?.code || '');
const dialogOpen = ref(false);
const editId = ref<number>();
const validationAttempted = ref(false);
const form = reactive({
  name: '',
  sort: 1,
});
const dirtyGuard = useDirtyGuard(form);

const tabs = computed(() =>
  DICTIONARY_DEFINITIONS.map((item) => ({
    label: item.title,
    value: item.code,
  })),
);
const items = computed(() =>
  activeCode.value ? store.dictionaryItems(activeCode.value) : [],
);
// 表头漏斗：按字典项名称多选筛选，在完整列表上筛完再分页
const nameFilters = ref<string[]>([]);
const visibleItems = computed(() =>
  nameFilters.value.length === 0
    ? items.value
    : items.value.filter((item) => nameFilters.value.includes(item.name)),
);
const baseColumns = computed<TableColumnType<DictionaryItem>[]>(() => {
  const cols: TableColumnType<DictionaryItem>[] = [
    {
      key: 'sort',
      dataIndex: 'sort',
      title: '排序',
      width: 88,
      fixed: 'left',
      align: 'right',
    },
    {
      key: 'name',
      dataIndex: 'name',
      title: '字典项名称',
      ...columnFilter({
        options: items.value.map((item) => ({
          label: item.name,
          value: item.name,
        })),
        value: nameFilters.value,
        search: true,
      }),
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
} = useManagedTableColumns('dictionary', () => baseColumns.value);
const customRow = computed(() =>
  rowClick<DictionaryItem>((row) => {
    if (writable.value) editItem(row);
  }),
);
const sheetTitle = computed(() => (editId.value ? '编辑字典项' : '新增字典项'));

watch(activeCode, () => {
  dialogOpen.value = false;
  nameFilters.value = [];
  resetForm();
});

function resetForm() {
  validationAttempted.value = false;
  editId.value = undefined;
  Object.assign(form, {
    name: '',
    sort: items.value.length + 1,
  });
}

function addItem() {
  resetForm();
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

function editItem(item: DictionaryItem) {
  validationAttempted.value = false;
  editId.value = item.id;
  Object.assign(form, {
    name: item.name,
    sort: item.sort,
  });
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

async function cancelDialog() {
  if (await dirtyGuard.confirmClose()) dialogOpen.value = false;
}

function saveItem() {
  if (!activeCode.value) return;
  validationAttempted.value = true;
  const result = store.saveDictionaryItem(
    activeCode.value,
    { name: form.name.trim(), sort: form.sort },
    editId.value,
  );
  if (
    notifyResult(result, editId.value ? '字典项已更新' : '字典项已新增', {
      duplicate: '该字典项名称已存在',
    })
  ) {
    dialogOpen.value = false;
    resetForm();
  }
}

function regionUsers(name: string): string[] {
  const sites: string[] = [];
  for (const group of store.entityGroups('customer')) {
    for (const [site, region] of Object.entries(group.regions ?? {})) {
      if (region === name) sites.push(`${group.name}/${site}`);
    }
  }
  return sites;
}

function deleteReason(item: DictionaryItem): string | undefined {
  if (items.value.length <= 1) return '至少保留一个字典项';
  if (activeCode.value !== 'customer-region') return undefined;
  const sites = regionUsers(item.name);
  if (sites.length === 0) return undefined;
  const listed =
    sites.length > 5
      ? `${sites.slice(0, 5).join('、')} 等 ${sites.length} 个厂区`
      : sites.join('、');
  return `「${item.name}」还有厂区在用：${listed}，请先改掉这些厂区的区域`;
}

async function deleteItem(item: DictionaryItem) {
  if (!activeCode.value || deleteReason(item)) return;
  const ok = await confirmDelete(
    '删除字典项',
    `确认删除“${item.name}”吗？已使用该字典项的数据会按业务规则清理或改归。`,
  );
  if (!ok) return;
  const result = store.deleteDictionaryItem(activeCode.value, item.id);
  if (
    notifyResult(result, '字典项已删除', {
      validation: '至少保留一个字典项',
    })
  ) {
    if (editId.value === item.id) {
      dialogOpen.value = false;
      resetForm();
    }
  }
}

function exportExcel() {
  const now = new Date();
  const bytes = buildExcelWorkbook(
    {
      sheets: DICTIONARY_DEFINITIONS.map((definition) => ({
        headers: [...DICTIONARY_EXPORT_HEADERS],
        name: definition.title,
        rows: store
          .dictionaryItems(definition.code)
          .map((item) => [String(item.sort), item.name]),
      })),
      title: '数据字典',
    },
    now,
  );
  downloadExcelFile(`数据字典-${formatExcelDate(now)}.xlsx`, bytes);
  message.success('已导出数据字典');
}

function openImport() {
  importInput.value?.click();
}

async function onImportFile(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let sheets: Awaited<ReturnType<typeof readWorkbook>>;
  try {
    sheets = await readWorkbook(new Uint8Array(await file.arrayBuffer()));
  } catch {
    message.error('无法读取该 Excel 文件');
    return;
  }
  const result = store.restoreDictionaries(mapDictionaryWorkbook(sheets));
  if (!result.ok) {
    message.error('数据保存失败，本次修改未保存');
    return;
  }
  importResult.value?.open({
    categories: result.categories.map((item) => ({
      created: item.created,
      deleted: item.deleted,
      kept: item.kept,
      skipped: item.skipped.length,
      title: item.title,
      unchangedReason: item.unchangedReason,
      updated: item.updated,
    })),
    notes: [
      ...result.missingSheets.map(
        (title) => `「${title}」未包含在文件中，未改动`,
      ),
      ...result.unknownSheets.map((name) => `未识别的工作表「${name}」`),
    ],
    skips: result.categories.flatMap((category) =>
      category.skipped.map((item) => ({
        location: `${category.title} · 第 ${item.rowNumber} 行`,
        reason: item.reason,
      })),
    ),
    title: '还原数据字典',
  });
}

// 分页条始终显示；筛选变化回到第一页
const { pagination, onChange: onPageChange } = useTablePagination(
  () => visibleItems.value.length,
  [activeCode, nameFilters],
);

function onTableChange(
  next: TablePaginationConfig,
  filters: ColumnFilterMap,
  _order: unknown,
  extra: { action?: string },
) {
  if (isColumnFilterChange(extra)) {
    setColumnFilter(
      nameFilters,
      columnFilterValues(filters, 'name').map(String),
    );
  }
  onPageChange(next);
}
</script>

<template>
  <section class="selection-page">
    <h1 class="visually-hidden">数据字典</h1>
    <div class="dictionary-header">
      <a-segmented v-model:value="activeCode" :options="tabs" />
      <div class="dictionary-header__actions">
        <a-tooltip
          :title="
            nameFilters.length ? '清除表头筛选' : '当前没有可清除的筛选'
          "
        >
          <span class="tooltip-host">
            <a-button
              type="text"
              :disabled="nameFilters.length === 0"
              aria-label="重置筛选"
              @click="nameFilters = []"
            >
              <template #icon><RotateCcw :size="14" /></template>
              重置
            </a-button>
          </span>
        </a-tooltip>
        <AdminColumnSettingsMenu
          :can-manage="canManageColumns"
          :columns="columnOptions"
          :hidden="hiddenColumns"
          :on-set-visible="setColumnVisible"
          :on-show-all="showAllColumns"
        />
        <a-tooltip v-if="canExport" title="导出 Excel">
          <a-button aria-label="导出 Excel" @click="exportExcel">
            <template #icon><Download :size="14" /></template>
            导出 Excel
          </a-button>
        </a-tooltip>
        <a-tooltip v-if="canImport" title="导入 Excel">
          <a-button aria-label="导入 Excel" @click="openImport">
            <template #icon><Upload :size="14" /></template>
            导入 Excel
          </a-button>
        </a-tooltip>
        <input
          v-if="canImport"
          ref="importInput"
          class="visually-hidden"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="选择数据字典 Excel"
          @change="onImportFile"
        >
        <a-button v-if="writable" type="primary" @click="addItem">
          新增字典项
        </a-button>
      </div>
    </div>
    <div class="selection-panel">
      <a-table
        :columns="columns"
        :data-source="visibleItems"
        row-key="id"
        :pagination="pagination"
        :custom-row="customRow"
        :scroll="{ x: 'max-content' }"
        :locale="{
          emptyText: nameFilters.length
            ? '没有匹配的字典项，请清除表头筛选'
            : '暂无字典项',
        }"
        @resize-column="onResizeColumn"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <a-space v-if="column.key === 'actions'" :size="4">
            <a-tooltip title="编辑字典项">
              <a-button
                type="text"
                size="small"
                aria-label="编辑字典项"
                @click="editItem(record as DictionaryItem)"
              >
                <template #icon><Pencil :size="14" /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip
              :title="
                deleteReason(record as DictionaryItem) ?? '删除字典项'
              "
            >
              <span class="tooltip-host">
                <a-button
                  type="text"
                  size="small"
                  danger
                  aria-label="删除字典项"
                  :disabled="Boolean(deleteReason(record as DictionaryItem))"
                  @click="deleteItem(record as DictionaryItem)"
                >
                  <template #icon><Trash2 :size="14" /></template>
                </a-button>
              </span>
            </a-tooltip>
          </a-space>
        </template>
      </a-table>
    </div>

    <a-modal
      :open="dialogOpen"
      :title="sheetTitle"
      :width="480"
      destroy-on-close
      @cancel="cancelDialog"
    >
      <a-form layout="vertical">
        <a-form-item
          html-for="dictionary-name"
          label="字典项名称"
          required
          :validate-status="
            validationAttempted && !form.name.trim() ? 'error' : undefined
          "
          :help="
            validationAttempted && !form.name.trim()
              ? '请输入字典项名称'
              : undefined
          "
        >
          <a-input
            id="dictionary-name"
            v-model:value="form.name"
            :maxlength="40"
            show-count
            allow-clear
          />
        </a-form-item>
        <a-form-item html-for="dictionary-sort" label="排序">
          <a-input-number
            id="dictionary-sort"
            v-model:value="form.sort"
            :min="1"
            class="full-width"
          />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="cancelDialog">取消</a-button>
        <a-button type="primary" @click="saveItem">保存</a-button>
      </template>
    </a-modal>
    <ImportResultDialog ref="importResult" />
  </section>
</template>

<style scoped src="./DictionaryPage.css"></style>
