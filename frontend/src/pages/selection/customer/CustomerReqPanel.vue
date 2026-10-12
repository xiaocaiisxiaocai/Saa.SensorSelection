<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { Pencil, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import type { CustomerReqItem } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import {
  rowClick,
  scrollX,
  sortBy,
  useTablePagination,
} from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const dialogOpen = ref(false);
const editId = ref<number>();
const validationAttempted = ref(false);
const query = ref('');
const typeFilters = ref<string[]>([]);
const sourceFilters = ref<string[]>([]);
const form = reactive({
  content: '',
  machine: '',
  note: '',
  process: '',
  source: '',
  type: '',
});
const dirtyGuard = useDirtyGuard(form);

const typeOptions = computed(() =>
  store
    .dictionaryNames('customer-req')
    .map((name) => ({ label: name, value: name })),
);
const sourceOptions = computed(() =>
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
      (typeFilters.value.length === 0 ||
        typeFilters.value.includes(item.type)) &&
      (sourceFilters.value.length === 0 ||
        sourceFilters.value.includes(item.source)) &&
      (!value ||
        [
          item.type,
          item.machine,
          item.process,
          item.content,
          item.source,
          item.note,
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
    sourceFilters.value.length > 0,
);
const columns = computed(() => {
  const cols: TableColumnType<CustomerReqItem>[] = [
    // 136/108：最长字典值「02 两片检测标准」实测 113px、「04 产品迭代」84px，
    // 加上单元格左右内边距才不会折成两行把行高撑乱。
    {
      key: 'type',
      dataIndex: 'type',
      title: '要求分类',
      width: 136,
      fixed: 'left',
      sorter: sortBy<CustomerReqItem>('type'),
    },
    { key: 'machine', dataIndex: 'machine', title: '适用机型', width: 90 },
    { key: 'process', dataIndex: 'process', title: '适用制程', width: 130 },
    { key: 'content', dataIndex: 'content', title: '要求内容', width: 230 },
    {
      key: 'source',
      dataIndex: 'source',
      title: '来源',
      width: 108,
      sorter: sortBy<CustomerReqItem>('source'),
    },
    { key: 'note', dataIndex: 'note', title: '备注', width: 140 },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', title: '操作', width: 96, fixed: 'right' });
  }
  return cols;
});
const customRow = computed(() =>
  rowClick<CustomerReqItem>((row) => {
    if (writable.value) editItem(row);
  }),
);
const typeError = computed(() =>
  validationAttempted.value && !form.type ? '请选择要求分类' : undefined,
);
const sourceError = computed(() =>
  validationAttempted.value && !form.source ? '请选择来源' : undefined,
);
const contentError = computed(() =>
  validationAttempted.value && !form.content.trim()
    ? '请输入要求内容'
    : undefined,
);

watch(
  () => props.entityName,
  () => {
    query.value = '';
    typeFilters.value = [];
    sourceFilters.value = [];
  },
);

function resetForm() {
  validationAttempted.value = false;
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

function resetFilters() {
  query.value = '';
  typeFilters.value = [];
  sourceFilters.value = [];
}

function addItem() {
  resetForm();
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

function editItem(item: CustomerReqItem) {
  validationAttempted.value = false;
  editId.value = item.id;
  Object.assign(form, {
    content: item.content,
    machine: item.machine,
    note: item.note,
    process: item.process,
    source: item.source,
    type: item.type,
  });
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

function saveItem() {
  validationAttempted.value = true;
  const result = store.saveCrud(
    'customer-req',
    props.entityName,
    { ...form },
    editId.value,
  );
  if (
    notifyResult(result, editId.value ? '要求已更新' : '要求已新增', {
      stale: '该要求已被其他页面删除',
    })
  ) {
    dialogOpen.value = false;
  }
}

async function cancelDialog() {
  if (await dirtyGuard.confirmClose()) dialogOpen.value = false;
}

async function deleteItem(item: CustomerReqItem) {
  const ok = await confirmDelete('删除要求', `确认删除“${item.content}”吗？`);
  if (!ok) return;
  notifyResult(
    store.deleteCrud('customer-req', props.entityName, item.id),
    '要求已删除',
    { stale: '该要求已被其他页面删除' },
  );
}

// 分页条始终显示；筛选变化回到第一页
const { pagination, onChange: onPageChange } = useTablePagination(
  () => filtered.value.length,
  [query, typeFilters, sourceFilters, () => props.entityName],
);
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <a-select
        v-model:value="typeFilters"
        class="selection-toolbar__filter"
        mode="multiple"
        :options="typeOptions"
        placeholder="要求分类"
        aria-label="要求分类筛选"
        :max-tag-count="1"
        allow-clear
      />
      <a-select
        v-model:value="sourceFilters"
        class="selection-toolbar__filter"
        mode="multiple"
        :options="sourceOptions"
        placeholder="要求来源"
        aria-label="要求来源筛选"
        :max-tag-count="1"
        allow-clear
      />
      <a-input
        v-model:value="query"
        class="selection-toolbar__filter"
        placeholder="搜索分类、机型、制程、内容、来源或备注"
        aria-label="搜索客户要求"
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
      <a-button v-if="writable" type="primary" @click="addItem">
        新增要求
      </a-button>
    </div>
    <a-table
      :columns="columns"
      :data-source="filtered"
      row-key="id"
      :pagination="pagination"
      :custom-row="customRow"
      :scroll="{ x: scrollX(columns) }"
      :locale="{
        emptyText: hasActiveFilters ? '没有匹配的要求记录' : '暂无要求记录',
      }"
      @change="onPageChange"
    >
      <template #bodyCell="{ column, record, text }">
        <a-space v-if="column.key === 'actions'" :size="4">
          <a-tooltip title="编辑">
            <a-button
              type="text"
              size="small"
              aria-label="编辑"
              @click="editItem(record as CustomerReqItem)"
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
              @click="deleteItem(record as CustomerReqItem)"
            >
              <template #icon><Trash2 :size="14" /></template>
            </a-button>
          </a-tooltip>
        </a-space>
        <template v-else>{{ text || '—' }}</template>
      </template>
    </a-table>
    <a-modal
      :open="dialogOpen"
      :title="editId ? '编辑要求' : '新增要求'"
      :width="560"
      destroy-on-close
      @cancel="cancelDialog"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item
              html-for="customer-req-type"
              label="要求分类"
              required
              :validate-status="typeError ? 'error' : undefined"
              :help="typeError"
            >
              <a-select
                id="customer-req-type"
                v-model:value="form.type"
                :options="typeOptions"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item
              html-for="customer-req-source"
              label="来源"
              required
              :validate-status="sourceError ? 'error' : undefined"
              :help="sourceError"
            >
              <a-select
                id="customer-req-source"
                v-model:value="form.source"
                :options="sourceOptions"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item html-for="customer-req-machine" label="适用机型">
              <a-input
                id="customer-req-machine"
                v-model:value="form.machine"
                :maxlength="100"
                placeholder="如 ALL"
                allow-clear
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item html-for="customer-req-process" label="适用制程">
              <a-input
                id="customer-req-process"
                v-model:value="form.process"
                :maxlength="100"
                placeholder="如 ALL"
                allow-clear
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item
              html-for="customer-req-content"
              label="要求内容"
              required
              :validate-status="contentError ? 'error' : undefined"
              :help="contentError"
            >
              <a-textarea
                id="customer-req-content"
                v-model:value="form.content"
                :rows="3"
                :maxlength="600"
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item html-for="customer-req-note" label="备注">
              <a-input
                id="customer-req-note"
                v-model:value="form.note"
                :maxlength="200"
                allow-clear
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
