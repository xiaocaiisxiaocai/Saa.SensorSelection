<script lang="ts" setup>
import type { ControlledFileItem } from '../data.js';

import { computed, ref, watch } from 'vue';

import {
  ElButton,
  ElDialog,
  ElEmpty,
  ElMessage,
  ElMessageBox,
  ElTooltip,
} from 'element-plus';
import {
  Eye,
  FileText,
  FileType,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next';

import {
  CONTROLLED_FILE_ACCEPT,
  detectControlledFileKind,
  formatLocalDate,
  formatLocalDateTime,
  validateControlledUpload,
} from '../domain.js';
import { useSelectionStore } from '../store';
import PdfPreviewViewer from './PdfPreviewViewer.vue';

const props = defineProps<{ entityName: string }>();

const store = useSelectionStore();
const query = ref('');
const previewOpen = ref(false);
const previewTitle = ref('');
const previewDataUrl = ref('');
const previewWatermark = ref('Symtek · 仅供内部预览');
const uploadInputId = computed(() =>
  `controlled-upload-${props.entityName}`.replaceAll(/\s+/g, '-'),
);

const files = computed(() => store.controlledDocuments(props.entityName));

const visibleFiles = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  if (!value) return files.value;
  return files.value.filter((file) => fileMatchesQuery(file, value));
});

watch(
  () => props.entityName,
  () => {
    query.value = '';
    closePreview();
  },
);

function fileMatchesQuery(file: ControlledFileItem, value: string) {
  const haystack = [file.fileName, file.kind, file.uploadedAt]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('zh-CN');
  return haystack.includes(value);
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind: ControlledFileItem['kind']) {
  return kind === 'pdf' ? 'PDF' : 'Word';
}

function failureMessage(reason: string) {
  if (reason === 'storage') return '浏览器本地存储不可用，文件未保存';
  if (reason === 'size') return '文件大小超出 8 MB 限制';
  if (reason === 'type') return '仅支持 PDF 或 Word 文档';
  if (reason === 'stale') return '文件不存在或已被删除';
  return '文件无效，请重新选择';
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(new Error('read failed')));
    reader.readAsDataURL(file);
  });
}

function triggerUpload() {
  document
    .querySelector<HTMLInputElement>(`#${CSS.escape(uploadInputId.value)}`)
    ?.click();
}

async function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  const kind = detectControlledFileKind(file.name, file.type);
  if (!kind) {
    ElMessage.error(failureMessage('type'));
    return;
  }

  const check = validateControlledUpload(kind, file.name, file.type, file.size);
  if (!check.ok) {
    ElMessage.error(failureMessage(check.reason));
    return;
  }

  let dataUrl = '';
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    ElMessage.error('文件读取失败，请重试');
    return;
  }

  const result = store.saveControlledFile(props.entityName, {
    dataUrl,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    uploadedAt: formatLocalDate(new Date()),
  });
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  ElMessage.success(`${kindLabel(kind)} 文档已上传`);
}

function openPreview(file: ControlledFileItem) {
  previewTitle.value = file.fileName;
  previewDataUrl.value = file.dataUrl;
  previewWatermark.value = `Symtek · ${props.entityName} · 仅供内部预览\n${formatLocalDateTime(new Date())}`;
  previewOpen.value = true;
}

function closePreview() {
  previewOpen.value = false;
  previewTitle.value = '';
  previewDataUrl.value = '';
  previewWatermark.value = 'Symtek · 仅供内部预览';
}

async function removeAttachment(file: ControlledFileItem) {
  try {
    await ElMessageBox.confirm(`确认删除「${file.fileName}」吗？`, '删除文档', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    });
  } catch {
    return;
  }
  const result = store.deleteControlledFile(props.entityName, file.id);
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  ElMessage.success('文档已删除');
}
</script>

<template>
  <section class="controlled-files-section">
    <div class="data-section__toolbar">
      <span>
        {{
          query.trim()
            ? `匹配 ${visibleFiles.length} / 共 ${files.length} 份`
            : files.length > 0
              ? `${files.length} 份文档`
              : '暂无文档'
        }}
      </span>
      <div class="controlled-files-section__actions">
        <input
          :id="uploadInputId"
          :accept="CONTROLLED_FILE_ACCEPT"
          hidden
          type="file"
          @change="handleUpload"
        />
        <ElButton type="primary" @click="triggerUpload">
          <Upload :size="15" aria-hidden="true" />
          上传文档
        </ElButton>
        <label class="tab-search">
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="query"
            aria-label="搜索文档"
            placeholder="搜索文件名"
            type="search"
          />
          <button
            v-if="query"
            aria-label="清除搜索"
            class="icon-button"
            title="清除搜索"
            type="button"
            @click="query = ''"
          >
            <X :size="15" aria-hidden="true" />
          </button>
        </label>
      </div>
    </div>

    <div v-if="visibleFiles.length > 0" class="controlled-file-list">
      <article
        v-for="file in visibleFiles"
        :key="file.id"
        class="controlled-file-item"
      >
        <div class="controlled-file-item__icon">
          <FileText v-if="file.kind === 'pdf'" :size="20" aria-hidden="true" />
          <FileType v-else :size="20" aria-hidden="true" />
        </div>
        <div class="controlled-file-item__body">
          <strong>{{ file.fileName }}</strong>
          <span>
            {{ formatSize(file.size) }}
            <template v-if="file.uploadedAt"> · {{ file.uploadedAt }}</template>
          </span>
        </div>
        <div class="controlled-file-item__actions">
          <ElTooltip
            v-if="file.kind === 'pdf'"
            content="预览 PDF"
            placement="top"
          >
            <ElButton aria-label="预览 PDF" circle @click="openPreview(file)">
              <Eye :size="15" aria-hidden="true" />
            </ElButton>
          </ElTooltip>
          <ElTooltip content="删除" placement="top">
            <ElButton
              aria-label="删除文档"
              circle
              type="danger"
              @click="removeAttachment(file)"
            >
              <Trash2 :size="15" aria-hidden="true" />
            </ElButton>
          </ElTooltip>
        </div>
      </article>
    </div>
    <ElEmpty
      v-else
      :description="
        query.trim() ? '没有匹配的文档' : '暂无文档，点击上传添加 PDF 或 Word'
      "
      :image-size="72"
    />

    <ElDialog
      v-model="previewOpen"
      :title="previewTitle"
      align-center
      class="controlled-preview-dialog"
      destroy-on-close
      width="94%"
      @closed="closePreview"
    >
      <PdfPreviewViewer
        v-if="previewDataUrl"
        :data-url="previewDataUrl"
        :watermark="previewWatermark"
      />
    </ElDialog>
  </section>
</template>
