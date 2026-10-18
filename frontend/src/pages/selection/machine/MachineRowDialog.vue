<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import { ImagePlus } from 'lucide-vue-next';

import {
  isSensorStatus,
  MACHINE_ROW_IMAGE_RULES,
  sensorStatusRank,
  type MachineRowImage,
  type MachineSectionRow,
  type SaveResult,
  type SensorItem,
} from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { createFilePicker } from '@/pages/shared/file-rules';
import { uploadFile } from '@/pages/shared/files';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { UPLOADING_TITLE, useUploadLock } from '@/pages/shared/upload-lock';
import { useSelectionStore } from '@/stores/selection';

/**
 * 机型分区里一条记录的新增 / 编辑对话框。结构分区填选型（Sensor名称、关联传感器…）
 * 和示意图（不放 / 沿用上一笔的图 / 上传新图；沿用的图和上一笔在表格里合并成一格），
 * 注意事项分区填事项。父组件调用 open() 打开；切换分区/机型时自动关闭。
 */
const props = defineProps<{
  sectionId: number;
  machineName: string;
  structure: boolean;
  /**
   * 表格还没建（机型的直属表格按需创建）时传入：第一笔记录连同表格一起保存，
   * 记录不合法时表格也不建
   */
  saveFirstRow?: (
    payload: Partial<MachineSectionRow>,
  ) => SaveResult<MachineSectionRow>;
}>();

const store = useSelectionStore();
const visible = ref(false);
const editId = ref<number>();
const validationAttempted = ref(false);
const form = reactive({
  boardCharacteristicId: null as number | null,
  desc: '',
  name: '',
  note: '',
  purpose: '',
  role: '',
  sensorIds: [] as Array<string | number>,
  imageMode: 'none' as ImageMode,
  uploadedImage: null as MachineRowImage | null,
});
const dirtyGuard = useDirtyGuard(form);

type ImageMode = 'keep' | 'none' | 'previous' | 'upload';
const SIZE_MESSAGE = '图片大小不能超过 2 MB';
const TYPE_MESSAGE = '仅支持 JPG、PNG 或 WebP 图片';
const { uploading, runUpload } = useUploadLock();
const imagePicker = createFilePicker(
  {
    ...MACHINE_ROW_IMAGE_RULES,
    sizeMessage: SIZE_MESSAGE,
    typeMessage: TYPE_MESSAGE,
  },
  (files: File[]) => runUpload(() => uploadImage(files[0])),
);

async function uploadImage(file: File | undefined) {
  if (!file) return;
  const dataUrl = await uploadFile(file);
  if (!dataUrl) return;
  form.uploadedImage = {
    dataUrl,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

const rows = computed(() =>
  props.saveFirstRow
    ? []
    : store.machineSectionRows(props.sectionId, props.machineName),
);
const currentImage = computed(
  () => rows.value.find((row) => row.id === editId.value)?.image ?? null,
);
/** 「上一笔」：编辑时是它前面那条记录，新增时是最后一条 */
const previousRow = computed(() => {
  const index = editId.value
    ? rows.value.findIndex((row) => row.id === editId.value)
    : rows.value.length;
  return index > 0 ? rows.value[index - 1] : undefined;
});
const imageOptions = computed(() => [
  ...(currentImage.value
    ? [{ label: '保留当前图片', value: 'keep' as const }]
    : []),
  { label: '不放图', value: 'none' as const },
  {
    label: '沿用上一笔的图',
    value: 'previous' as const,
    disabled: !previousRow.value?.image,
  },
  { label: '上传新图', value: 'upload' as const },
]);
const imageHint = computed(() => {
  if (form.imageMode === 'previous' && previousRow.value?.image) {
    return `和上一笔「${previousRow.value.role}」共用「${previousRow.value.image.fileName}」，表格里合并成一格`;
  }
  if (!previousRow.value?.image) {
    return previousRow.value
      ? `上一笔「${previousRow.value.role}」没有示意图，不能沿用`
      : '这是第一笔记录，没有可沿用的图';
  }
  return '选「沿用上一笔的图」时，和上一笔在表格里合并成一格';
});
const imageError = computed(() =>
  validationAttempted.value &&
  form.imageMode === 'upload' &&
  !form.uploadedImage
    ? '请上传图片'
    : undefined,
);

/** 保存时的示意图：undefined 表示不改动 */
function imagePayload(): MachineRowImage | null | undefined {
  if (form.imageMode === 'keep') return undefined;
  if (form.imageMode === 'previous') return previousRow.value?.image ?? null;
  if (form.imageMode === 'upload') return form.uploadedImage;
  return null;
}

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
  () => [props.sectionId, props.machineName] as const,
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
          name: row.name,
          note: row.note,
          purpose: row.purpose,
          role: row.role,
          sensorIds: [...row.sensorIds],
          imageMode: row.image ? ('keep' as const) : ('none' as const),
          uploadedImage: null,
        }
      : {
          boardCharacteristicId: null,
          desc: '',
          name: '',
          note: '',
          purpose: '',
          role: '',
          sensorIds: [],
          imageMode: 'none' as const,
          uploadedImage: null,
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
  if (structure && imageError.value) return;
  const image = structure ? imagePayload() : undefined;
  const payload = {
    desc: form.desc.trim(),
    machineModelId: null,
    name: form.name.trim(),
    note: form.note.trim(),
    processStepId: null,
    boardCharacteristicId: structure ? form.boardCharacteristicId : null,
    purpose: form.purpose.trim(),
    role: form.role.trim(),
    sensorIds: form.sensorIds.map(Number),
    ...(image === undefined ? {} : { image }),
  };
  const result = props.saveFirstRow
    ? props.saveFirstRow(payload)
    : store.saveMachineSectionRow(
        props.sectionId,
        props.machineName,
        payload,
        editId.value,
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
    :title="`${editId ? '编辑' : '新增'}${structure ? '选型' : '事项'}`"
    :width="structure ? 640 : 480"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form v-if="structure" layout="vertical">
      <a-row :gutter="16">
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-role"
            label="Sensor名称"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.role.trim()
                  ? '请输入 Sensor名称'
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
            <a-textarea
              id="machine-section-note"
              v-model:value="form.note"
              :rows="2"
              :maxlength="200"
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-image"
            label="示意图"
            :extra="imageHint"
            v-bind="fieldError(imageError)"
          >
            <a-radio-group
              id="machine-section-image"
              v-model:value="form.imageMode"
              :options="imageOptions"
            />
            <a-upload
              v-if="form.imageMode === 'upload'"
              class="machine-row-dialog__upload"
              :accept="MACHINE_ROW_IMAGE_RULES.accept"
              :before-upload="imagePicker.beforeUpload"
              :disabled="uploading"
              :show-upload-list="false"
              @reject="imagePicker.onReject"
            >
              <a-button :loading="uploading">
                <template #icon><ImagePlus :size="14" /></template>
                {{
                  uploading
                    ? UPLOADING_TITLE
                    : form.uploadedImage
                      ? `已选：${form.uploadedImage.fileName}（点此更换）`
                      : '选择图片'
                }}
              </a-button>
            </a-upload>
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
            <a-textarea
              id="machine-section-note-2"
              v-model:value="form.note"
              :rows="2"
              :maxlength="200"
              show-count
            />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    <template #footer>
      <a-button @click="cancel">取消</a-button>
      <a-button type="primary" :disabled="uploading" @click="save">
        保存
      </a-button>
    </template>
  </a-modal>
</template>

<style scoped src="./MachineRowDialog.css"></style>
