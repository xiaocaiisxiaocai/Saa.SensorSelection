<script lang="ts" setup>
import type { SensorSopItem } from '../data.js';

import { computed, ref, watch } from 'vue';

import {
  ElButton,
  ElDialog,
  ElEmpty,
  ElMessage,
  ElMessageBox,
  ElTooltip,
} from 'element-plus';
import { Eye, FileText, Search, Trash2, Upload, X } from 'lucide-vue-next';

import {
  CONTROLLED_FILE_RULES,
  detectControlledFileKind,
  formatLocalDate,
  formatLocalDateTime,
  validateControlledUpload,
} from '../domain.js';
import { useSelectionStore } from '../store';
import PdfPreviewViewer from './PdfPreviewViewer.vue';

const props = defineProps<{
  focusSopId?: null | number;
}>();

const emit = defineEmits<{
  previewed: [id: number];
}>();

const store = useSelectionStore();
const query = ref('');
const previewOpen = ref(false);
const previewTitle = ref('');
const previewDataUrl = ref('');
const previewWatermark = ref('Symtek · Sensor SOP · 仅供内部预览');
const uploadInputId = 'sensor-sop-upload';

const files = computed(() => store.sensorSops);

const visibleFiles = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  if (!value) return files.value;
  return files.value.filter((file) =>
    [file.title, file.fileName]
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
);

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function failureMessage(reason: string) {
  if (reason === 'storage') return '浏览器本地存储不可用，文件未保存';
  if (reason === 'size') return '文件大小超出 8 MB 限制';
  if (reason === 'type') return '仅支持 PDF 文档';
  if (reason === 'stale') return '文件不存在或已被删除';
  if (reason === 'in-use') return '仍有型号关联该 SOP，请先取消关联后再删除';
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
    .querySelector<HTMLInputElement>(`#${CSS.escape(uploadInputId)}`)
    ?.click();
}

async function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  const kind = detectControlledFileKind(file.name, file.type);
  if (kind !== 'pdf') {
    ElMessage.error(failureMessage('type'));
    return;
  }

  const check = validateControlledUpload(
    'pdf',
    file.name,
    file.type,
    file.size,
  );
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

  const title = file.name.replace(/\.pdf$/i, '');
  const result = store.saveSensorSop({
    dataUrl,
    fileName: file.name,
    mimeType: file.type || 'application/pdf',
    size: file.size,
    title,
    uploadedAt: formatLocalDate(new Date()),
  });
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  ElMessage.success('SOP 已上传');
}

function openPreview(file: SensorSopItem) {
  previewTitle.value = file.title || file.fileName;
  previewDataUrl.value = file.dataUrl;
  previewWatermark.value = `Symtek · Sensor SOP · 仅供内部预览\n${formatLocalDateTime(new Date())}`;
  previewOpen.value = true;
  emit('previewed', file.id);
}

function closePreview() {
  previewOpen.value = false;
  previewTitle.value = '';
  previewDataUrl.value = '';
}

async function removeFile(file: SensorSopItem) {
  try {
    await ElMessageBox.confirm(`确认删除「${file.title}」吗？`, '删除 SOP', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    });
  } catch {
    return;
  }
  const result = store.deleteSensorSop(file.id);
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  ElMessage.success('SOP 已删除');
  if (previewOpen.value && previewTitle.value === file.title) {
    closePreview();
  }
}
</script>

<template>
  <section class="controlled-files-section sensor-sop-panel">
    <div class="data-section__toolbar">
      <span class="sensor-sop-panel__count">
        {{
          query.trim()
            ? `匹配 ${visibleFiles.length} / 共 ${files.length} 份`
            : files.length > 0
              ? `${files.length} 份 SOP`
              : '暂无 SOP，请上传 PDF'
        }}
      </span>
      <div class="controlled-files-section__actions">
        <label class="tab-search">
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="query"
            aria-label="搜索 SOP"
            placeholder="搜索标题或文件名"
            type="search"
          />
          <button
            v-if="query"
            aria-label="清除搜索"
            class="icon-button"
            type="button"
            @click="query = ''"
          >
            <X :size="15" aria-hidden="true" />
          </button>
        </label>
        <input
          :id="uploadInputId"
          :accept="CONTROLLED_FILE_RULES.pdf.accept"
          hidden
          type="file"
          @change="handleUpload"
        />
        <ElButton type="primary" @click="triggerUpload">
          <Upload :size="15" aria-hidden="true" />
          上传 PDF
        </ElButton>
      </div>
    </div>

    <div v-if="visibleFiles.length > 0" class="controlled-file-list">
      <article
        v-for="file in visibleFiles"
        :key="file.id"
        class="controlled-file-item"
      >
        <div aria-hidden="true" class="controlled-file-item__icon">
          <FileText :size="20" />
        </div>
        <div class="controlled-file-item__body">
          <strong>{{ file.title }}</strong>
          <span>
            {{ file.fileName }} · {{ formatSize(file.size) }}
            <template v-if="file.uploadedAt"> · {{ file.uploadedAt }}</template>
          </span>
        </div>
        <div class="controlled-file-item__actions">
          <ElTooltip content="预览" placement="top">
            <ElButton aria-label="预览 SOP" circle @click="openPreview(file)">
              <Eye :size="15" aria-hidden="true" />
            </ElButton>
          </ElTooltip>
          <ElTooltip content="删除" placement="top">
            <ElButton
              aria-label="删除 SOP"
              circle
              type="danger"
              @click="removeFile(file)"
            >
              <Trash2 :size="15" aria-hidden="true" />
            </ElButton>
          </ElTooltip>
        </div>
      </article>
    </div>
    <ElEmpty v-else :image-size="72" description="暂无 SOP PDF" />

    <ElDialog
      v-model="previewOpen"
      :title="previewTitle"
      class="controlled-preview-dialog"
      width="920px"
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
