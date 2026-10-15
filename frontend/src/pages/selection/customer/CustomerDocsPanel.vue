<script setup lang="ts">
import { Download, Eye, Inbox, Search, Trash2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import {
  CONTROLLED_FILE_RULES,
  type ControlledFileItem,
  detectControlledFileKind,
  formatLocalDateTime,
} from '@/domain';
import { combineFileRules, createFilePicker } from '@/pages/shared/file-rules';
import {
  fileIdFromReference,
  formatFileSize,
  uploadFile,
  useFileDownload,
} from '@/pages/shared/files';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { UPLOADING_TITLE, useUploadLock } from '@/pages/shared/upload-lock';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { APdfViewer } from '@/ui';
import { useTablePagination } from '@/pages/shared/table';

const props = defineProps<{ entityName: string }>();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const { canDownload, downloadStoredFile } = useFileDownload();
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

const pickerRule = combineFileRules(
  CONTROLLED_FILE_RULES.pdf,
  CONTROLLED_FILE_RULES.word,
);
const picker = createFilePicker(
  {
    ...pickerRule,
    sizeMessage: '文件大小超出限制',
    typeMessage: '文件类型不受支持',
  },
  onFiles,
);

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
    notifyResult(result, '文件已上传', {
      size: '文件大小超出限制',
      type: '文件类型不受支持',
    });
  }
}

async function remove(item: ControlledFileItem) {
  const ok = await confirmDelete('删除文件', `确认删除“${item.fileName}”吗？`);
  if (!ok) return;
  notifyResult(
    store.deleteControlledFile(props.entityName, item.id),
    '文件已删除',
  );
}

// 列表分页：分页条固定在底部、始终显示；筛选变化回到第一页
const { listPagination } = useTablePagination(
  () => visible.value.length,
  [query],
);
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <a-input
        v-model:value="query"
        class="selection-toolbar__filter"
        placeholder="搜索文件名"
        aria-label="搜索客户文件"
        allow-clear
      >
        <template #prefix><Search :size="14" /></template>
      </a-input>
    </div>
    <a-upload-dragger
      v-if="writable"
      :accept="pickerRule.accept"
      :before-upload="picker.beforeUpload"
      :disabled="uploading"
      multiple
      :show-upload-list="false"
      @reject="picker.onReject"
    >
      <p class="ant-upload-drag-icon"><Inbox :size="40" /></p>
      <p class="ant-upload-text">
        {{ uploading ? UPLOADING_TITLE : '点击或将文件拖到此处上传' }}
      </p>
      <p class="ant-upload-hint">支持 PDF 与 Word，各不超过 8 MB</p>
    </a-upload-dragger>
    <a-list
      v-if="visible.length"
      class="file-list"
      :data-source="visible"
      :pagination="listPagination"
      bordered
    >
      <template #renderItem="{ item }">
        <a-list-item>
          <!-- 一行显示：名称在前，大小和上传时间用次要文字跟在后面 -->
          <div class="file-list__line">
            <span class="file-list__name">{{ item.fileName }}</span>
            <span class="file-list__meta">
              {{ formatFileSize(item.size) }} ·
              {{ formatLocalDateTime(new Date(item.uploadedAt)) }}
            </span>
          </div>
          <template #actions>
            <a-tooltip v-if="item.kind === 'pdf'" title="预览">
              <a-button
                type="text"
                size="small"
                aria-label="预览"
                @click="preview = item"
              >
                <template #icon><Eye :size="14" /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip
              v-if="canDownload"
              :title="fileIdFromReference(item.dataUrl) ? '下载' : '该文件无法下载'"
            >
              <a-button
                type="text"
                size="small"
                aria-label="下载"
                :disabled="!fileIdFromReference(item.dataUrl)"
                @click="downloadStoredFile(item.dataUrl, item.fileName)"
              >
                <template #icon><Download :size="14" /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip v-if="writable" title="删除">
              <a-button
                type="text"
                size="small"
                danger
                aria-label="删除"
                @click="remove(item)"
              >
                <template #icon><Trash2 :size="14" /></template>
              </a-button>
            </a-tooltip>
          </template>
        </a-list-item>
      </template>
    </a-list>
    <a-empty
      v-else
      :description="
        query.trim()
          ? '暂无感应器选用标准文件：没有匹配的文件'
          : writable
            ? '暂无感应器选用标准文件，拖入文件或点击上方区域上传'
            : '暂无感应器选用标准文件'
      "
    />
    <a-modal
      :open="Boolean(preview)"
      :title="'预览 PDF'"
      width="calc(100vw - 48px)"
      wrap-class-name="pdf-preview-modal"
      :footer="null"
      destroy-on-close
      @cancel="preview = null"
    >
      <APdfViewer
        v-if="preview"
        class="a-pdf-viewer--large"
        :src="preview.dataUrl"
      />
    </a-modal>
  </div>
</template>
