<script setup lang="ts">
import { message } from 'ant-design-vue';
import { ImagePlus, X } from 'lucide-vue-next';
import { computed } from 'vue';

import {
  MACHINE_ROW_IMAGE_RULES,
  SENSOR_IMAGE_LIMIT,
  type MachineRowImage,
} from '@/domain';
import { createFilePicker } from '@/pages/shared/file-rules';
import { uploadFile } from '@/pages/shared/files';
import { confirmDelete } from '@/pages/shared/save-feedback';
import { UPLOADING_TITLE, useUploadLock } from '@/pages/shared/upload-lock';

/**
 * 型号图片的缩略图和增删。表格格子只读看图，新增 / 编辑弹窗里可点选或拖入图片。
 * 选中的文件先上传，再把完整列表交给外面保存；这里不直接写仓库。
 */
const props = defineProps<{
  images: readonly MachineRowImage[];
  writable: boolean;
  /** 表格里用小图 */
  compact?: boolean;
  inputId?: string;
}>();

const emit = defineEmits<{
  'update:images': [images: MachineRowImage[]];
}>();

const SIZE_MESSAGE = '图片大小不能超过 2 MB';
const TYPE_MESSAGE = '仅支持 JPG、PNG 或 WebP 图片';
const LIMIT_MESSAGE = `最多 ${SENSOR_IMAGE_LIMIT} 张图片`;
const RULE_HINT = `JPG、PNG 或 WebP，单张不超过 2 MB，最多 ${SENSOR_IMAGE_LIMIT} 张`;

const { uploading, runUpload } = useUploadLock();
const atLimit = computed(() => props.images.length >= SENSOR_IMAGE_LIMIT);
const thumb = computed(() => (props.compact ? 48 : 72));
const addTitle = computed(() => {
  if (uploading.value) return UPLOADING_TITLE;
  if (atLimit.value) return LIMIT_MESSAGE;
  return '点击或将图片拖到此处上传';
});

const picker = createFilePicker(
  {
    ...MACHINE_ROW_IMAGE_RULES,
    sizeMessage: SIZE_MESSAGE,
    typeMessage: TYPE_MESSAGE,
  },
  (files: File[]) => runUpload(() => add(files)),
);

async function add(files: File[]) {
  const existing = [...props.images];
  const room = SENSOR_IMAGE_LIMIT - existing.length;
  if (room <= 0) {
    message.warning(LIMIT_MESSAGE);
    return;
  }
  const batch = files.slice(0, room);
  if (files.length > room) {
    message.warning(
      `${LIMIT_MESSAGE}，已忽略多出的 ${files.length - room} 张`,
    );
  }
  const uploaded: MachineRowImage[] = [];
  for (const file of batch) {
    const dataUrl = await uploadFile(file);
    if (!dataUrl) continue;
    uploaded.push({
      dataUrl,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    });
  }
  if (uploaded.length === 0) return;
  emit('update:images', [...existing, ...uploaded]);
}

async function remove(index: number) {
  const image = props.images[index];
  if (!image || uploading.value) return;
  const ok = await confirmDelete('删除图片', `确认删除“${image.fileName}”吗？`);
  if (!ok) return;
  const current = props.images;
  if (current[index]?.dataUrl !== image.dataUrl) return;
  emit(
    'update:images',
    current.filter((_, itemIndex) => itemIndex !== index),
  );
}
</script>

<template>
  <div
    class="sensor-images"
    :class="{ 'sensor-images--form': !compact }"
    @click.stop
  >
    <a-image-preview-group v-if="images.length">
      <div class="sensor-images__list">
        <div
          v-for="(image, index) in images"
          :key="`${image.dataUrl}-${index}`"
          class="sensor-images__item"
          :title="image.fileName"
        >
          <a-image
            class="sensor-images__media"
            :src="image.dataUrl"
            :alt="image.fileName"
            :width="thumb"
            :height="thumb"
          />
          <a-tooltip v-if="writable" title="删除图片">
            <a-button
              class="sensor-images__remove"
              type="text"
              size="small"
              danger
              :aria-label="`删除图片 ${image.fileName}`"
              :disabled="uploading"
              @click="remove(index)"
            >
              <template #icon><X :size="12" /></template>
            </a-button>
          </a-tooltip>
        </div>
      </div>
    </a-image-preview-group>
    <span v-else-if="!writable">—</span>
    <a-upload-dragger
      v-if="writable"
      :id="inputId"
      class="sensor-images__drop"
      :accept="MACHINE_ROW_IMAGE_RULES.accept"
      :before-upload="picker.beforeUpload"
      :disabled="uploading || atLimit"
      multiple
      :show-upload-list="false"
      @reject="picker.onReject"
    >
      <p class="ant-upload-drag-icon"><ImagePlus :size="24" /></p>
      <p class="ant-upload-text">{{ addTitle }}</p>
      <p class="ant-upload-hint">{{ RULE_HINT }}</p>
    </a-upload-dragger>
  </div>
</template>

<style scoped src="./SensorImageEditor.css"></style>
