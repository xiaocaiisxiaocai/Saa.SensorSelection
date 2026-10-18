<script setup lang="ts">
import { Download, Eye, Inbox, Search, Trash2 } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import {
  CONTROLLED_FILE_RULES,
  formatLocalDateTime,
  type SensorSopItem,
} from '@/domain';
import { createFilePicker } from '@/pages/shared/file-rules';
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
import { AHighlightText, APdfViewer } from '@/ui';
import { useTablePagination } from '@/pages/shared/table';

const props = defineProps<{ focusSopId?: null | number }>();
const emit = defineEmits<{ previewed: [id: number] }>();

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const { canDownload, downloadStoredFile } = useFileDownload();
const query = ref('');
const preview = ref<SensorSopItem | null>(null);
const { uploading, runUpload } = useUploadLock();

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

// 列表分页：分页条固定在底部、始终显示；筛选变化回到第一页
const { listPagination, showIndex } = useTablePagination(
  () => visible.value.length,
  [query],
);

watch(
  () => props.focusSopId,
  (id) => {
    if (!id) return;
    const file = files.value.find((item) => item.id === id);
    if (file) openPreview(file);
    // 被定位的文件可能不在当前页
    showIndex(visible.value.findIndex((item) => item.id === id));
  },
  { immediate: true },
);

function openPreview(file: SensorSopItem) {
  preview.value = file;
  emit('previewed', file.id);
}

// 上传中锁：同一时间只处理一批文件，期间上传区禁用。
function onFiles(picked: File[]) {
  return runUpload(() => uploadPicked(picked));
}

const picker = createFilePicker(
  {
    ...CONTROLLED_FILE_RULES.pdf,
    sizeMessage: '文件大小超出 8 MB 限制',
    typeMessage: '仅支持 PDF 文档',
  },
  onFiles,
);

async function uploadPicked(picked: File[]) {
  for (const file of picked) {
    const dataUrl = await uploadFile(file);
    if (!dataUrl) continue;
    const result = store.saveSensorSop({
      dataUrl,
      fileName: file.name,
      mimeType: file.type || 'application/pdf',
      size: file.size,
      title: file.name.replace(/\.pdf$/i, ''),
      uploadedAt: new Date().toISOString(),
    });
    notifyResult(result, '型录已上传', {
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
  notifyResult(result, '型录已删除', {
    'in-use': '仍有型号关联该型录，请先取消关联后再删除',
  });
  if (preview.value?.id === item.id) preview.value = null;
}
</script>

<template>
  <div class="selection-panel">
    <!-- 一个文件都没有时没什么可搜的，搜索框只会占位 -->
    <div v-if="files.length > 0" class="selection-toolbar">
      <a-input
        v-model:value="query"
        class="selection-toolbar__filter"
        placeholder="搜索标题或文件名"
        aria-label="搜索型录文件"
        allow-clear
      >
        <template #prefix><Search :size="14" /></template>
      </a-input>
    </div>
    <a-upload-dragger
      v-if="writable"
      :accept="CONTROLLED_FILE_RULES.pdf.accept"
      :before-upload="picker.beforeUpload"
      :disabled="uploading"
      :show-upload-list="false"
      @reject="picker.onReject"
    >
      <p class="ant-upload-drag-icon"><Inbox :size="40" /></p>
      <p class="ant-upload-text">
        {{ uploading ? UPLOADING_TITLE : '点击或将文件拖到此处上传' }}
      </p>
      <p class="ant-upload-hint">仅支持 PDF，不超过 8 MB</p>
    </a-upload-dragger>
    <a-list
      v-if="visible.length"
      class="file-list"
      :data-source="visible"
      :pagination="listPagination"
      bordered
    >
      <template #renderItem="{ item }">
        <a-list-item
          :class="{ 'file-list__item--focus': item.id === focusSopId }"
        >
          <!-- 一行显示：名称在前，大小和上传时间用次要文字跟在后面 -->
          <div class="file-list__line">
            <span class="file-list__name">
              <AHighlightText :text="item.title" :query="query" />
            </span>
            <span class="file-list__meta">
              <AHighlightText :text="item.fileName" :query="query" /> ·
              {{ formatFileSize(item.size) }} ·
              {{ formatLocalDateTime(new Date(item.uploadedAt)) }}
            </span>
          </div>
          <template #actions>
            <a-tooltip title="预览">
              <a-button
                type="text"
                size="small"
                aria-label="预览"
                @click="openPreview(item)"
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
    <!--
      可写用户看到的上传区本身就是空状态，再挂一句「拖入…上传」只是把同一
      句话说两遍。空状态只留给：搜不到匹配，或只读用户（没有上传区）。
    -->
    <a-empty
      v-else-if="query.trim()"
      description="没有匹配的型录文件，换个关键词或清空搜索框查看全部文件"
    />
    <a-empty v-else-if="!writable" description="暂无型录文件" />
    <a-modal
      :open="Boolean(preview)"
      :title="preview?.title || '预览 PDF'"
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
