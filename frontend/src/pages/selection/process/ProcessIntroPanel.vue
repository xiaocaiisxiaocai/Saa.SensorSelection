<script setup lang="ts">
import { Eye, Trash2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import {
  CONTROLLED_FILE_RULES,
  PROCESS_INTRO_FILE_KINDS,
  type ControlledFileItem,
  detectControlledFileKind,
  formatLocalDateTime,
} from '@/domain';
import { formatFileSize, readDataUrl } from '@/pages/shared/files';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { AFileDrop, AIconButton, APdfViewer, ASearchField, ASheet } from '@/ui';

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const query = ref('');
const preview = ref<ControlledFileItem | null>(null);

const files = computed(() => store.processIntroFiles);
const visible = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return files.value.filter(
    (item) =>
      !value ||
      [item.fileName, item.kind]
        .join(' ')
        .toLocaleLowerCase('zh-CN')
        .includes(value),
  );
});

async function onFiles(picked: File[]) {
  for (const file of picked) {
    const kind = detectControlledFileKind(
      file.name,
      file.type,
      PROCESS_INTRO_FILE_KINDS,
    );
    if (!kind) {
      continue;
    }
    const dataUrl = await readDataUrl(file);
    const result = store.saveProcessIntroFile({
      dataUrl,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    });
    toastResult(result, '文件已上传', {
      size: '文件大小超出限制',
      type: '文件类型不受支持',
    });
  }
}

async function remove(item: ControlledFileItem) {
  const ok = await confirmDelete('删除文件', `确认删除“${item.fileName}”吗？`);
  if (!ok) return;
  toastResult(store.deleteProcessIntroFile(item.id), '文件已删除');
  if (preview.value?.id === item.id) preview.value = null;
}
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <ASearchField
        v-model="query"
        class="selection-toolbar__filter"
        placeholder="搜索文件名"
        aria-label="搜索制程文件"
      />
    </div>
    <AFileDrop
      v-if="writable"
      :accept="`${CONTROLLED_FILE_RULES.pdf.accept},${CONTROLLED_FILE_RULES.word.accept},${CONTROLLED_FILE_RULES.ppt.accept}`"
      :max-bytes="CONTROLLED_FILE_RULES.pdf.maxBytes"
      :extensions="[
        ...CONTROLLED_FILE_RULES.pdf.extensions,
        ...CONTROLLED_FILE_RULES.word.extensions,
        ...CONTROLLED_FILE_RULES.ppt.extensions,
      ]"
      :mime-types="[
        ...CONTROLLED_FILE_RULES.pdf.mimeTypes,
        ...CONTROLLED_FILE_RULES.word.mimeTypes,
        ...CONTROLLED_FILE_RULES.ppt.mimeTypes,
      ]"
      multiple
      hint="支持 PDF、Word 与 PPT，各不超过 8 MB"
      size-message="文件大小超出限制"
      type-message="文件类型不受支持"
      @files="onFiles"
    />
    <ul v-if="visible.length" class="docs-list">
      <li v-for="item in visible" :key="item.id">
        <div>
          <strong>{{ item.fileName }}</strong>
          <p>
            {{ formatFileSize(item.size) }} ·
            {{ formatLocalDateTime(new Date(item.uploadedAt)) }}
          </p>
        </div>
        <div class="table-actions">
          <AIconButton
            v-if="item.kind === 'pdf'"
            :icon="Eye"
            label="预览"
            size="small"
            @click="preview = item"
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
    <ASheet
      :open="Boolean(preview)"
      title="预览 PDF"
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
