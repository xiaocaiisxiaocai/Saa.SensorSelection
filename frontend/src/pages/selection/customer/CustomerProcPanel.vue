<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { Pencil, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import type { CustomerProcItem } from '@/domain';
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
const editId = ref<number>();
const validationAttempted = ref(false);
const query = ref('');
const typeFilters = ref<Array<string | number>>([]);
const form = reactive({
  feature: '',
  note: '',
  role: '',
  sensorNote: '',
  type: '',
});
const dirtyGuard = useDirtyGuard(form);

const typeOptions = computed(() =>
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
const columns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    // 104：最长字典值只要 80px，但表头「制程分类」加排序图标要 86px，
    // 同时和另外两个 Tab 的首列保持相近宽度。
    {
      key: 'type',
      dataIndex: 'type',
      title: '制程分类',
      width: 104,
      fixed: 'left',
      sorter: sortBy('type'),
    },
    { key: 'role', dataIndex: 'role', title: '制程作用', width: 150 },
    { key: 'feature', dataIndex: 'feature', title: '制程特性', width: 150 },
    {
      key: 'sensorNote',
      dataIndex: 'sensorNote',
      title: 'sensor使用注意事项',
      width: 190,
    },
    { key: 'note', dataIndex: 'note', title: '备注', width: 130 },
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
  },
);

function resetForm() {
  validationAttempted.value = false;
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
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

function editItem(item: CustomerProcItem) {
  validationAttempted.value = false;
  editId.value = item.id;
  Object.assign(form, {
    feature: item.feature,
    note: item.note,
    role: item.role,
    sensorNote: item.sensorNote,
    type: item.type,
  });
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

function saveItem() {
  validationAttempted.value = true;
  const result = store.saveCrud(
    'customer-proc',
    props.entityName,
    { ...form },
    editId.value,
  );
  if (
    notifyResult(result, editId.value ? '注意事项已更新' : '注意事项已新增')
  ) {
    dialogOpen.value = false;
  }
}

async function cancelDialog() {
  if (await dirtyGuard.confirmClose()) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: CustomerProcItem) {
  const ok = await confirmDelete('删除注意事项', `确认删除“${item.role}”吗？`);
  if (!ok) return;
  notifyResult(
    store.deleteCrud('customer-proc', props.entityName, item.id),
    '注意事项已删除',
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
        placeholder="制程分类"
        aria-label="制程分类筛选"
        :max-tag-count="1"
        allow-clear
        option-filter-prop="label"
      />
      <a-input
        v-model:value="query"
        class="selection-toolbar__filter"
        placeholder="搜索分类、作用、特性、sensor注意或备注"
        aria-label="搜索制程注意事项"
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
          query.trim() || typeFilters.length
            ? '没有匹配的注意事项'
            : '暂无注意事项',
      }"
      :custom-row="writable ? rowClick(editItem) : undefined"
    >
      <template #bodyCell="{ column, record: row, text: value }">
        <template v-if="column.key === 'actions'">
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
      :open="dialogOpen"
      :title="editId ? '编辑注意事项' : '新增注意事项'"
      :width="560"
      destroy-on-close
      @cancel="cancelDialog"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item
              html-for="customer-proc-type"
              label="制程分类"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.type
                    ? '请选择制程分类'
                    : undefined,
                )
              "
            >
              <a-select
                id="customer-proc-type"
                v-model:value="form.type"
                :options="typeOptions"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item
              html-for="customer-proc-role"
              label="制程作用"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.role.trim()
                    ? '请输入制程作用'
                    : undefined,
                )
              "
            >
              <a-input
                id="customer-proc-role"
                v-model:value="form.role"
                :maxlength="80"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item
              html-for="customer-proc-feature"
              label="制程特性"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.feature.trim()
                    ? '请输入制程特性'
                    : undefined,
                )
              "
            >
              <a-textarea
                id="customer-proc-feature"
                v-model:value="form.feature"
                :rows="2"
                :maxlength="500"
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item
              html-for="customer-proc-sensor-note"
              label="sensor使用注意事项"
            >
              <a-textarea
                id="customer-proc-sensor-note"
                v-model:value="form.sensorNote"
                :rows="2"
                :maxlength="500"
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item html-for="customer-proc-note" label="备注">
              <a-input
                id="customer-proc-note"
                v-model:value="form.note"
                :maxlength="200"
                allow-clear
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
