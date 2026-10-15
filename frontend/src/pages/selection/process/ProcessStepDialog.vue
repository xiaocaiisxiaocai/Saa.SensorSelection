<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import type { ProcessStepItem } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

/** 新增 / 编辑工艺制程；父组件调用 open() 打开 */
const store = useSelectionStore();

const visible = ref(false);
const editId = ref<number>();
const validationAttempted = ref(false);
const form = reactive({
  feature: '',
  layer: '',
  name: '',
  note: '',
  role: '',
});
const dirtyGuard = useDirtyGuard(form);

const layerOptions = computed(() =>
  store
    .dictionaryNames('process-layer')
    .map((name) => ({ label: name, value: name })),
);

/** 不传 item 为新增 */
function open(item?: ProcessStepItem) {
  validationAttempted.value = false;
  editId.value = item?.id;
  Object.assign(
    form,
    item
      ? {
          feature: item.feature,
          layer: item.layer,
          name: item.name,
          note: item.note,
          role: item.role,
        }
      : {
          feature: '',
          layer: layerOptions.value[0]?.value || '内层',
          name: '',
          note: '',
          role: '',
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
  const result = store.saveProcessStep(
    {
      feature: form.feature.trim(),
      layer: form.layer,
      name: form.name.trim(),
      note: form.note.trim(),
      role: form.role.trim(),
    },
    editId.value,
  );
  if (
    notifyResult(result, editId.value ? '工艺制程已更新' : '工艺制程已新增', {
      duplicate: '该工艺制程已存在',
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
    :title="editId ? '编辑工艺制程' : '新增工艺制程'"
    :width="640"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col :span="24">
          <a-form-item
            html-for="process-layer"
            label="制程"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.layer ? '请选择制程' : undefined,
              )
            "
          >
            <a-select
              id="process-layer"
              v-model:value="form.layer"
              :options="layerOptions"
              placeholder="选择制程分层"
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="process-name"
            label="工艺制程"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.name.trim()
                  ? '请输入工艺制程'
                  : undefined,
              )
            "
          >
            <a-input
              id="process-name"
              v-model:value="form.name"
              :maxlength="40"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="process-role" label="作用">
            <a-textarea
              id="process-role"
              v-model:value="form.role"
              :rows="2"
              :maxlength="500"
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="process-feature" label="制程特性">
            <a-textarea
              id="process-feature"
              v-model:value="form.feature"
              :rows="2"
              :maxlength="500"
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="process-note" label="备注">
            <a-textarea
              id="process-note"
              v-model:value="form.note"
              :rows="2"
              :maxlength="300"
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
