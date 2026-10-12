<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { History, Pencil, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import type { TimelineItem } from '@/domain';
import { fieldError } from '@/pages/shared/form';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { cellText, rowClick, scrollX, sortBy } from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

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
const dirtyGuard = useDirtyGuard(form);

const typeOptions = computed(() =>
  store
    .dictionaryNames('customer-feedback')
    .map((name) => ({ label: name, value: name })),
);
const statusOptions = computed(() =>
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
type MeasureEntry = NonNullable<TimelineItem['measureHistory']>[number];
const HISTORY_COLUMNS = [
  { key: 'measure', title: '改善对策' },
  { key: 'date', title: '反馈时间', width: 112, align: 'center' as const },
  { key: 'status', title: '状态', width: 88, align: 'center' as const },
];
// 同一天可能有内容相同的多条记录，用序号作 row-key
const historyRows = computed(() =>
  [...(historyItem.value?.measureHistory ?? [])]
    .sort((left, right) => right.date.localeCompare(left.date, 'zh-CN'))
    .map((entry, index) => ({ ...entry, rowKey: index })),
);
const columns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    // 168：最长字典值「02 两片检测品质异常」实测 143px + 左右内边距 16px。
    {
      key: 'type',
      dataIndex: 'type',
      title: '问题分类',
      width: 168,
      fixed: 'left',
      sorter: sortBy('type'),
    },
    { key: 'machine', dataIndex: 'machine', title: '适用机型', width: 90 },
    { key: 'problem', dataIndex: 'problem', title: '问题点', width: 205 },
    { key: 'measure', dataIndex: 'measure', title: '改善对策', width: 205 },
    // 120：完整日期「2026-08-25」按表格的等宽数字实测 98px + 左右内边距 16px。
    {
      key: 'date',
      dataIndex: 'date',
      title: '反馈时间',
      width: 120,
      sorter: sortBy('date'),
    },
    {
      key: 'status',
      dataIndex: 'status',
      title: '处理状态',
      width: 112,
      sorter: sortBy('status'),
    },
    { key: 'history', dataIndex: 'history', title: '历史', width: 60 },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', title: '操作', width: 96, fixed: 'right' });
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

/** 处理状态对应的 a-tag 预设色 */
function statusColor(status: string): string {
  const normalizedStatus = status.trim().replace(/^\d+\s*[.、_\-:：]?\s*/, '');
  if (normalizedStatus === '已解决') return 'green';
  if (normalizedStatus === '处理中' || normalizedStatus === '测试中') {
    return 'orange';
  }
  return 'default';
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
  dirtyGuard.markClean();
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
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

function showHistory(item: TimelineItem) {
  historyItem.value = item;
  historyOpen.value = true;
}

function activateRow(item: TimelineItem) {
  if (writable.value) {
    editItem(item);
    return;
  }
  showHistory(item);
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
  if (notifyResult(result, editId.value ? '反馈已更新' : '反馈已新增')) {
    dialogOpen.value = false;
  }
}

async function cancelDialog() {
  if (await dirtyGuard.confirmClose()) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: TimelineItem) {
  const ok = await confirmDelete('删除反馈', `确认删除“${item.problem}”吗？`);
  if (!ok) return;
  notifyResult(
    store.deleteCrud('customer-feedback', props.entityName, item.id),
    '反馈已删除',
  );
}
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <a-select
        v-model:value="typeFilters"
        mode="multiple"
        class="selection-toolbar__filter"
        :options="typeOptions"
        placeholder="问题分类"
        aria-label="问题分类筛选"
        :max-tag-count="1"
        allow-clear
        option-filter-prop="label"
      />
      <a-select
        v-model:value="statusFilters"
        mode="multiple"
        class="selection-toolbar__filter"
        :options="statusOptions"
        placeholder="处理状态"
        aria-label="处理状态筛选"
        :max-tag-count="1"
        allow-clear
        option-filter-prop="label"
      />
      <a-input
        v-model:value="query"
        class="selection-toolbar__filter"
        placeholder="搜索分类、机型、问题点、对策、时间或状态"
        aria-label="搜索客户反馈"
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
      <a-button v-if="writable" type="primary" @click="addItem">新增</a-button>
    </div>
    <a-table
      :columns="columns"
      :data-source="filtered"
      row-key="id"
      :pagination="false"
      :scroll="{ x: scrollX(columns) }"
      :locale="{
        emptyText:
          query.trim() || typeFilters.length || statusFilters.length
            ? '没有匹配的反馈记录'
            : '暂无反馈记录',
      }"
      :custom-row="rowClick(activateRow)"
    >
      <template #bodyCell="{ column, record: row, text: value }">
        <template v-if="column.key === 'status'">
          <a-tag :color="statusColor(row.status)">{{ row.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'history'">
          <a-tooltip title="查看改善对策历史">
            <a-button
              type="text"
              size="small"
              aria-label="查看改善对策历史"
              @click="showHistory(row)"
            >
              <template #icon><History :size="14" /></template>
            </a-button>
          </a-tooltip>
        </template>
        <template v-else-if="column.key === 'actions'">
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
        <template v-else>{{ cellText(value) }}</template>
      </template>
    </a-table>
    <a-modal
      :open="historyOpen"
      title="改善对策历史"
      :width="680"
      :footer="null"
      destroy-on-close
      @cancel="historyOpen = false"
    >
      <template v-if="historyItem">
        <a-descriptions bordered size="small" :column="1">
          <a-descriptions-item label="问题点">
            {{ historyItem.problem }}
          </a-descriptions-item>
        </a-descriptions>
        <a-table
          class="feedback-history__table"
          :columns="HISTORY_COLUMNS"
          :data-source="historyRows"
          row-key="rowKey"
          :pagination="false"
          size="small"
          :locale="{ emptyText: '暂无改善对策历史' }"
        >
          <template #bodyCell="{ column, record: entry }">
            <a-typography-text
              v-if="column.key === 'measure'"
              :delete="(entry as MeasureEntry).status === '已作废'"
              :type="
                (entry as MeasureEntry).status === '已作废'
                  ? 'secondary'
                  : undefined
              "
            >
              {{ (entry as MeasureEntry).measure || '—' }}
            </a-typography-text>
            <template v-else-if="column.key === 'date'">
              {{ (entry as MeasureEntry).date || '—' }}
            </template>
            <a-tag
              v-else-if="column.key === 'status'"
              :color="
                (entry as MeasureEntry).status === '现行' ? 'green' : 'default'
              "
            >
              {{ (entry as MeasureEntry).status }}
            </a-tag>
          </template>
        </a-table>
      </template>
    </a-modal>
    <a-modal
      :open="dialogOpen"
      :title="editId ? '编辑反馈' : '新增反馈'"
      :width="560"
      destroy-on-close
      @cancel="cancelDialog"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item
              html-for="customer-feedback-type"
              label="问题分类"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.type
                    ? '请选择问题分类'
                    : undefined,
                )
              "
            >
              <a-select
                id="customer-feedback-type"
                v-model:value="form.type"
                :options="typeOptions"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item html-for="customer-feedback-machine" label="适用机型">
              <a-input
                id="customer-feedback-machine"
                v-model:value="form.machine"
                :maxlength="100"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item html-for="customer-feedback-date" label="反馈时间">
              <a-date-picker
                id="customer-feedback-date"
                v-model:value="form.date"
                value-format="YYYY-MM-DD"
                placeholder="选择日期"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item
              html-for="customer-feedback-status"
              label="处理状态"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.status
                    ? '请选择处理状态'
                    : undefined,
                )
              "
            >
              <a-select
                id="customer-feedback-status"
                v-model:value="form.status"
                :options="statusOptions"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item
              html-for="customer-feedback-problem"
              label="问题点"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.problem.trim()
                    ? '请输入问题点'
                    : undefined,
                )
              "
            >
              <a-textarea
                id="customer-feedback-problem"
                v-model:value="form.problem"
                :rows="3"
                :maxlength="600"
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item html-for="customer-feedback-measure" label="改善对策">
              <a-textarea
                id="customer-feedback-measure"
                v-model:value="form.measure"
                :rows="3"
                :maxlength="600"
                show-count
              />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <template #footer>
        <a-button @click="cancelDialog">取消</a-button>
        <a-button type="primary" @click="saveItem">保存</a-button>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.feedback-history__table {
  margin-top: var(--space-5);
}
</style>
