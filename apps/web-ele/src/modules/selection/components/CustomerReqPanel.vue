<script lang="ts" setup>
import type { CustomerReqItem } from '../data.js';

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
const sourceFilter = ref('');
const form = reactive({
  content: '',
  machine: '',
  note: '',
  process: '',
  source: '',
  type: '',
});

const typeNames = computed(() => store.dictionaryNames('customer-req'));
const sourceNames = computed(() =>
  store.dictionaryNames('customer-req-source'),
);
const defaultType = computed(() => typeNames.value[0] || '输送段');
const defaultSource = computed(() => sourceNames.value[0] || '验收规范');

const items = computed(() => {
  return store.crudItems('customer-req', props.entityName) as CustomerReqItem[];
});

const filteredItems = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return items.value.filter(
    (item) =>
      (!typeFilter.value || item.type === typeFilter.value) &&
      (!sourceFilter.value || item.source === sourceFilter.value) &&
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

const hasFilters = computed(() =>
  Boolean(query.value.trim() || typeFilter.value || sourceFilter.value),
);

watch(
  () => props.entityName,
  () => {
    query.value = '';
    typeFilter.value = '';
    sourceFilter.value = '';
  },
);

function failureMessage(reason: string) {
  if (reason === 'storage') return '数据保存失败，本次修改未保存';
  if (reason === 'stale') return '该要求已被其他页面删除';
  if (reason === 'validation') return '请填写要求内容并选择有效分类与来源';
  return '保存失败，请重试';
}

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    content: '',
    machine: '',
    note: '',
    process: '',
    source: defaultSource.value,
    type: defaultType.value,
  });
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: CustomerReqItem) {
  editId.value = item.id;
  Object.assign(form, item);
  dialogOpen.value = true;
}

function saveItem() {
  const payload = {
    ...form,
    content: form.content.trim(),
    machine: form.machine.trim(),
    note: form.note.trim(),
    process: form.process.trim(),
    source: form.source.trim() || defaultSource.value,
    type: form.type.trim() || defaultType.value,
  };
  const result = store.saveCrud(
    'customer-req',
    props.entityName,
    payload,
    editId.value,
  );
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  dialogOpen.value = false;
  ElMessage.success(editId.value ? '要求已更新' : '要求已新增');
}

async function deleteItem(item: CustomerReqItem) {
  try {
    await ElMessageBox.confirm(
      `确认删除“${item.content || '该要求'}”吗？`,
      '删除要求',
      {
        cancelButtonText: '取消',
        confirmButtonText: '删除',
        type: 'warning',
      },
    );
  } catch {
    return;
  }
  const result = store.deleteCrud('customer-req', props.entityName, item.id);
  if (!result.ok) {
    ElMessage.error('该要求已不存在或存储不可用');
    return;
  }
  ElMessage.success('要求已删除');
}
</script>

<template>
  <section class="timeline-section">
    <div class="data-section__toolbar">
      <span>
        {{
          hasFilters
            ? `匹配 ${filteredItems.length} / 共 ${items.length} 条`
            : `${items.length} 条客户要求`
        }}
      </span>
      <div class="data-section__actions">
        <ElSelect
          v-model="typeFilter"
          aria-label="按要求分类筛选"
          class="data-filter-select"
          clearable
          filterable
          placeholder="要求分类"
        >
          <ElOption
            v-for="option in typeNames"
            :key="option"
            :label="option"
            :value="option"
          />
        </ElSelect>
        <ElSelect
          v-model="sourceFilter"
          aria-label="按要求来源筛选"
          class="data-filter-select"
          clearable
          filterable
          placeholder="要求来源"
        >
          <ElOption
            v-for="option in sourceNames"
            :key="option"
            :label="option"
            :value="option"
          />
        </ElSelect>
        <label class="tab-search">
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="query"
            aria-label="搜索客户通用要求"
            placeholder="搜索分类、机型、制程、内容、来源或备注"
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
          新增要求
        </ElButton>
      </div>
    </div>

    <div v-if="filteredItems.length > 0" class="table-scroll">
      <ElTable :data="filteredItems" row-key="id" stripe>
        <ElTableColumn label="要求分类" min-width="120" prop="type" />
        <ElTableColumn label="适用机型" min-width="110" prop="machine" />
        <ElTableColumn label="适用制程" min-width="110" prop="process" />
        <ElTableColumn label="要求内容" min-width="220" prop="content" />
        <ElTableColumn label="来源" min-width="120" prop="source" />
        <ElTableColumn label="备注" min-width="140" prop="note" />
        <ElTableColumn fixed="right" label="操作" width="108">
          <template #default="{ row }: { row: CustomerReqItem }">
            <div class="table-actions">
              <ElTooltip content="编辑" placement="top">
                <ElButton
                  aria-label="编辑要求"
                  circle
                  v-can-write="'selection:write'"
                  @click="editItem(row)"
                >
                  <Pencil :size="15" aria-hidden="true" />
                </ElButton>
              </ElTooltip>
              <ElTooltip content="删除" placement="top">
                <ElButton
                  aria-label="删除要求"
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
      :description="hasFilters ? '没有匹配的要求记录' : '暂无要求记录'"
      :image-size="72"
    />

    <ElDialog
      v-model="dialogOpen"
      :title="editId ? '编辑要求' : '新增要求'"
      width="560px"
      @closed="resetForm"
      @keyup.enter="saveItem"
    >
      <ElForm label-position="top">
        <div class="form-grid">
          <ElFormItem label="要求分类" required>
            <ElSelect v-model="form.type" class="w-full" filterable>
              <ElOption
                v-for="option in typeNames"
                :key="option"
                :label="option"
                :value="option"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="来源" required>
            <ElSelect v-model="form.source" class="w-full" filterable>
              <ElOption
                v-for="option in sourceNames"
                :key="option"
                :label="option"
                :value="option"
              />
            </ElSelect>
          </ElFormItem>
        </div>
        <div class="form-grid">
          <ElFormItem label="适用机型">
            <ElInput
              v-model="form.machine"
              maxlength="100"
              placeholder="如 ALL"
            />
          </ElFormItem>
          <ElFormItem label="适用制程">
            <ElInput v-model="form.process" maxlength="100" />
          </ElFormItem>
        </div>
        <ElFormItem label="要求内容" required>
          <ElInput
            v-model="form.content"
            :rows="3"
            maxlength="600"
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
