<script lang="ts" setup>
import type { TimelineItem } from '../data.js';

import { computed, reactive, ref, watch } from 'vue';

import {
  ElButton,
  ElDatePicker,
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
  ElTag,
  ElTooltip,
} from 'element-plus';
import { Pencil, Plus, Save, Search, Trash2, X } from 'lucide-vue-next';

import { formatLocalDate } from '../domain.js';
import { useSelectionStore } from '../store';

const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();
const dialogOpen = ref(false);
const editId = ref<number>();
const query = ref('');
const form = reactive({
  date: '',
  machine: '',
  measure: '',
  problem: '',
  status: '',
  type: '',
});

const typeNames = computed(() => store.dictionaryNames('customer-feedback'));
const statusNames = computed(() =>
  store.dictionaryNames('customer-feedback-status'),
);
const defaultType = computed(() => typeNames.value[0] || '感应器异常');
const defaultStatus = computed(() => statusNames.value[0] || '待处理');

const items = computed(() => {
  return store.crudItems(
    'customer-feedback',
    props.entityName,
  ) as TimelineItem[];
});

function statusTagType(status: string) {
  if (status.includes('待')) return 'warning' as const;
  if (status.includes('中')) return 'primary' as const;
  if (status.includes('解决') || status.includes('完成')) {
    return 'success' as const;
  }
  return 'info' as const;
}

const filteredItems = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  if (!value) return items.value;
  return items.value.filter((item) =>
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
      .includes(value),
  );
});

watch(
  () => props.entityName,
  () => {
    query.value = '';
  },
);

function failureMessage(reason: string) {
  if (reason === 'storage') return '数据保存失败，本次修改未保存';
  if (reason === 'stale') return '该反馈已被其他页面删除';
  if (reason === 'validation') return '请填写问题点并选择有效分类与处理状态';
  return '保存失败，请重试';
}

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    date: formatLocalDate(new Date()),
    machine: '',
    measure: '',
    problem: '',
    status: defaultStatus.value,
    type: defaultType.value,
  });
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: TimelineItem) {
  editId.value = item.id;
  Object.assign(form, item);
  dialogOpen.value = true;
}

function saveItem() {
  const payload = {
    ...form,
    machine: form.machine.trim(),
    measure: form.measure.trim(),
    problem: form.problem.trim(),
    status: form.status.trim() || defaultStatus.value,
    type: form.type.trim() || defaultType.value,
  };
  const result = store.saveCrud(
    'customer-feedback',
    props.entityName,
    payload,
    editId.value,
  );
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  dialogOpen.value = false;
  ElMessage.success(editId.value ? '反馈已更新' : '反馈已新增');
}

async function deleteItem(item: TimelineItem) {
  try {
    await ElMessageBox.confirm(
      `确认删除“${item.problem || '该反馈'}”吗？`,
      '删除反馈',
      {
        cancelButtonText: '取消',
        confirmButtonText: '删除',
        type: 'warning',
      },
    );
  } catch {
    return;
  }
  const result = store.deleteCrud(
    'customer-feedback',
    props.entityName,
    item.id,
  );
  if (!result.ok) {
    ElMessage.error('该反馈已不存在或存储不可用');
    return;
  }
  ElMessage.success('反馈已删除');
}
</script>

<template>
  <section class="timeline-section">
    <div class="data-section__toolbar">
      <span>
        {{
          query.trim()
            ? `匹配 ${filteredItems.length} / 共 ${items.length} 条`
            : `${items.length} 条厂外反馈`
        }}
      </span>
      <div class="data-section__actions">
        <label class="tab-search">
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="query"
            aria-label="搜索厂外反馈"
            placeholder="搜索分类、机型、问题点、对策、时间或状态"
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
          新增反馈
        </ElButton>
      </div>
    </div>

    <div v-if="filteredItems.length > 0" class="table-scroll">
      <ElTable :data="filteredItems" row-key="id" stripe>
        <ElTableColumn label="问题分类" min-width="140" prop="type" />
        <ElTableColumn label="适用机型" min-width="120" prop="machine" />
        <ElTableColumn label="问题点" min-width="200" prop="problem" />
        <ElTableColumn label="改善对策" min-width="200" prop="measure" />
        <ElTableColumn label="反馈时间" min-width="110" prop="date" />
        <ElTableColumn label="处理状态" min-width="100">
          <template #default="{ row }: { row: TimelineItem }">
            <ElTag :type="statusTagType(row.status)" effect="light">
              {{ row.status }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn fixed="right" label="操作" width="108">
          <template #default="{ row }: { row: TimelineItem }">
            <div class="table-actions">
              <ElTooltip content="编辑" placement="top">
                <ElButton
                  aria-label="编辑反馈"
                  circle
                  v-can-write="'selection:write'"
                  @click="editItem(row)"
                >
                  <Pencil :size="15" aria-hidden="true" />
                </ElButton>
              </ElTooltip>
              <ElTooltip content="删除" placement="top">
                <ElButton
                  aria-label="删除反馈"
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
      :description="query.trim() ? '没有匹配的反馈记录' : '暂无反馈记录'"
      :image-size="72"
    />

    <ElDialog
      v-model="dialogOpen"
      :title="editId ? '编辑反馈' : '新增反馈'"
      width="560px"
      @closed="resetForm"
      @keyup.enter="saveItem"
    >
      <ElForm label-position="top">
        <div class="form-grid">
          <ElFormItem label="问题分类" required>
            <ElSelect v-model="form.type" class="w-full">
              <ElOption
                v-for="option in typeNames"
                :key="option"
                :label="option"
                :value="option"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="适用机型">
            <ElInput v-model="form.machine" maxlength="100" />
          </ElFormItem>
        </div>
        <div class="form-grid">
          <ElFormItem label="反馈时间">
            <ElDatePicker
              v-model="form.date"
              class="w-full"
              type="date"
              value-format="YYYY-MM-DD"
            />
          </ElFormItem>
          <ElFormItem label="处理状态" required>
            <ElSelect v-model="form.status" class="w-full">
              <ElOption
                v-for="option in statusNames"
                :key="option"
                :label="option"
                :value="option"
              />
            </ElSelect>
          </ElFormItem>
        </div>
        <ElFormItem label="问题点" required>
          <ElInput
            v-model="form.problem"
            :rows="3"
            maxlength="600"
            type="textarea"
          />
        </ElFormItem>
        <ElFormItem label="改善对策">
          <ElInput
            v-model="form.measure"
            :rows="2"
            maxlength="400"
            type="textarea"
          />
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
