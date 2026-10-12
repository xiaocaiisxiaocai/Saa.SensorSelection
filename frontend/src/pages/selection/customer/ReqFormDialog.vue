<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import type { CustomerReqItem } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

/** 新增 / 编辑一条客户通用要求；父组件调用 open() 打开 */
const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();

const visible = ref(false);
const editId = ref<number>();
const validationAttempted = ref(false);
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
const required = (empty: boolean, text: string) =>
  validationAttempted.value && empty ? text : undefined;

/** 不传 item 为新增 */
function open(item?: CustomerReqItem) {
  validationAttempted.value = false;
  editId.value = item?.id;
  Object.assign(
    form,
    item
      ? {
          content: item.content,
          machine: item.machine,
          note: item.note,
          process: item.process,
          source: item.source,
          type: item.type,
        }
      : {
          content: '',
          machine: '',
          note: '',
          process: '',
          source: sourceOptions.value[0]?.value ?? '',
          type: typeOptions.value[0]?.value ?? '',
        },
  );
  dirtyGuard.markClean();
  visible.value = true;
}

async function cancel() {
  if (await dirtyGuard.confirmClose()) visible.value = false;
}

function save() {
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
    visible.value = false;
  }
}

defineExpose({ open });
</script>

<template>
  <a-modal
    :open="visible"
    :title="editId ? '编辑要求' : '新增要求'"
    :width="560"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item
            html-for="customer-req-type"
            label="要求分类"
            required
            v-bind="fieldError(required(!form.type, '请选择要求分类'))"
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
            v-bind="fieldError(required(!form.source, '请选择来源'))"
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
            v-bind="
              fieldError(required(!form.content.trim(), '请输入要求内容'))
            "
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
      <a-button @click="cancel">取消</a-button>
      <a-button type="primary" @click="save">保存</a-button>
    </template>
  </a-modal>
</template>
