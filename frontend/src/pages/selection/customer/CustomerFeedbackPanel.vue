<script setup lang="ts">
import { History, Pencil, Trash2 } from 'lucide-vue-next';
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
  type BadgeTone,
  type SelectOption,
  type TableColumn,
} from '@/ui';

const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const dialogOpen = ref(false);
const historyOpen = ref(false);
const historyItem = ref<TimelineItem>();
const editId = ref<number>();
const validationAttempted = ref(false);
const query = ref('');
const typeFilters = ref<Array<string | number>>([]);
const statusFilters = ref<Array<string | number>>([]);
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
  () =>
    store.crudItems('customer-feedback', props.entityName) as TimelineItem[],
);
const filtered = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return items.value.filter(
    (item) =>
      (typeFilters.value.length === 0 ||
        typeFilters.value.includes(item.type)) &&
      (statusFilters.value.length === 0 ||
        statusFilters.value.includes(item.status)) &&
      (!value ||
        [
          item.type,
          item.machine,
          item.problem,
          item.measure,
          item.date,
          item.status,
        ]
          .join(' ')
          .toLocaleLowerCase('zh-CN')
          .includes(value)),
  );
});
const hasActiveFilters = computed(
  () =>
    Boolean(query.value.trim()) ||
    typeFilters.value.length > 0 ||
    statusFilters.value.length > 0,
);
const historyRows = computed(() =>
  [...(historyItem.value?.measureHistory ?? [])].sort((left, right) =>
    right.date.localeCompare(left.date, 'zh-CN'),
  ),
);
const columns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'type', label: '问题分类', width: 100 },
    { key: 'machine', label: '适用机型', width: 90 },
    { key: 'problem', label: '问题点', minWidth: 205, ellipsis: true },
    { key: 'measure', label: '改善对策', minWidth: 205, ellipsis: true },
    { key: 'date', label: '反馈时间', width: 100 },
    { key: 'status', label: '处理状态', width: 90 },
    { key: 'history', label: '历史', width: 60 },
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
    statusFilters.value = [];
    historyOpen.value = false;
    historyItem.value = undefined;
  },
);

function statusTone(status: string): BadgeTone {
  const normalizedStatus = status.trim().replace(/^\d+\s*[.、_\-:：]?\s*/, '');
  if (normalizedStatus === '已解决') return 'green';
  if (normalizedStatus === '处理中' || normalizedStatus === '测试中') {
    return 'orange';
  }
  return 'neutral';
}

