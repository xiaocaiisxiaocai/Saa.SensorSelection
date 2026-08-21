<script setup lang="ts">
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import type { TimelineItem } from '@/domain';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import {
  ABadge,
  AButton,
  ADatePicker,
  AField,
  AFormGrid,
  AFormRow,
  AIconButton,
  ASearchField,
  ASelect,
  ASheet,
  ATable,
  ATextArea,
  type BadgeTone,
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
const statusFilter = ref<string | null>(null);
const form = reactive({
  date: null as string | null,
  machine: '',
  measure: '',
  problem: '',
  status: '',
  type: '',
});

const typeOptions = computed<SelectOption[]>(() =>
  store
    .dictionaryNames('customer-feedback')
    .map((name) => ({ label: name, value: name })),
);
const statusOptions = computed<SelectOption[]>(() =>
  store
    .dictionaryNames('customer-feedback-status')
    .map((name) => ({ label: name, value: name })),
);

const items = computed(
  () => store.crudItems('customer-feedback', props.entityName) as TimelineItem[],
);
const filtered = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return items.value.filter(
    (item) =>
      (!typeFilter.value || item.type === typeFilter.value) &&
      (!statusFilter.value || item.status === statusFilter.value) &&
      (!value ||
        [item.type, item.machine, item.problem, item.measure, item.date, item.status]
          .join(' ')
          .toLocaleLowerCase('zh-CN')
          .includes(value)),
  );
});
const columns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'type', label: '问题分类', width: 140 },
    { key: 'machine', label: '适用机型', width: 110 },
    { key: 'problem', label: '问题点', minWidth: 160, ellipsis: true },
    { key: 'measure', label: '改善对策', minWidth: 160, ellipsis: true },
    { key: 'date', label: '反馈时间', width: 120 },
    { key: 'status', label: '处理状态', width: 100 },
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
    statusFilter.value = null;
  },
);

function statusTone(status: string): BadgeTone {
  if (status === '已解决') return 'green';
  if (status === '处理中') return 'blue';
  return 'orange';
}

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    date: null,
    machine: '',
    measure: '',
    problem: '',
    status: statusOptions.value[0]?.value ?? '',
    type: typeOptions.value[0]?.value ?? '',
  });
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: TimelineItem) {
  editId.value = item.id;
  Object.assign(form, {
    date: item.date || null,
    machine: item.machine,
    measure: item.measure,
    problem: item.problem,
    status: item.status,
    type: item.type,
  });
  dialogOpen.value = true;
}

function saveItem() {
  const result = store.saveCrud(
    'customer-feedback',
    props.entityName,
    {
      ...form,
      date: form.date ?? '',
    },
    editId.value,
  );
  if (
    toastResult(result, editId.value ? '反馈已更新' : '反馈已新增', {
      validation: '请填写问题点并选择分类与状态',
    })
  ) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: TimelineItem) {
  const ok = await confirmDelete('删除反馈', `确认删除“${item.problem}”吗？`);
  if (!ok) return;
  toastResult(
    store.deleteCrud('customer-feedback', props.entityName, item.id),
    '反馈已删除',
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
        placeholder="问题分类"
        clearable
      />
      <ASelect
        v-model="statusFilter"
        class="selection-toolbar__filter"
        :options="statusOptions"
        placeholder="处理状态"
        clearable
      />
      <ASearchField
        v-model="query"
        class="selection-toolbar__filter"
        placeholder="搜索分类、机型、问题点、对策、时间或状态"
      />
      <AButton v-if="writable" variant="filled" @click="addItem">新增</AButton>
    </div>
    <ATable
      :columns="columns"
      :rows="filtered"
      row-key="id"
      :empty-text="
        query.trim() || typeFilter || statusFilter
          ? '没有匹配的反馈记录'
          : '暂无反馈记录'
      "
      striped
    >
      <template #cell-status="{ row }">
        <ABadge :label="row.status" :tone="statusTone(row.status)" />
      </template>
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
    <ASheet v-model:open="dialogOpen" :title="editId ? '编辑反馈' : '新增反馈'" :width="560">
      <AFormGrid>
        <AFormRow label="问题分类" required>
          <ASelect v-model="form.type" :options="typeOptions" />
        </AFormRow>
        <AFormRow label="适用机型">
          <AField v-model="form.machine" :maxlength="100" />
        </AFormRow>
        <AFormRow label="反馈时间">
          <ADatePicker v-model="form.date" placeholder="选择日期" />
        </AFormRow>
        <AFormRow label="处理状态" required>
          <ASelect v-model="form.status" :options="statusOptions" />
        </AFormRow>
        <AFormRow label="问题点" required>
          <ATextArea v-model="form.problem" :rows="3" :maxlength="600" />
        </AFormRow>
        <AFormRow label="改善对策">
          <ATextArea v-model="form.measure" :rows="3" :maxlength="600" />
        </AFormRow>
      </AFormGrid>
      <template #footer>
        <AButton @click="dialogOpen = false">取消</AButton>
        <AButton variant="filled" @click="saveItem">保存</AButton>
      </template>
    </ASheet>
  </div>
</template>
