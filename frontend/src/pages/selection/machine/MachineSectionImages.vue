<script setup lang="ts">
import {
  ImagePlus,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
} from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { MACHINE_ROW_IMAGE_RULES } from '@/domain';
import { createFilePicker } from '@/pages/shared/file-rules';
import { uploadFile } from '@/pages/shared/files';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { UPLOADING_TITLE, useUploadLock } from '@/pages/shared/upload-lock';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

/**
 * 结构分区右侧的示意图栏（最多 2 张）。中等宽度桌面默认折叠，
 * 用户手动展开/折叠过之后就不再跟随窗口宽度。折叠状态用 v-model 交给父组件排版。
 */
const props = defineProps<{
  sectionId: number;
  machineName: string;
  /** 分区里已有记录才允许加图 */
  hasContent: boolean;
}>();
const collapsed = defineModel<boolean>('collapsed', { required: true });

const COMPACT_IMAGES_MEDIA_QUERY = '(min-width: 960px) and (max-width: 1439px)';

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const { uploading, runUpload } = useUploadLock();
const touched = ref(false);
let compactMedia: MediaQueryList | null = null;

const images = computed(() =>
  store.machineSectionImages(props.sectionId, props.machineName),
);
const toggleLabel = computed(() =>
  collapsed.value ? '展开结构示意图' : '折叠结构示意图',
);

function followMedia(matches: boolean) {
  if (!touched.value) collapsed.value = matches;
}

function onCompactChange(event: MediaQueryListEvent) {
  followMedia(event.matches);
}

function toggle() {
  touched.value = true;
  collapsed.value = !collapsed.value;
}

onMounted(() => {
  compactMedia = window.matchMedia?.(COMPACT_IMAGES_MEDIA_QUERY) ?? null;
  if (!compactMedia) return;
  followMedia(compactMedia.matches);
  compactMedia.addEventListener('change', onCompactChange);
});

onBeforeUnmount(() => {
  compactMedia?.removeEventListener('change', onCompactChange);
});

// 上传中锁：两次拖放并发时都会基于同一份旧图片列表，后完成的会覆盖先完成的。
const imagePicker = createFilePicker(
  {
    ...MACHINE_ROW_IMAGE_RULES,
    sizeMessage: '图片大小不能超过 2 MB',
    typeMessage: '仅支持 JPG、PNG 或 WebP 图片',
  },
  (files: File[]) => runUpload(() => uploadImages(files)),
);

async function uploadImages(files: File[]) {
  // 上传是异步的，途中可能切换到别的机型/分区；目标分区和基础图片列表必须在
  // 第一次 await 之前记下，否则会把图片写进切换后的分区。
  const { sectionId, machineName } = props;
  const base = [...images.value];
  const next = [...base];
  for (const file of files) {
    if (next.length >= 2) break;
    const dataUrl = await uploadFile(file);
    if (!dataUrl) continue;
    next.push({
      dataUrl,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    });
  }
  // 全部上传失败时已逐个提示，不再提交一次没有变化的保存。
  if (next.length === base.length) return;
  notifyResult(
    store.saveMachineSectionImages(sectionId, machineName, next),
    '示意图已更新',
    {
      size: '图片大小不能超过 2 MB',
      type: '仅支持 JPG、PNG 或 WebP 图片',
    },
  );
}

async function removeImage(index: number) {
  const item = images.value[index];
  if (!item) return;
  const ok = await confirmDelete(
    '删除示意图',
    `确认删除“${item.fileName}”吗？`,
  );
  if (!ok) return;
  const next = images.value.filter((_, current) => current !== index);
  notifyResult(
    store.saveMachineSectionImages(props.sectionId, props.machineName, next),
    '示意图已删除',
  );
}
</script>

<template>
  <aside
    class="machine-images"
    :class="{ 'machine-images--collapsed': collapsed }"
  >
    <div class="machine-images__header">
      <h3 v-if="!collapsed">结构示意图</h3>
      <a-tooltip :title="toggleLabel">
        <a-button
          type="text"
          size="small"
          :aria-label="toggleLabel"
          @click="toggle"
        >
          <template #icon>
            <component
              :is="collapsed ? PanelRightOpen : PanelRightClose"
              :size="14"
            />
          </template>
        </a-button>
      </a-tooltip>
    </div>
    <a-upload-dragger
      v-if="!collapsed && writable && hasContent && images.length < 2"
      :accept="MACHINE_ROW_IMAGE_RULES.accept"
      :before-upload="imagePicker.beforeUpload"
      :disabled="uploading"
      :show-upload-list="false"
      multiple
      @reject="imagePicker.onReject"
    >
      <p class="ant-upload-drag-icon"><ImagePlus :size="28" /></p>
      <p class="ant-upload-text">
        {{ uploading ? UPLOADING_TITLE : '添加图片' }}
      </p>
    </a-upload-dragger>
    <p
      v-else-if="!collapsed && writable && !hasContent"
      class="machine-images__empty"
    >
      请先新增内容后再添加图片
    </p>
    <a-image-preview-group v-if="!collapsed">
      <a-card
        v-for="(image, index) in images"
        :key="`${image.fileName}-${index}`"
        class="image-card"
        size="small"
        :body-style="{ padding: 0 }"
      >
        <a-image
          class="image-card__media"
          :src="image.dataUrl"
          :alt="image.fileName"
          width="100%"
        />
        <div class="image-card__name">{{ image.fileName }}</div>
        <template v-if="writable" #actions>
          <a-tooltip :title="`删除 ${image.fileName}`">
            <a-button
              type="text"
              size="small"
              danger
              :aria-label="`删除 ${image.fileName}`"
              @click="removeImage(index)"
            >
              <template #icon><Trash2 :size="14" /></template>
            </a-button>
          </a-tooltip>
        </template>
      </a-card>
    </a-image-preview-group>
  </aside>
</template>

<style scoped src="./MachineSectionImages.css"></style>