function resetForm() {
  validationAttempted.value = false;
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

function resetFilters() {
  query.value = '';
  typeFilters.value = [];
  statusFilters.value = [];
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: TimelineItem) {
  validationAttempted.value = false;
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

function showHistory(item: TimelineItem) {
  historyItem.value = item;
  historyOpen.value = true;
}

function saveItem() {
  validationAttempted.value = true;
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
      <ATokenField
        v-model="typeFilters"
        class="selection-toolbar__filter"
        :options="typeOptions"
        placeholder="问题分类"
        aria-label="问题分类筛选"
        :max-visible-tokens="1"
      />
      <ATokenField
        v-model="statusFilters"
        class="selection-toolbar__filter"
        :options="statusOptions"
        placeholder="处理状态"
        aria-label="处理状态筛选"
        :max-visible-tokens="1"
      />
      <ASearchField
        v-model="query"
        class="selection-toolbar__filter"
        placeholder="搜索分类、机型、问题点、对策、时间或状态"
        aria-label="搜索客户反馈"
      />
      <AFilterResetButton :active="hasActiveFilters" @reset="resetFilters" />
      <AButton v-if="writable" variant="filled" @click="addItem">新增</AButton>
    </div>
    <ATable
      :columns="columns"
      :rows="filtered"
      row-key="id"
      :empty-text="
        query.trim() || typeFilters.length || statusFilters.length
          ? '没有匹配的反馈记录'
          : '暂无反馈记录'
      "
      striped
    >
      <template #cell-status="{ row }">
        <ABadge :label="row.status" :tone="statusTone(row.status)" />
      </template>
      <template #cell-history="{ row }">
        <AIconButton
          :icon="History"
          label="查看改善对策历史"
          size="small"
          @click="showHistory(row)"
        />
      </template>
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
    <ASheet v-model:open="historyOpen" title="改善对策历史" :width="680">
      <div v-if="historyItem" class="feedback-history">
        <div class="feedback-history__context">
          <span>问题点</span>
          <strong>{{ historyItem.problem }}</strong>
        </div>
        <div v-if="historyRows.length" class="feedback-history__table">
          <div class="feedback-history__header" aria-hidden="true">
            <span class="feedback-history__cell--center">改善对策</span>
            <span class="feedback-history__cell--center">反馈时间</span>
            <span class="feedback-history__cell--center">状态</span>
          </div>
          <div
            v-for="(entry, index) in historyRows"
            :key="`${entry.date}-${entry.measure}-${index}`"
            class="feedback-history__row"
          >
            <span
              class="feedback-history__measure feedback-history__cell--center"
              :class="{
                'feedback-history__measure--obsolete':
                  entry.status === '已作废',
              }"
            >
              {{ entry.measure || '—' }}
            </span>
            <span class="feedback-history__cell--center">{{
              entry.date || '—'
            }}</span>
            <span
              class="feedback-history__status feedback-history__cell--center"
            >
              <ABadge
                :label="entry.status"
                :tone="entry.status === '现行' ? 'green' : 'neutral'"
              />
            </span>
          </div>
        </div>
        <div v-else class="feedback-history__empty">暂无改善对策历史</div>
      </div>
    </ASheet>
    <ASheet
      v-model:open="dialogOpen"
      :title="editId ? '编辑反馈' : '新增反馈'"
      :width="560"
    >
      <AFormGrid>
        <AFormRow
          label="问题分类"
          required
          :error="
            validationAttempted && !form.type ? '请选择问题分类' : undefined
          "
        >
          <ASelect v-model="form.type" :options="typeOptions" />
        </AFormRow>
        <AFormRow label="适用机型">
          <AField v-model="form.machine" :maxlength="100" />
        </AFormRow>
        <AFormRow label="反馈时间">
          <ADatePicker v-model="form.date" placeholder="选择日期" />
        </AFormRow>
        <AFormRow
          label="处理状态"
          required
          :error="
            validationAttempted && !form.status ? '请选择处理状态' : undefined
          "
        >
          <ASelect v-model="form.status" :options="statusOptions" />
        </AFormRow>
        <AFormRow
          label="问题点"
          required
          :error="
            validationAttempted && !form.problem.trim()
              ? '请输入问题点'
              : undefined
          "
        >
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

<style scoped>
.feedback-history {
  display: grid;
  gap: var(--space-5);
}

.feedback-history__context {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: start;
  padding: var(--space-4);
  background: var(--fill-4);
  border-radius: var(--radius-lg);
}

.feedback-history__context span {
  color: var(--label-2);
}

.feedback-history__context strong {
  font: var(--text-control);
  font-weight: 500;
  line-height: 1.55;
}

.feedback-history__table {
  overflow: hidden;
  border-radius: var(--radius-lg);
  box-shadow: inset 0 0 0 0.5px var(--separator);
}

.feedback-history__header,
.feedback-history__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px 76px;
  gap: var(--space-4);
  align-items: center;
  padding: var(--space-3) var(--space-4);
}

.feedback-history__header {
  font: var(--text-control-em);
  color: var(--label);
  background: var(--fill-4);
}

.feedback-history__row {
  min-height: var(--row-height-loose);
  font: var(--text-control);
  box-shadow: inset 0 -0.5px 0 var(--separator);
}

.feedback-history__row:last-child {
  box-shadow: none;
}

.feedback-history__measure {
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.feedback-history__cell--center {
  justify-self: stretch;
  text-align: center;
}

.feedback-history__status {
  display: flex;
  justify-content: center;
}

.feedback-history__measure--obsolete {
  color: var(--label-2);
  text-decoration-line: line-through;
  text-decoration-thickness: 1px;
  text-decoration-color: currentcolor;
}

.feedback-history__empty {
  display: grid;
  place-items: center;
  min-height: 128px;
  color: var(--label-2);
}
</style>
