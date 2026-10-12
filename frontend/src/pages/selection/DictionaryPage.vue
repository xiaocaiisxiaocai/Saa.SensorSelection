<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import { DICTIONARY_DEFINITIONS, type DictionaryItem } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { rowClick, sortBy, useTablePagination } from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import '../shared/selection-page.css';

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

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
const columns = computed<TableColumnType<DictionaryItem>[]>(() => {
  const cols: TableColumnType<DictionaryItem>[] = [
    {
      key: 'sort',
      dataIndex: 'sort',
      title: '排序',
      width: 88,
      fixed: 'left',
      align: 'right',
      sorter: sortBy<DictionaryItem>('sort'),
    },
    {
      key: 'name',
      dataIndex: 'name',
      title: '字典项名称',
      sorter: sortBy<DictionaryItem>('name'),
    },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', title: '操作', width: 96, fixed: 'right' });
  }
  return cols;
});
const customRow = computed(() =>
  rowClick<DictionaryItem>((row) => {
    if (writable.value) editItem(row);
  }),
);
const sheetTitle = computed(() => (editId.value ? '编辑字典项' : '新增字典项'));

watch(activeCode, () => {
  dialogOpen.value = false;
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

async function deleteItem(item: DictionaryItem) {
  if (!activeCode.value) return;
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

// 分页条始终显示；筛选变化回到第一页
const { pagination, onChange: onPageChange } = useTablePagination(
  () => items.value.length,
  [activeCode],
);
</script>

<template>
  <section class="selection-page">
    <h1 class="visually-hidden">数据字典</h1>
    <div class="dictionary-header">
      <a-segmented v-model:value="activeCode" :options="tabs" />
      <a-button v-if="writable" type="primary" @click="addItem">新增</a-button>
    </div>
    <div class="selection-panel">
      <a-table
        :columns="columns"
        :data-source="items"
        row-key="id"
        :pagination="pagination"
        :custom-row="customRow"
        :scroll="{ x: 'max-content' }"
        :locale="{ emptyText: '暂无字典项' }"
        @change="onPageChange"
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
            <a-tooltip title="删除字典项">
              <a-button
                type="text"
                size="small"
                danger
                aria-label="删除字典项"
                @click="deleteItem(record as DictionaryItem)"
              >
                <template #icon><Trash2 :size="14" /></template>
              </a-button>
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
            style="width: 100%"
          />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="cancelDialog">取消</a-button>
        <a-button type="primary" @click="saveItem">保存</a-button>
      </template>
    </a-modal>
  </section>
</template>
