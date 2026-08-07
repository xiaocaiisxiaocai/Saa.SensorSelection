<script lang="ts" setup>
import type { TimelineItem } from '../data.js';

import { computed, reactive, ref } from 'vue';

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
  ElTag,
  ElTooltip,
} from 'element-plus';
import { CalendarDays, Pencil, Plus, Save, Trash2 } from 'lucide-vue-next';

import { formatLocalDate } from '../domain.js';
import { useSelectionStore } from '../store';

const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();
const dialogOpen = ref(false);
const editId = ref<number>();
const form = reactive({
  actions: '',
  date: '',
  desc: '',
  status: 'pending' as TimelineItem['status'],
  title: '',
});

const items = computed(() => {
  return store.crudItems(
    'customer-feedback',
    props.entityName,
  ) as TimelineItem[];
});

const statusMeta = {
  pending: { label: '待处理', type: 'warning' },
  processing: { label: '处理中', type: 'primary' },
  resolved: { label: '已解决', type: 'success' },
} as const;

function failureMessage(reason: string) {
  if (reason === 'storage') return '浏览器本地存储不可用，本次修改未保存';
  if (reason === 'stale') return '该反馈已被其他页面删除';
  return '请填写反馈标题';
}

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    actions: '',
    date: formatLocalDate(new Date()),
    desc: '',
    status: 'pending',
    title: '',
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
  const result = store.saveCrud(
    'customer-feedback',
    props.entityName,
    { ...form },
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
    await ElMessageBox.confirm(`确认删除“${item.title}”吗？`, '删除反馈', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    });
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
      <span>{{ items.length }} 条厂外反馈</span>
      <ElButton type="primary" @click="addItem">
        <Plus :size="15" aria-hidden="true" />
        新增反馈
      </ElButton>
    </div>
    <div v-if="items.length > 0" class="timeline-list">
      <article v-for="item in items" :key="item.id" class="timeline-item">
        <div class="timeline-item__date">
          <CalendarDays :size="15" aria-hidden="true" />
          {{ item.date || '未填写日期' }}
        </div>
        <div class="timeline-item__body">
          <div class="timeline-item__title-row">
            <h3>{{ item.title }}</h3>
            <ElTag :type="statusMeta[item.status].type" effect="light">
              {{ statusMeta[item.status].label }}
            </ElTag>
          </div>
          <p>{{ item.desc || '暂无问题描述' }}</p>
          <div v-if="item.actions" class="timeline-item__action">
            <strong>处理措施</strong>
            <span>{{ item.actions }}</span>
          </div>
        </div>
        <div class="table-actions">
          <ElTooltip content="编辑" placement="top">
            <ElButton aria-label="编辑反馈" circle @click="editItem(item)">
              <Pencil :size="15" aria-hidden="true" />
            </ElButton>
          </ElTooltip>
          <ElTooltip content="删除" placement="top">
            <ElButton
              aria-label="删除反馈"
              circle
              type="danger"
              @click="deleteItem(item)"
            >
              <Trash2 :size="15" aria-hidden="true" />
            </ElButton>
          </ElTooltip>
        </div>
      </article>
    </div>
    <ElEmpty v-else :image-size="72" description="暂无反馈记录" />

    <ElDialog
      v-model="dialogOpen"
      :title="editId ? '编辑反馈' : '新增反馈'"
      width="560px"
      @closed="resetForm"
    >
      <ElForm label-position="top">
        <div class="form-grid">
          <ElFormItem label="日期">
            <ElDatePicker
              v-model="form.date"
              class="w-full"
              type="date"
              value-format="YYYY-MM-DD"
            />
          </ElFormItem>
          <ElFormItem label="状态">
            <ElSelect v-model="form.status" class="w-full">
              <ElOption label="待处理" value="pending" />
              <ElOption label="处理中" value="processing" />
              <ElOption label="已解决" value="resolved" />
            </ElSelect>
          </ElFormItem>
        </div>
        <ElFormItem label="反馈标题" required>
          <ElInput v-model="form.title" maxlength="100" />
        </ElFormItem>
        <ElFormItem label="问题描述">
          <ElInput
            v-model="form.desc"
            :rows="3"
            maxlength="600"
            type="textarea"
          />
        </ElFormItem>
        <ElFormItem label="处理措施">
          <ElInput
            v-model="form.actions"
            :rows="2"
            maxlength="400"
            type="textarea"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogOpen = false">取消</ElButton>
        <ElButton type="primary" @click="saveItem">
          <Save :size="15" aria-hidden="true" />
          保存
        </ElButton>
      </template>
    </ElDialog>
  </section>
</template>
