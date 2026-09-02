<script setup lang="ts">
import { Download, Eye, Trash2 } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import {
  SENSOR_3D_FILE_RULES,
  formatLocalDateTime,
  type Sensor3dFileItem,
} from '@/domain';
import { formatFileSize, readDataUrl } from '@/pages/shared/files';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { AFileDrop, AIconButton, APdfViewer, ASearchField, ASheet } from '@/ui';
import { toast } from '@/ui/toast';

const props = defineProps<{ focusModel3dId?: null | number }>();
const emit = defineEmits<{ previewed: [id: number] }>();

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const query = ref('');
const preview = ref<Sensor3dFileItem | null>(null);

const files = computed(() => store.sensor3dFiles);

const visible = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  if (!value) return files.value;
  return files.value.filter((item) =>
    [item.title, item.fileName]
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(value),
  );
});

watch(
  () => props.focusModel3dId,
  (id) => {
    if (!id) return;
    const file = files.value.find((item) => item.id === id);
    if (file) openPreview(file);
  },
  { immediate: true },
);

function openPreview(file: Sensor3dFileItem) {
  preview.value = file;
  emit('previewed', file.id);
}

async function onFiles(picked: File[]) {
  for (const file of picked) {
    const dataUrl = await readDataUrl(file);
    const result = store.saveSensor3dFile({
      dataUrl,
      fileName: file.name,
      mimeType: file.type || 'application/pdf',
      size: file.size,
      title: file.name.replace(/\.pdf$/i, ''),
      uploadedAt: new Date().toISOString(),
    });
    toastResult(result, '3D 文件已上传', {
      size: '文件大小超出 8 MB 限制',
      type: '3D 文件暂仅支持 PDF',
      storage: '数据保存失败，文件未保存',
    });
  }
}

function download(item: Sensor3dFileItem) {
  const anchor = document.createElement('a');
  anchor.href = item.dataUrl;
  anchor.download = item.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  toast.success('3D 文件已开始下载');
}

async function remove(item: Sensor3dFileItem) {
  const ok = await confirmDelete('删除 3D 文件', `确认删除“${item.title}”吗？`);
  if (!ok) return;
  const result = store.deleteSensor3dFile(item.id);
  toastResult(result, '3D 文件已删除', {
    'in-use': '仍有型号关联该 3D 文件，请先取消关联后再删除',
  });
  if (preview.value?.id === item.id) preview.value = null;
}
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <ASearchField
        v-model="query"
        class="selection-toolbar__filter"
        placeholder="搜索 3D 标题或文件名"
        aria-label="搜索 3D 文件"
      />
    </div>
    <AFileDrop
      v-if="writable"
      :accept="SENSOR_3D_FILE_RULES.accept"
      :max-bytes="SENSOR_3D_FILE_RULES.maxBytes"
      :extensions="[...SENSOR_3D_FILE_RULES.extensions]"
      :mime-types="[...SENSOR_3D_FILE_RULES.mimeTypes]"
      hint="仅支持 PDF，不超过 8 MB"
      size-message="文件大小超出 8 MB 限制"
      type-message="3D 文件暂仅支持 PDF"
      @files="onFiles"
    />
    <ul v-if="visible.length" class="docs-list">
      <li
        v-for="item in visible"
        :key="item.id"
        :class="{ 'docs-list--focus': item.id === focusModel3dId }"
      >
        <div>
          <strong>{{ item.title }}</strong>
          <p>
            {{ item.fileName }} · {{ formatFileSize(item.size) }} ·
            {{ formatLocalDateTime(new Date(item.uploadedAt)) }}
          </p>
        </div>
        <div class="table-actions">
          <AIconButton
            :icon="Eye"
            label="预览"
            size="small"
            @click="openPreview(item)"
          />
          <AIconButton
            :icon="Download"
            label="下载"
            size="small"
            @click="download(item)"
          />
          <AIconButton
            v-if="writable"
            :icon="Trash2"
            label="删除"
            size="small"
            variant="destructive"
            @click="remove(item)"
          />
        </div>
      </li>
    </ul>
    <p v-else class="docs-empty">暂无 3D 文件</p>
    <ASheet
      :open="Boolean(preview)"
      :title="preview?.title || '预览 PDF'"
      viewport
      @update:open="
        (open) => {
          if (!open) preview = null;
        }
      "
    >
      <APdfViewer
        v-if="preview"
        class="a-pdf-viewer--large"
        :src="preview.dataUrl"
      />
    </ASheet>
  </div>
</template>
