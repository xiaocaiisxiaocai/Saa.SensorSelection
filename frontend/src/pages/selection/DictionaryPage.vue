<script setup lang="ts">
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import { DICTIONARY_DEFINITIONS, type DictionaryItem } from '@/domain';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import {
  AButton,
  AField,
  AFormGrid,
  AFormRow,
  AIconButton,
  ASheet,
  AStepper,
  ATabBar,
  ATable,
  type TableColumn,
  type TabItem,
} from '@/ui';

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

const tabs = computed<TabItem[]>(() =>
  DICTIONARY_DEFINITIONS.map((item) => ({
    label: item.title,
    value: item.code,
  })),
);
const items = computed(() =>
  activeCode.value ? store.dictionaryItems(activeCode.value) : [],
);
const columns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'sort', label: '排序', width: 72 },
    { key: 'name', label: '字典项名称', minWidth: 200 },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', label: '操作', width: 96, fixed: 'end' });
  }
  return cols;
});
const rows = computed(() => items.value);
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
  dialogOpen.value = true;
}

function editItem(item: DictionaryItem) {
  validationAttempted.value = false;
  editId.value = item.id;
  Object.assign(form, {
    name: item.name,
    sort: item.sort,
  });
  dialogOpen.value = true;
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
    toastResult(result, editId.value ? '字典项已更新' : '字典项已新增', {
      duplicate: '该字典项名称已存在',
      validation: '请填写有效的字典项名称',
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
    toastResult(result, '字典项已删除', {
      validation: '至少保留一个字典项',
    })
  ) {
    if (editId.value === item.id) {
      dialogOpen.value = false;
      resetForm();
    }
  }
}
</script>

<template>
  <section class="selection-page">
    <h1 class="visually-hidden">数据字典</h1>
    <div class="dictionary-header">
      <ATabBar v-model="activeCode" :tabs="tabs" />
      <AButton v-if="writable" variant="filled" @click="addItem">新增</AButton>
    </div>
    <div class="selection-panel">
      <ATable
        :columns="columns"
        :rows="rows"
        row-key="id"
        empty-text="暂无字典项"
        striped
      >
        <template #cell-actions="{ row }">
          <div class="table-actions">
            <AIconButton
              :icon="Pencil"
              label="编辑字典项"
              size="small"
              @click="editItem(row)"
            />
            <AIconButton
              :icon="Trash2"
              label="删除字典项"
              size="small"
              variant="destructive"
              @click="deleteItem(row)"
            />
          </div>
        </template>
      </ATable>
    </div>

    <ASheet v-model:open="dialogOpen" :title="sheetTitle" :width="480">
      <AFormGrid :columns="1">
        <AFormRow
          label="字典项名称"
          required
          :error="
            validationAttempted && !form.name.trim()
              ? '请输入字典项名称'
              : undefined
          "
        >
          <AField v-model="form.name" :maxlength="40" />
        </AFormRow>
        <AFormRow label="排序">
          <AStepper v-model="form.sort" :min="1" />
        </AFormRow>
      </AFormGrid>
      <template #footer>
        <AButton @click="dialogOpen = false">取消</AButton>
        <AButton variant="filled" @click="saveItem">保存</AButton>
      </template>
    </ASheet>
  </section>
</template>
