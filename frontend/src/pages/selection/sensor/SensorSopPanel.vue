<script setup lang="ts">
import { Eye, Trash2 } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import {
  CONTROLLED_FILE_RULES,
  formatLocalDateTime,
  type SensorSopItem,
} from '@/domain';
import { formatFileSize, readDataUrl } from '@/pages/shared/files';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { AFileDrop, AIconButton, APdfViewer, ASearchField, ASheet } from '@/ui';

const props = defineProps<{ focusSopId?: null | number }>();
const emit = defineEmits<{ previewed: [id: number] }>();

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const query = ref('');
const preview = ref<SensorSopItem | null>(null);

const files = computed(() => store.sensorSops);
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
  () => props.focusSopId,
  (id) => {
    if (!id) return;
    const file = files.value.find((item) => item.id === id);
    if (file) openPreview(file);
  },
  { immediate: true },
);

function openPreview(file: SensorSopItem) {
  preview.value = file;
  emit('previewed', file.id);
}

async function onFiles(picked: File[]) {
  for (const file of picked) {
    const dataUrl = await readDataUrl(file);
    const result = store.saveSensorSop({
      dataUrl,
      fileName: file.name,
      mimeType: file.type || 'application/pdf',
      size: file.size,
      title: file.name.replace(/\.pdf$/i, ''),
      uploadedAt: new Date().toISOString(),
    });
    toastResult(result, '型录已上传', {
      size: '文件大小超出 8 MB 限制',
      type: '仅支持 PDF 文档',
      storage: '数据保存失败，文件未保存',
    });
  }
}

async function remove(item: SensorSopItem) {
  const ok = await confirmDelete('删除型录', `确认删除“${item.title}”吗？`);
  if (!ok) return;
  const result = store.deleteSensorSop(item.id);
  toastResult(result, '型录已删除', {
    'in-use': '仍有型号关联该型录，请先取消关联后再删除',
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
        placeholder="搜索标题或文件名"
      />
    </div>
    <AFileDrop
      v-if="writable"
      :accept="CONTROLLED_FILE_RULES.pdf.accept"
      :max-bytes="CONTROLLED_FILE_RULES.pdf.maxBytes"
      :extensions="[...CONTROLLED_FILE_RULES.pdf.extensions]"
      :mime-types="[...CONTROLLED_FILE_RULES.pdf.mimeTypes]"
      hint="仅支持 PDF，不超过 8 MB"
      size-message="文件大小超出 8 MB 限制"
      type-message="仅支持 PDF 文档"
      @files="onFiles"
    />
    <ul v-if="visible.length" class="docs-list">
      <li
        v-for="item in visible"
        :key="item.id"
        :class="{ 'docs-list--focus': item.id === focusSopId }"
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
    <p v-else class="docs-empty">暂无型录文件</p>
    <ASheet
      :open="Boolean(preview)"
      :title="preview?.title || '预览 PDF'"
      viewport
      @update:open="(open) => { if (!open) preview = null }"
    >
      <APdfViewer
        v-if="preview"
        class="a-pdf-viewer--large"
        :src="preview.dataUrl"
      />
    </ASheet>
  </div>
</template>
