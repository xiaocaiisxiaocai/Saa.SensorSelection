<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import {
  SENSOR_DISABLED_MANUAL,
  SENSOR_HAS_ALTERNATES,
  isSensorStatus,
  sensorCurrentGuardsAlternates,
  sensorStatusRank,
  type SensorItem,
} from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

/** 新增 / 编辑 Sensor 型号的对话框；父组件调用 open() 打开 */
const store = useSelectionStore();

const visible = ref(false);
const editId = ref<number>();
const editing = ref<SensorItem>();
const validationAttempted = ref(false);
const form = reactive({
  brand: '',
  feature: '',
  model: '',
  partNumber: '',
  scene: '',
  sensorType: '',
  sopId: null as number | null,
  model3dId: null as number | null,
  spec: '',
  status: '',
});
const dirtyGuard = useDirtyGuard(form);

const keepsDisabled = computed(
  () =>
    editing.value !== undefined &&
    isSensorStatus(editing.value.status, 'disabled'),
);
const alternateGuard = computed(() =>
  editing.value !== undefined &&
  sensorCurrentGuardsAlternates(store.sensors, editing.value)
    ? SENSOR_HAS_ALTERNATES
    : undefined,
);
const statusOptions = computed(() =>
  [...store.dictionaryNames('sensor-status')]
    .sort((left, right) => sensorStatusRank(left) - sensorStatusRank(right))
    .map((name) => {
      const blockDisabled =
        isSensorStatus(name, 'disabled') && !keepsDisabled.value;
      return {
        label: name,
        value: name,
        disabled: blockDisabled,
        title: blockDisabled ? SENSOR_DISABLED_MANUAL : undefined,
      };
    }),
);
const typeOptions = computed(() =>
  store
    .dictionaryNames('sensor-type')
    .map((name) => ({ label: name, value: name })),
);
const sopOptions = computed(() =>
  store.sensorSops.map((item) => ({ label: item.title, value: item.id })),
);
const model3dOptions = computed(() =>
  store.sensor3dFiles.map((item) => ({ label: item.title, value: item.id })),
);

/** 不传 item 为新增 */
function open(item?: SensorItem) {
  validationAttempted.value = false;
  editing.value = item;
  editId.value = item?.id;
  Object.assign(
    form,
    item
      ? {
          brand: item.brand,
          feature: item.feature,
          model: item.model,
          partNumber: item.partNumber,
          scene: item.scene,
          sensorType: item.sensorType,
          sopId: item.sopId,
          model3dId: item.model3dId,
          spec: item.spec,
          status: item.status,
        }
      : {
          brand: '',
          feature: '',
          model: '',
          partNumber: '',
          scene: '',
          sensorType: typeOptions.value[0]?.value ?? '',
          sopId: null,
          model3dId: null,
          spec: '',
          status: statusOptions.value[0]?.value || '现用',
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
  const result = store.saveSensor(
    {
      ...form,
      brand: form.brand.trim(),
      feature: form.feature.trim(),
      model: form.model.trim(),
      partNumber: form.partNumber.trim(),
      scene: form.scene.trim(),
      spec: form.spec.trim(),
      sopId: form.sopId,
      model3dId: form.model3dId,
    },
    editId.value,
  );
  if (
    notifyResult(result, editId.value ? '型号已更新' : '型号已新增', {
      duplicate: '该型号已存在，请使用不同的型号名称',
      stale: '该型号已被其他页面删除',
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
    :title="editId ? '编辑 Sensor 型号' : '新增 Sensor 型号'"
    :width="680"
    destroy-on-close
    @cancel="cancel"
  >
    <!--
      状态/类型、关联型录/3D 用 2 列；品牌/型号/料号这组识别字段用 3 列，
      让 7 个短字段排满、不留半行空格。列数只允许 2 和 3 两种：再多一种，
      字段左边界会落到更多位置（曾实测 468/688/798/908 四条），看不出栅格。
    -->
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item
            html-for="sensor-status"
            label="状态"
            required
            :extra="alternateGuard"
            v-bind="
              fieldError(
                validationAttempted && !form.status ? '请选择状态' : undefined,
              )
            "
          >
            <a-select
              id="sensor-status"
              v-model:value="form.status"
              :options="statusOptions"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item
            html-for="sensor-sensor-type"
            label="感应器类型"
            required
            :extra="alternateGuard"
            v-bind="
              fieldError(
                validationAttempted && !form.sensorType
                  ? '请选择感应器类型'
                  : undefined,
              )
            "
          >
            <a-select
              id="sensor-sensor-type"
              v-model:value="form.sensorType"
              :options="typeOptions"
            />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col :span="8">
          <a-form-item html-for="sensor-brand" label="品牌">
            <a-input
              id="sensor-brand"
              v-model:value="form.brand"
              :maxlength="60"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="8">
          <a-form-item
            html-for="sensor-model"
            label="型号"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.model.trim()
                  ? '请输入型号'
                  : undefined,
              )
            "
          >
            <a-input
              id="sensor-model"
              v-model:value="form.model"
              :maxlength="100"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="8">
          <a-form-item html-for="sensor-part-number" label="料号">
            <a-input
              id="sensor-part-number"
              v-model:value="form.partNumber"
              :maxlength="80"
              placeholder="可选"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item html-for="sensor-sop-id" label="关联型录">
            <a-select
              id="sensor-sop-id"
              v-model:value="form.sopId"
              :options="sopOptions"
              placeholder="可选，关联一份 PDF 型录"
              allow-clear
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item html-for="sensor-model3d-id" label="关联 3D">
            <a-select
              id="sensor-model3d-id"
              v-model:value="form.model3dId"
              :options="model3dOptions"
              placeholder="可选，关联一个 3D 文件"
              allow-clear
            />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col :span="24">
          <a-form-item html-for="sensor-spec" label="规格参数">
            <a-textarea
              id="sensor-spec"
              v-model:value="form.spec"
              :rows="2"
              :maxlength="500"
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="sensor-feature" label="特性与注意">
            <a-textarea
              id="sensor-feature"
              v-model:value="form.feature"
              :rows="2"
              :maxlength="500"
              show-count
            />
          </a-form-item>
        </a-col>
        <!-- 和上面两个描述性字段同为多行：同类内容给成一行输入会显得轻重不一 -->
        <a-col :span="24">
          <a-form-item html-for="sensor-scene" label="适用场景">
            <a-textarea
              id="sensor-scene"
              v-model:value="form.scene"
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
