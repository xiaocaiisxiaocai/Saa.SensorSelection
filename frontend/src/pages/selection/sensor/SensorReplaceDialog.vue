<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import { isSensorStatus, type SensorItem } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

/** 用一个备选型号替换现用型号（原现用型号随之停用）；父组件调用 open(备选) 打开 */
const emit = defineEmits<{ replaced: [] }>();
const store = useSelectionStore();

const visible = ref(false);
const source = ref<SensorItem | null>(null);
const validationAttempted = ref(false);
const form = reactive({
  note: '',
  targetId: null as number | null,
});
const dirtyGuard = useDirtyGuard(form);

const candidates = computed(() => {
  const current = source.value;
  if (!current) return [];
  return store.sensors
    .filter(
      (item) =>
        isSensorStatus(item.status, 'current') && item.id !== current.id,
    )
    .map((item) => ({ value: item.id, label: `${item.brand} ${item.model}` }));
});

function open(item: SensorItem) {
  validationAttempted.value = false;
  source.value = item;
  Object.assign(form, { note: '', targetId: null });
  dirtyGuard.markClean();
  visible.value = true;
}

async function cancel() {
  if (await dirtyGuard.confirmClose()) {
    visible.value = false;
  }
}

function save() {
  const current = source.value;
  if (!current) return;
  validationAttempted.value = true;
  if (!form.targetId || !form.note.trim()) {
    return;
  }
  const result = store.replaceSensorCurrent(
    current.id,
    form.targetId,
    form.note,
  );
  if (notifyResult(result, '已替换现用型号，原型号已停用')) {
    visible.value = false;
    emit('replaced');
  }
}

defineExpose({ open });
</script>

<template>
  <a-modal
    :open="visible"
    title="用备选替换现用型号"
    :width="560"
    destroy-on-close
    @cancel="cancel"
  >
    <p>
      备选：{{ source?.sensorType }} · {{ source?.brand }} ·
      {{ source?.model }}
    </p>
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col :span="24">
          <a-form-item
            html-for="sensor-target-id"
            label="要替换的现用型号"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.targetId
                  ? '请选择要替换的现用型号'
                  : undefined,
              )
            "
          >
            <a-select
              id="sensor-target-id"
              v-model:value="form.targetId"
              :options="candidates"
              placeholder="请选择现用型号"
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="sensor-note"
            label="问题点"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.note.trim()
                  ? '请填写问题点'
                  : undefined,
              )
            "
          >
            <a-textarea
              id="sensor-note"
              v-model:value="form.note"
              :rows="3"
              :maxlength="500"
              placeholder="说明因什么问题被替换"
              show-count
            />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    <template #footer>
      <a-button @click="cancel">取消</a-button>
      <a-button type="primary" @click="save">替换</a-button>
    </template>
  </a-modal>
</template>
