<script setup lang="ts">
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import type { CustomerReqItem } from '@/domain';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import {
  AButton,
  AField,
  AFormGrid,
  AFormRow,
  AIconButton,
  ASearchField,
  ASelect,
  ASheet,
  ATable,
  ATextArea,
  type SelectOption,
  type TableColumn,
} from '@/ui';

const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const dialogOpen = ref(false);
const editId = ref<number>();
const query = ref('');
const typeFilter = ref<string | null>(null);
const sourceFilter = ref<string | null>(null);
const form = reactive({
  content: '',
  machine: '',
  note: '',
  process: '',
  source: '',
  type: '',
});

const typeOptions = computed<SelectOption[]>(() =>
  store.dictionaryNames('customer-req').map((name) => ({ label: name, value: name })),
);
const sourceOptions = computed<SelectOption[]>(() =>
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
      (!typeFilter.value || item.type === typeFilter.value) &&
      (!sourceFilter.value || item.source === sourceFilter.value) &&
      (!value ||
        [item.type, item.machine, item.process, item.content, item.source, item.note]
          .join(' ')
          .toLocaleLowerCase('zh-CN')
          .includes(value)),
  );
});
const columns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'type', label: '要求分类', width: 110 },
    { key: 'machine', label: '适用机型', width: 110 },
    { key: 'process', label: '适用制程', width: 110 },
    { key: 'content', label: '要求内容', minWidth: 200, ellipsis: true },
    { key: 'source', label: '来源', width: 110 },
    { key: 'note', label: '备注', minWidth: 120, ellipsis: true },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', label: '操作', width: 96, fixed: 'end' });
  }
  return cols;
});

watch(
  () => props.entityName,
  () => {
    query.value = '';
    typeFilter.value = null;
    sourceFilter.value = null;
  },
);

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    content: '',
    machine: '',
    note: '',
    process: '',
    source: sourceOptions.value[0]?.value ?? '',
    type: typeOptions.value[0]?.value ?? '',
  });
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: CustomerReqItem) {
  editId.value = item.id;
  Object.assign(form, {
    content: item.content,
    machine: item.machine,
    note: item.note,
    process: item.process,
    source: item.source,
    type: item.type,
  });
  dialogOpen.value = true;
}

function saveItem() {
  const result = store.saveCrud(
    'customer-req',
    props.entityName,
    { ...form },
    editId.value,
  );
  if (
    toastResult(result, editId.value ? '要求已更新' : '要求已新增', {
      validation: '请填写要求内容并选择有效分类与来源',
      stale: '该要求已被其他页面删除',
    })
  ) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: CustomerReqItem) {
  const ok = await confirmDelete('删除要求', `确认删除“${item.content}”吗？`);
  if (!ok) return;
  toastResult(
    store.deleteCrud('customer-req', props.entityName, item.id),
    '要求已删除',
    { stale: '该要求已被其他页面删除' },
  );
}
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <ASelect
        v-model="typeFilter"
        class="selection-toolbar__filter"
        :options="typeOptions"
        placeholder="要求分类"
        clearable
      />
      <ASelect
        v-model="sourceFilter"
        class="selection-toolbar__filter"
        :options="sourceOptions"
        placeholder="要求来源"
        clearable
      />
      <ASearchField
        v-model="query"
        class="selection-toolbar__filter"
        placeholder="搜索分类、机型、制程、内容、来源或备注"
      />
      <AButton v-if="writable" variant="filled" @click="addItem">新增要求</AButton>
    </div>
    <ATable
      :columns="columns"
      :rows="filtered"
      row-key="id"
      :empty-text="
        query.trim() || typeFilter || sourceFilter
          ? '没有匹配的要求记录'
          : '暂无要求记录'
      "
      striped
    >
      <template #cell-actions="{ row }">
        <div class="table-actions">
          <AIconButton :icon="Pencil" label="编辑" size="small" @click="editItem(row)" />
          <AIconButton
            :icon="Trash2"
            label="删除"
            size="small"
            variant="destructive"
            @click="deleteItem(row)"
          />
        </div>
      </template>
    </ATable>
    <ASheet v-model:open="dialogOpen" :title="editId ? '编辑要求' : '新增要求'" :width="560">
      <AFormGrid>
        <AFormRow label="要求分类" required>
          <ASelect v-model="form.type" :options="typeOptions" />
        </AFormRow>
        <AFormRow label="来源" required>
          <ASelect v-model="form.source" :options="sourceOptions" />
        </AFormRow>
        <AFormRow label="适用机型">
          <AField v-model="form.machine" :maxlength="100" placeholder="如 ALL" />
        </AFormRow>
        <AFormRow label="适用制程">
          <AField v-model="form.process" :maxlength="100" />
        </AFormRow>
        <AFormRow label="要求内容" required>
          <ATextArea v-model="form.content" :rows="3" :maxlength="600" />
        </AFormRow>
        <AFormRow label="备注">
          <AField v-model="form.note" :maxlength="200" />
        </AFormRow>
      </AFormGrid>
      <template #footer>
        <AButton @click="dialogOpen = false">取消</AButton>
        <AButton variant="filled" @click="saveItem">保存</AButton>
      </template>
    </ASheet>
  </div>
</template>
