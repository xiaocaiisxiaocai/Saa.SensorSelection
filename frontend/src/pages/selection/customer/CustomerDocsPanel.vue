<script setup lang="ts">
import { Eye, Trash2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import {
  CONTROLLED_FILE_RULES,
  type ControlledFileItem,
  detectControlledFileKind,
  formatLocalDateTime,
} from '@/domain';
import { formatFileSize, uploadFile } from '@/pages/shared/files';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { UPLOADING_TITLE, useUploadLock } from '@/pages/shared/upload-lock';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import {
  AEmptyState,
  AFileDrop,
  AIconButton,
  APdfViewer,
  ASearchField,
  ASheet,
} from '@/ui';

const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const query = ref('');
const preview = ref<ControlledFileItem | null>(null);
const { uploading, runUpload } = useUploadLock();

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

// 上传中锁：同一时间只处理一批文件，期间上传区禁用。
function onFiles(picked: File[]) {
  return runUpload(() => uploadPicked(picked));
}

async function uploadPicked(picked: File[]) {
  // 上传是异步的，途中可能切换到别的客户；先记下发起上传时的客户，
  // 避免把文件挂到切换后的客户名下。
  const entityName = props.entityName;
  for (const file of picked) {
    const kind = detectControlledFileKind(file.name, file.type);
    if (!kind) {
      continue;
    }
    const dataUrl = await uploadFile(file);
    if (!dataUrl) continue;
    const result = store.saveControlledFile(entityName, {
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
      :disabled="uploading"
      :title="uploading ? UPLOADING_TITLE : undefined"
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
    <AEmptyState
      v-else
      title="暂无感应器选用标准文件"
      :description="
        query.trim() ? '没有匹配的文件' : writable ? '拖入文件或点击上方区域上传' : undefined
      "
    />
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
  padding: var(--space-3) var(--space-4);

  /* 白底描边卡片：原来的 --fill-2 灰底在白色内容区上像整行被禁用 */
  background: var(--bg-content);
  border: 1px solid var(--separator-opaque);
  border-radius: var(--radius-md);
  transition: background-color var(--dur-1) var(--ease-out);
}

.docs-list li:hover {
  background: var(--fill-4);
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
