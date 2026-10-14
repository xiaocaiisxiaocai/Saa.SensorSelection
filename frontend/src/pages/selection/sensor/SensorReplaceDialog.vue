<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';

import { findSensorStatusName, isSensorStatus, type SensorItem } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

import { statusColor } from './sensor-table';

/** 用一个备选型号替换现用型号（原现用型号随之停用）。open(备选, 现用) 时锁定该现用。 */
const emit = defineEmits<{ replaced: [] }>();
const store = useSelectionStore();

const visible = ref(false);
const source = ref<SensorItem | null>(null);
const fixedTarget = ref<SensorItem | null>(null);
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

const chosen = computed(() => {
  if (fixedTarget.value) return fixedTarget.value;
  if (form.targetId == null) return null;
  return store.sensors.find((item) => item.id === form.targetId) ?? null;
});

const currentStatusLabel = computed(
  () =>
    findSensorStatusName(
      store.dictionaryItems('sensor-status').map((item) => item.name),
      'current',
    ) || '现用',
);

const leftStatus = computed(
  () => chosen.value?.status || currentStatusLabel.value,
);

/** 现用已关联型录或 3D 时，提示备选会沿用；没有则不提。 */
const inheritClause = computed(() => {
  const item = chosen.value;
  if (!item) return '';
  if (item.sopId != null && item.model3dId != null) {
    return '，并沿用原型号的型录和 3D';
  }
  if (item.sopId != null) return '，并沿用原型号的型录';
  if (item.model3dId != null) return '，并沿用原型号的 3D';
  return '';
});

function identity(item: SensorItem) {
  return [item.sensorType, item.brand].filter(Boolean).join(' · ');
}

function open(item: SensorItem, target?: SensorItem) {
  validationAttempted.value = false;
  source.value = item;
  fixedTarget.value = target ?? null;
  Object.assign(form, { note: '', targetId: target?.id ?? null });
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
    :width="640"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form v-if="source" layout="vertical">
      <div class="replace-compare">
        <article class="replace-card">
          <div class="replace-card__head">
            <a-tag :color="statusColor(leftStatus)">{{ leftStatus }}</a-tag>
            <span class="replace-card__caption">替换后停用</span>
          </div>
          <a-form-item
            v-if="!fixedTarget"
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
              class="full-width"
              :options="candidates"
              placeholder="请选择现用型号"
            />
          </a-form-item>
          <template v-if="chosen">
            <p class="replace-card__identity">{{ identity(chosen) }}</p>
            <p class="replace-card__model">{{ chosen.model }}</p>
            <p v-if="chosen.spec" class="replace-card__spec">{{ chosen.spec }}</p>
          </template>
          <p v-else class="replace-card__placeholder">请选择要替换的现用型号</p>
        </article>
        <div class="replace-compare__arrow" aria-hidden="true">
          <ArrowRight :size="16" />
        </div>
        <article class="replace-card">
          <div class="replace-card__head">
            <a-tag :color="statusColor(source.status)">{{ source.status }}</a-tag>
            <span class="replace-card__caption">替换后转为现用</span>
          </div>
          <p class="replace-card__identity">{{ identity(source) }}</p>
          <p class="replace-card__model">{{ source.model }}</p>
          <p v-if="source.spec" class="replace-card__spec">{{ source.spec }}</p>
        </article>
      </div>
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
    </a-form>
    <p v-if="chosen && source" class="replace-hint">
      替换后，{{ chosen.model }} 记为停用并保存问题点，{{
        source.model
      }} 转为现用{{ inheritClause }}。
    </p>
    <template #footer>
      <a-button @click="cancel">取消</a-button>
      <a-button type="primary" @click="save">替换</a-button>
    </template>
  </a-modal>
</template>

<style scoped src="./SensorReplaceDialog.css"></style>
