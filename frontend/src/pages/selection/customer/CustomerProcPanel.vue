<script setup lang="ts">
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import type { CustomerProcItem } from '@/domain';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import {
  AButton,
  AField,
  AFilterResetButton,
  AFormGrid,
  AFormRow,
  AIconButton,
  ASearchField,
  ASelect,
  ASheet,
  ATable,
  ATextArea,
  ATokenField,
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
const typeFilters = ref<Array<string | number>>([]);
const form = reactive({
  feature: '',
  note: '',
  role: '',
  sensorNote: '',
  type: '',
});

const typeOptions = computed<SelectOption[]>(() =>
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
const columns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'type', label: '制程分类', width: 90 },
    { key: 'role', label: '制程作用', minWidth: 150, ellipsis: true },
    { key: 'feature', label: '制程特性', minWidth: 150, ellipsis: true },
    {
      key: 'sensorNote',
      label: 'sensor使用注意事项',
      minWidth: 190,
      ellipsis: true,
    },
    { key: 'note', label: '备注', minWidth: 130, ellipsis: true },
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
    typeFilters.value = [];
  },
);

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    feature: '',
    note: '',
    role: '',
    sensorNote: '',
    type: typeOptions.value[0]?.value ?? '',
  });
}

function resetFilters() {
  query.value = '';
  typeFilters.value = [];
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: CustomerProcItem) {
  editId.value = item.id;
  Object.assign(form, {
    feature: item.feature,
    note: item.note,
    role: item.role,
    sensorNote: item.sensorNote,
    type: item.type,
  });
  dialogOpen.value = true;
}

function saveItem() {
  const result = store.saveCrud(
    'customer-proc',
    props.entityName,
    { ...form },
    editId.value,
  );
  if (
    toastResult(result, editId.value ? '注意事项已更新' : '注意事项已新增', {
      validation: '请填写制程作用、制程特性并选择分类',
    })
  ) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: CustomerProcItem) {
  const ok = await confirmDelete('删除注意事项', `确认删除“${item.role}”吗？`);
  if (!ok) return;
  toastResult(
    store.deleteCrud('customer-proc', props.entityName, item.id),
    '注意事项已删除',
  );
}
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <ATokenField
        v-model="typeFilters"
        class="selection-toolbar__filter"
        :options="typeOptions"
        placeholder="制程分类"
        aria-label="制程分类筛选"
        :max-visible-tokens="1"
      />
      <ASearchField
        v-model="query"
        class="selection-toolbar__filter"
        placeholder="搜索分类、作用、特性、sensor注意或备注"
      />
      <AFilterResetButton :active="hasActiveFilters" @reset="resetFilters" />
      <AButton v-if="writable" variant="filled" @click="addItem">新增</AButton>
    </div>
    <ATable
      :columns="columns"
      :rows="filtered"
      row-key="id"
      :empty-text="
        query.trim() || typeFilters.length
          ? '没有匹配的注意事项'
          : '暂无注意事项'
      "
      striped
    >
      <template #cell-actions="{ row }">
        <div class="table-actions">
          <AIconButton
            :icon="Pencil"
            label="编辑"
            size="small"
            @click="editItem(row)"
          />
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
    <ASheet
      v-model:open="dialogOpen"
      :title="editId ? '编辑注意事项' : '新增注意事项'"
      :width="560"
    >
      <AFormGrid>
        <AFormRow label="制程分类" required>
          <ASelect v-model="form.type" :options="typeOptions" />
        </AFormRow>
        <AFormRow label="制程作用" required>
          <AField v-model="form.role" :maxlength="80" />
        </AFormRow>
        <AFormRow label="制程特性" required>
          <ATextArea v-model="form.feature" :rows="2" :maxlength="500" />
        </AFormRow>
        <AFormRow label="sensor使用注意事项">
          <ATextArea v-model="form.sensorNote" :rows="2" :maxlength="500" />
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
