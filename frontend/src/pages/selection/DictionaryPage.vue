<script setup lang="ts">
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import {
  DICTIONARY_DEFINITIONS,
  type DictionaryItem,
  type MachineSectionItem,
  type MachineSectionKind,
} from '@/domain';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import {
  AButton,
  AField,
  AFormGrid,
  AFormRow,
  AIconButton,
  ASelect,
  ASheet,
  AStepper,
  ATabBar,
  ATable,
  type TableColumn,
  type TabItem,
} from '@/ui';

import '../shared/selection-page.css';

const MACHINE_SECTION_CODE = 'machine-section';

const KIND_OPTIONS = [
  { label: '结构', value: 'structure' },
  { label: '注意事项', value: 'notes' },
];

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const activeCode = ref(DICTIONARY_DEFINITIONS[0]?.code || '');
const dialogOpen = ref(false);
const editId = ref<number>();
const form = reactive({
  kind: 'structure' as MachineSectionKind,
  name: '',
  sort: 1,
});

const tabs = computed<TabItem[]>(() =>
  DICTIONARY_DEFINITIONS.map((item) => ({
    label: item.title,
    value: item.code,
  })),
);
const isMachineSection = computed(
  () => activeCode.value === MACHINE_SECTION_CODE,
);
const items = computed(() => {
  if (isMachineSection.value) return store.globalMachineSections;
  return activeCode.value ? store.dictionaryItems(activeCode.value) : [];
});
const editingSection = computed(() => {
  if (!isMachineSection.value || editId.value === undefined) return undefined;
  return store.globalMachineSections.find((item) => item.id === editId.value);
});
const kindSelectDisabled = computed(() => {
  if (!isMachineSection.value) return true;
  if (editId.value === undefined) return true;
  const section = editingSection.value;
  return Boolean(section?.locked || section?.kind === 'notes');
});
const kindOptions = computed(() => {
  if (editId.value !== undefined && form.kind === 'notes') return KIND_OPTIONS;
  return KIND_OPTIONS.filter((item) => item.value === 'structure');
});
const columns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'sort', label: '排序', width: 72 },
    {
      key: 'name',
      label: isMachineSection.value ? '名称' : '分类名称',
      minWidth: 200,
    },
  ];
  if (isMachineSection.value) {
    cols.push({ key: 'kindLabel', label: '类型', width: 120 });
  }
  if (writable.value) {
    cols.push({ key: 'actions', label: '操作', width: 96, fixed: 'end' });
  }
  return cols;
});
const rows = computed(() =>
  items.value.map((item) => ({
    ...item,
    kindLabel:
      'kind' in item
        ? item.kind === 'notes'
          ? '注意事项'
          : '结构'
        : '',
  })),
);
const sheetTitle = computed(() => {
  if (isMachineSection.value) {
    return editId.value ? '编辑 Tab' : '新增 Tab';
  }
  return editId.value ? '编辑分类' : '新增分类';
});

watch(activeCode, () => {
  dialogOpen.value = false;
  resetForm();
});

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    kind: 'structure' as MachineSectionKind,
    name: '',
    sort: items.value.length + 1,
  });
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: DictionaryItem | MachineSectionItem) {
  editId.value = item.id;
  Object.assign(form, {
    kind:
      isMachineSection.value && 'kind' in item && item.kind === 'notes'
        ? 'notes'
        : 'structure',
    name: item.name,
    sort: item.sort,
  });
  dialogOpen.value = true;
}

function isSectionLocked(item: DictionaryItem | MachineSectionItem) {
  return Boolean(
    isMachineSection.value &&
      'kind' in item &&
      (item.locked || item.kind === 'notes'),
  );
}

function saveItem() {
  if (!activeCode.value) return;
  if (isMachineSection.value) {
    const result = store.saveGlobalMachineSection(
      {
        kind: editId.value === undefined ? 'structure' : form.kind,
        name: form.name.trim(),
        sort: form.sort,
      },
      editId.value,
    );
    if (
      toastResult(
        result,
        editId.value ? 'Tab 已更新' : 'Tab 已新增',
        {
          duplicate: '该分类名称已存在',
          validation: '请填写有效的分类名称',
          'not-empty': '请先清空各机型下该 Tab 的数据',
        },
      )
    ) {
      dialogOpen.value = false;
      resetForm();
    }
    return;
  }

  const result = store.saveDictionaryItem(
    activeCode.value,
    { name: form.name.trim(), sort: form.sort },
    editId.value,
  );
  if (
    toastResult(result, editId.value ? '分类已更新' : '分类已新增', {
      duplicate: '该分类名称已存在',
      validation: '请填写有效的分类名称',
    })
  ) {
    dialogOpen.value = false;
    resetForm();
  }
}

async function deleteItem(item: DictionaryItem | MachineSectionItem) {
  if (!activeCode.value) return;
  if (isMachineSection.value) {
    const section = item as MachineSectionItem;
    if (isSectionLocked(section)) return;
    const ok = await confirmDelete(
      '删除 Tab',
      `确认删除“${section.name}”吗？删除前需清空各机型下该 Tab 的数据。`,
    );
    if (!ok) return;
    const result = store.deleteGlobalMachineSection(section.id);
    if (
      toastResult(result, 'Tab 已删除', {
        'not-empty': '请先清空各机型下该 Tab 的数据',
        validation: '注意事项 Tab 不可删除',
      })
    ) {
      if (editId.value === section.id) {
        dialogOpen.value = false;
        resetForm();
      }
    }
    return;
  }

  const ok = await confirmDelete(
    '删除分类',
    `确认删除“${item.name}”吗？已使用该分类的数据会改归到其他分类。`,
  );
  if (!ok) return;
  const result = store.deleteDictionaryItem(activeCode.value, item.id);
  if (
    toastResult(result, '分类已删除', {
      validation: '至少保留一个分类',
    })
  ) {
    if (editId.value === item.id) {
      dialogOpen.value = false;
      resetForm();
    }
  }
}</script>

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
        empty-text="暂无分类"
        striped
      >
        <template #cell-actions="{ row }">
          <div class="table-actions">
            <AIconButton
              :icon="Pencil"
              :label="isMachineSection ? '编辑 Tab' : '编辑分类'"
              size="small"
              @click="editItem(row)"
            />
            <AIconButton
              v-if="!isSectionLocked(row)"
              :icon="Trash2"
              :label="isMachineSection ? '删除 Tab' : '删除分类'"
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
        <AFormRow :label="isMachineSection ? '名称' : '分类名称'" required>
          <AField v-model="form.name" :maxlength="40" />
        </AFormRow>
        <AFormRow label="排序">
          <AStepper v-model="form.sort" :min="1" />
        </AFormRow>
        <AFormRow v-if="isMachineSection" label="类型">
          <ASelect
            v-model="form.kind"
            :options="kindOptions"
            :disabled="kindSelectDisabled"
          />
        </AFormRow>
      </AFormGrid>
      <template #footer>
        <AButton @click="dialogOpen = false">取消</AButton>
        <AButton variant="filled" @click="saveItem">保存</AButton>
      </template>
    </ASheet>
  </section>
</template>
