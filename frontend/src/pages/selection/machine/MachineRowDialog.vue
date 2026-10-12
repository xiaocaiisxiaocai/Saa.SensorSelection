<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import {
  isSensorStatus,
  sensorStatusRank,
  type MachineSectionRow,
  type SensorItem,
} from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

/**
 * 机型分区里一条记录的新增 / 编辑对话框。结构分区填选型（功能作用、关联传感器…），
 * 注意事项分区填事项。父组件调用 open() 打开；切换分区/机型/制程时自动关闭。
 */
const props = defineProps<{
  sectionId: number;
  machineName: string;
  processId: number;
  structure: boolean;
}>();

const store = useSelectionStore();
const visible = ref(false);
const editId = ref<number>();
const validationAttempted = ref(false);
const form = reactive({
  boardCharacteristicId: null as number | null,
  desc: '',
  machineModelId: null as number | null,
  name: '',
  note: '',
  processStepId: null as number | null,
  purpose: '',
  role: '',
  sensorIds: [] as Array<string | number>,
});
const dirtyGuard = useDirtyGuard(form);

const processStepOptions = computed(() =>
  store.processSteps.map((item) => ({
    label: `${item.layer} · ${item.name}`,
    value: item.id,
  })),
);
const machineModelOptions = computed(() =>
  store
    .dictionaryItems('machine-model')
    .map((item) => ({ label: item.name, value: item.id })),
);
const boardCharacteristicOptions = computed(() =>
  store
    .dictionaryItems('board-characteristic')
    .map((item) => ({ label: item.name, value: item.id })),
);
// 现用排前面，非现用在名称后注明状态
const sensorOptions = computed(() =>
  [...store.sensors]
    .sort((left, right) => {
      if (left.status === right.status) return left.id - right.id;
      return sensorStatusRank(left.status) - sensorStatusRank(right.status);
    })
    .map((item) => ({ value: item.id, label: sensorOptionLabel(item) })),
);

function sensorOptionLabel(item: SensorItem) {
  const name = [item.brand, item.model].filter(Boolean).join(' ');
  const title = [item.sensorType, name].filter(Boolean).join(' · ');
  return isSensorStatus(item.status, 'current')
    ? title
    : `${title}（${item.status}）`;
}

watch(
  () => [props.sectionId, props.machineName, props.processId] as const,
  () => {
    visible.value = false;
  },
);

/** 不传 row 为新增 */
function open(row?: MachineSectionRow) {
  validationAttempted.value = false;
  editId.value = row?.id;
  Object.assign(
    form,
    row
      ? {
          boardCharacteristicId: row.boardCharacteristicId,
          desc: row.desc,
          machineModelId: row.machineModelId,
          name: row.name,
          note: row.note,
          processStepId: row.processStepId,
          purpose: row.purpose,
          role: row.role,
          sensorIds: [...row.sensorIds],
        }
      : {
          boardCharacteristicId: null,
          desc: '',
          machineModelId: null,
          name: '',
          note: '',
          processStepId: null,
          purpose: '',
          role: '',
          sensorIds: [],
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
  const structure = props.structure;
  const result = store.saveMachineSectionRow(
    props.sectionId,
    props.machineName,
    {
      desc: form.desc.trim(),
      machineModelId: structure ? form.machineModelId : null,
      name: form.name.trim(),
      note: form.note.trim(),
      processStepId: structure ? form.processStepId : null,
      boardCharacteristicId: structure ? form.boardCharacteristicId : null,
      purpose: form.purpose.trim(),
      role: form.role.trim(),
      sensorIds: form.sensorIds.map(Number),
    },
    editId.value,
    props.processId,
  );
  if (notifyResult(result, editId.value ? '记录已更新' : '记录已新增')) {
    visible.value = false;
  }
}

defineExpose({ open });
</script>

<template>
  <a-modal
    :open="visible"
    :title="editId ? '编辑记录' : '新增记录'"
    :width="structure ? 640 : 480"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form v-if="structure" layout="vertical">
      <a-row :gutter="16">
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-role"
            label="功能作用"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.role.trim()
                  ? '请输入功能作用'
                  : undefined,
              )
            "
          >
            <a-input
              id="machine-section-role"
              v-model:value="form.role"
              :maxlength="80"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-machine-model-id"
            label="机型"
            extra="可选；来自“数据字典 → 机型”。"
          >
            <a-select
              id="machine-section-machine-model-id"
              v-model:value="form.machineModelId"
              :options="machineModelOptions"
              placeholder="选择机型（可选）"
              show-search
              option-filter-prop="label"
              allow-clear
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-process-step-id"
            label="工艺制程"
            extra="可选；来自“客户/制程 → 制程 → 工艺制程”。"
          >
            <a-select
              id="machine-section-process-step-id"
              v-model:value="form.processStepId"
              :options="processStepOptions"
              placeholder="选择工艺制程（可选）"
              show-search
              option-filter-prop="label"
              allow-clear
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-board-characteristic-id"
            label="板件特性"
            extra="可选；来自“数据字典 → 板件特性”。"
          >
            <a-select
              id="machine-section-board-characteristic-id"
              v-model:value="form.boardCharacteristicId"
              :options="boardCharacteristicOptions"
              placeholder="选择板件特性（可选）"
              show-search
              option-filter-prop="label"
              allow-clear
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-sensor-ids"
            label="关联传感器"
            required
            v-bind="
              fieldError(
                validationAttempted && form.sensorIds.length === 0
                  ? '请选择关联传感器'
                  : undefined,
              )
            "
            extra="规格和型号来自 Sensor型号；目录替换后这里会自动更新。"
          >
            <a-select
              id="machine-section-sensor-ids"
              v-model:value="form.sensorIds"
              mode="multiple"
              :options="sensorOptions"
              placeholder="按类型、品牌或型号搜索"
              allow-clear
              option-filter-prop="label"
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="machine-section-purpose" label="作用">
            <a-textarea
              id="machine-section-purpose"
              v-model:value="form.purpose"
              :rows="3"
              :maxlength="500"
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="machine-section-note" label="备注">
            <a-input
              id="machine-section-note"
              v-model:value="form.note"
              :maxlength="200"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    <a-form v-else layout="vertical">
      <a-row :gutter="16">
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-role-2"
            label="注意分类"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.role.trim()
                  ? '请输入注意分类'
                  : undefined,
              )
            "
          >
            <a-input
              id="machine-section-role-2"
              v-model:value="form.role"
              :maxlength="80"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-name"
            label="事项名称"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.name.trim()
                  ? '请输入事项名称'
                  : undefined,
              )
            "
          >
            <a-input
              id="machine-section-name"
              v-model:value="form.name"
              :maxlength="80"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="machine-section-desc" label="说明">
            <a-textarea
              id="machine-section-desc"
              v-model:value="form.desc"
              :rows="3"
              :maxlength="500"
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="machine-section-note-2" label="备注">
            <a-input
              id="machine-section-note-2"
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
