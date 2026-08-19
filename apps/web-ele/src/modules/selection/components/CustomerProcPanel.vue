<script lang="ts" setup>
import type { CustomerProcItem } from '../data.js';

import { computed, reactive, ref, watch } from 'vue';

import {
  ElButton,
  ElDialog,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTooltip,
} from 'element-plus';
import { Pencil, Plus, Save, Search, Trash2, X } from 'lucide-vue-next';

import { useSelectionStore } from '../store';

const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();
const dialogOpen = ref(false);
const editId = ref<number>();
const query = ref('');
const typeFilter = ref('');
const form = reactive({
  feature: '',
  note: '',
  role: '',
  sensorNote: '',
  type: '',
});

const typeNames = computed(() => store.dictionaryNames('customer-proc'));
const defaultType = computed(() => typeNames.value[0] || 'DES 制程');

const items = computed(() => {
  return store.crudItems(
    'customer-proc',
    props.entityName,
  ) as CustomerProcItem[];
});

const filteredItems = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return items.value.filter(
    (item) =>
      (!typeFilter.value || item.type === typeFilter.value) &&
      (!value ||
        [item.type, item.role, item.feature, item.sensorNote, item.note]
          .join(' ')
          .toLocaleLowerCase('zh-CN')
          .includes(value)),
  );
});

const hasFilters = computed(() =>
  Boolean(query.value.trim() || typeFilter.value),
);

watch(
  () => props.entityName,
  () => {
    query.value = '';
    typeFilter.value = '';
  },
);

function failureMessage(reason: string) {
  if (reason === 'storage') return '数据保存失败，本次修改未保存';
  if (reason === 'stale') return '该注意事项已被其他页面删除';
  if (reason === 'validation') return '请填写制程作用、制程特性并选择有效分类';
  return '保存失败，请重试';
}

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    feature: '',
    note: '',
    role: '',
    sensorNote: '',
    type: defaultType.value,
  });
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: CustomerProcItem) {
  editId.value = item.id;
  Object.assign(form, item);
  dialogOpen.value = true;
}

function saveItem() {
  const payload = {
    ...form,
    feature: form.feature.trim(),
    note: form.note.trim(),
    role: form.role.trim(),
    sensorNote: form.sensorNote.trim(),
    type: form.type.trim() || defaultType.value,
  };
  const result = store.saveCrud(
    'customer-proc',
    props.entityName,
    payload,
    editId.value,
  );
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  dialogOpen.value = false;
  ElMessage.success(editId.value ? '注意事项已更新' : '注意事项已新增');
}

async function deleteItem(item: CustomerProcItem) {
  try {
    await ElMessageBox.confirm(
      `确认删除“${item.role || '该注意事项'}”吗？`,
      '删除注意事项',
      {
        cancelButtonText: '取消',
        confirmButtonText: '删除',
        type: 'warning',
      },
    );
  } catch {
    return;
  }
  const result = store.deleteCrud('customer-proc', props.entityName, item.id);
  if (!result.ok) {
    ElMessage.error('该注意事项已不存在或存储不可用');
    return;
  }
  ElMessage.success('注意事项已删除');
}
</script>

<template>
  <section class="timeline-section">
    <div class="data-section__toolbar">
      <span>
        {{
          hasFilters
            ? `匹配 ${filteredItems.length} / 共 ${items.length} 条`
            : `${items.length} 条制程注意事项`
        }}
      </span>
      <div class="data-section__actions">
        <ElSelect
          v-model="typeFilter"
          aria-label="按制程分类筛选"
          class="data-filter-select"
          clearable
          filterable
          placeholder="制程分类"
        >
          <ElOption
            v-for="option in typeNames"
            :key="option"
            :label="option"
            :value="option"
          />
        </ElSelect>
        <label class="tab-search">
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="query"
            aria-label="搜索制程注意事项"
            placeholder="搜索分类、作用、特性、sensor注意或备注"
            type="search"
          />
          <button
            v-if="query"
            aria-label="清除搜索"
            class="icon-button"
            title="清除搜索"
            type="button"
            @click="query = ''"
          >
            <X :size="15" aria-hidden="true" />
          </button>
        </label>
        <ElButton
          type="primary"
          v-can-write="'selection:write'"
          @click="addItem"
        >
          <Plus :size="15" aria-hidden="true" />
          新增注意事项
        </ElButton>
      </div>
    </div>

    <div v-if="filteredItems.length > 0" class="table-scroll">
      <ElTable :data="filteredItems" row-key="id" stripe>
        <ElTableColumn label="制程分类" min-width="110" prop="type" />
        <ElTableColumn label="制程作用" min-width="140" prop="role" />
        <ElTableColumn label="制程特性" min-width="180" prop="feature" />
        <ElTableColumn
          label="sensor使用注意事项"
          min-width="180"
          prop="sensorNote"
        />
        <ElTableColumn label="备注" min-width="120" prop="note" />
        <ElTableColumn fixed="right" label="操作" width="108">
          <template #default="{ row }: { row: CustomerProcItem }">
            <div class="table-actions">
              <ElTooltip content="编辑" placement="top">
                <ElButton
                  aria-label="编辑注意事项"
                  circle
                  v-can-write="'selection:write'"
                  @click="editItem(row)"
                >
                  <Pencil :size="15" aria-hidden="true" />
                </ElButton>
              </ElTooltip>
              <ElTooltip content="删除" placement="top">
                <ElButton
                  aria-label="删除注意事项"
                  circle
                  type="danger"
                  v-can-write="'selection:write'"
                  @click="deleteItem(row)"
                >
                  <Trash2 :size="15" aria-hidden="true" />
                </ElButton>
              </ElTooltip>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>
    <ElEmpty
      v-else
      :description="hasFilters ? '没有匹配的注意事项' : '暂无注意事项'"
      :image-size="72"
    />

    <ElDialog
      v-model="dialogOpen"
      :title="editId ? '编辑注意事项' : '新增注意事项'"
      width="560px"
      @closed="resetForm"
      @keyup.enter="saveItem"
    >
      <ElForm label-position="top">
        <ElFormItem label="制程分类" required>
          <ElSelect v-model="form.type" class="w-full" filterable>
            <ElOption
              v-for="option in typeNames"
              :key="option"
              :label="option"
              :value="option"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="制程作用" required>
          <ElInput v-model="form.role" maxlength="100" />
        </ElFormItem>
        <ElFormItem label="制程特性" required>
          <ElInput
            v-model="form.feature"
            :rows="3"
            maxlength="600"
            type="textarea"
          />
        </ElFormItem>
        <ElFormItem label="sensor使用注意事项">
          <ElInput
            v-model="form.sensorNote"
            :rows="2"
            maxlength="400"
            type="textarea"
          />
        </ElFormItem>
        <ElFormItem label="备注">
          <ElInput v-model="form.note" maxlength="200" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogOpen = false">取消</ElButton>
        <ElButton
          type="primary"
          v-can-write="'selection:write'"
          @click="saveItem"
        >
          <Save :size="15" aria-hidden="true" />
          保存
        </ElButton>
      </template>
    </ElDialog>
  </section>
</template>
