<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import type { TimelineItem } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

/** 新增 / 编辑一条厂外反馈；父组件调用 open() 打开 */
const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();

const visible = ref(false);
const editId = ref<number>();
const validationAttempted = ref(false);
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

/** 不传 item 为新增 */
function open(item?: TimelineItem) {
  validationAttempted.value = false;
  editId.value = item?.id;
  Object.assign(
    form,
    item
      ? {
          date: item.date || null,
          machine: item.machine,
          measure: item.measure,
          problem: item.problem,
          status: item.status,
          type: item.type,
        }
      : {
          date: null,
          machine: '',
          measure: '',
          problem: '',
          status: statusOptions.value[0]?.value ?? '',
          type: typeOptions.value[0]?.value ?? '',
        },
  );
  dirtyGuard.markClean();
  visible.value = true;
}

async function cancel() {
  if (await dirtyGuard.confirmClose()) {
    visible.value = false;
  }
}

function save() {
  validationAttempted.value = true;
  const result = store.saveCrud(
    'customer-feedback',
    props.entityName,
    { ...form, date: form.date ?? '' },
    editId.value,
  );
  if (notifyResult(result, editId.value ? '反馈已更新' : '反馈已新增')) {
    visible.value = false;
  }
}

defineExpose({ open });
</script>

<template>
  <a-modal
    :open="visible"
    :title="editId ? '编辑反馈' : '新增反馈'"
    :width="560"
    destroy-on-close
    @cancel="cancel"
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
              class="full-width"
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
      <a-button @click="cancel">取消</a-button>
      <a-button type="primary" @click="save">保存</a-button>
    </template>
  </a-modal>
</template>
