<script setup lang="ts">
import { Eye, Trash2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import {
  CONTROLLED_FILE_RULES,
  type ControlledFileItem,
  detectControlledFileKind,
  formatLocalDateTime,
} from '@/domain';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { AFileDrop, AIconButton, APdfViewer, ASearchField, ASheet } from '@/ui';

const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const query = ref('');
const preview = ref<ControlledFileItem | null>(null);

const files = computed(() => store.controlledDocuments(props.entityName));
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
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function onFiles(picked: File[]) {
  for (const file of picked) {
    const kind = detectControlledFileKind(file.name, file.type);
    if (!kind) {
      continue;
    }
    const dataUrl = await readDataUrl(file);
    const result = store.saveControlledFile(props.entityName, {
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
  toastResult(
    store.deleteControlledFile(props.entityName, item.id),
    '文件已删除',
  );
}
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <ASearchField
        v-model="query"
        class="selection-toolbar__filter"
        placeholder="搜索文件名"
        aria-label="搜索客户文件"
      />
    </div>
    <AFileDrop
      v-if="writable"
      :accept="`${CONTROLLED_FILE_RULES.pdf.accept},${CONTROLLED_FILE_RULES.word.accept}`"
      :max-bytes="CONTROLLED_FILE_RULES.pdf.maxBytes"
      :extensions="[
        ...CONTROLLED_FILE_RULES.pdf.extensions,
        ...CONTROLLED_FILE_RULES.word.extensions,
      ]"
      :mime-types="[
        ...CONTROLLED_FILE_RULES.pdf.mimeTypes,
        ...CONTROLLED_FILE_RULES.word.mimeTypes,
      ]"
      multiple
      hint="支持 PDF 与 Word，各不超过 8 MB"
      size-message="文件大小超出限制"
      type-message="文件类型不受支持"
      @files="onFiles"
    />
    <ul v-if="visible.length" class="docs-list">
      <li v-for="item in visible" :key="item.id">
        <div>
          <strong>{{ item.fileName }}</strong>
          <p>
            {{ formatSize(item.size) }} ·
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

<style scoped>
.docs-list {
  display: grid;
  gap: var(--space-2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.docs-list li {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3);
  background: var(--fill-2);
  border-radius: var(--radius-md);
}

.docs-list p {
  margin: 0;
  font: var(--text-caption);
  color: var(--label-2);
}

.docs-list strong {
  font: var(--text-control-em);
}
</style>
