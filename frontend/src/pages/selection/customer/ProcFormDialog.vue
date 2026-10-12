<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import type { CustomerProcItem } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

/** 新增 / 编辑一条客户的制程注意事项；父组件调用 open() 打开 */
const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();

const visible = ref(false);
const editId = ref<number>();
const validationAttempted = ref(false);
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
const required = (empty: boolean, text: string) =>
  validationAttempted.value && empty ? text : undefined;

/** 不传 item 为新增 */
function open(item?: CustomerProcItem) {
  validationAttempted.value = false;
  editId.value = item?.id;
  Object.assign(
    form,
    item
      ? {
          feature: item.feature,
          note: item.note,
          role: item.role,
          sensorNote: item.sensorNote,
          type: item.type,
        }
      : {
          feature: '',
          note: '',
          role: '',
          sensorNote: '',
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
    'customer-proc',
    props.entityName,
    { ...form },
    editId.value,
  );
  if (
    notifyResult(result, editId.value ? '注意事项已更新' : '注意事项已新增')
  ) {
    visible.value = false;
  }
}

defineExpose({ open });
</script>

<template>
  <a-modal
    :open="visible"
    :title="editId ? '编辑注意事项' : '新增注意事项'"
    :width="560"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item
            html-for="customer-proc-type"
            label="制程分类"
            required
            v-bind="fieldError(required(!form.type, '请选择制程分类'))"
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
            v-bind="fieldError(required(!form.role.trim(), '请输入制程作用'))"
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
              fieldError(required(!form.feature.trim(), '请输入制程特性'))
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
      <a-button @click="cancel">取消</a-button>
      <a-button type="primary" @click="save">保存</a-button>
    </template>
  </a-modal>
</template>
