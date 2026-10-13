<script setup lang="ts">
import { CopyPlus, ImagePlus, ImageUp, Trash2 } from 'lucide-vue-next';
import { computed } from 'vue';

import { MACHINE_ROW_IMAGE_RULES, type MachineSectionRow } from '@/domain';
import { createFilePicker } from '@/pages/shared/file-rules';
import { uploadFile } from '@/pages/shared/files';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { UPLOADING_TITLE, useUploadLock } from '@/pages/shared/upload-lock';
import { useSelectionStore } from '@/stores/selection';

/**
 * 表格「示意图」列的一格。相邻记录用同一张图时合并成一格，rows 是共用这张图的
 * 全部记录；换图、删除对这些记录一起生效。没有图、而紧挨在上面的记录有图时，
 * 可以直接「沿用上一笔的图」，和它合并成一格。整格吃掉点击，不触发整行编辑。
 */
const props = defineProps<{
  rows: readonly MachineSectionRow[];
  /** 紧挨在上面、带图的那条记录（没有则不提供「沿用」） */
  previousRow?: MachineSectionRow | null;
  sectionId: number;
  machineName: string;
  writable: boolean;
}>();

const store = useSelectionStore();
const { uploading, runUpload } = useUploadLock();
const image = computed(() => props.rows[0]?.image ?? null);
const isShared = computed(() => props.rows.length > 1);
const label = computed(() =>
  props.rows.map((row) => row.role || row.name).join('、'),
);

const SIZE_MESSAGE = '图片大小不能超过 2 MB';
const TYPE_MESSAGE = '仅支持 JPG、PNG 或 WebP 图片';

const picker = createFilePicker(
  {
    ...MACHINE_ROW_IMAGE_RULES,
    sizeMessage: SIZE_MESSAGE,
    typeMessage: TYPE_MESSAGE,
  },
  (files: File[]) => runUpload(() => replace(files[0])),
);

async function replace(file: File | undefined) {
  if (!file) return;
  // 上传途中可能切走：目标记录要在 await 之前记下
  const { sectionId, machineName } = props;
  const rowIds = props.rows.map((row) => row.id);
  const dataUrl = await uploadFile(file);
  if (!dataUrl) return;
  notifyResult(
    store.saveMachineRowsImage(sectionId, machineName, rowIds, {
      dataUrl,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    }),
    '示意图已更新',
    { size: SIZE_MESSAGE, type: TYPE_MESSAGE, stale: '记录已被删除，请刷新后重试' },
  );
}

function reusePrevious() {
  const image = props.previousRow?.image;
  if (!image) return;
  notifyResult(
    store.saveMachineRowsImage(
      props.sectionId,
      props.machineName,
      props.rows.map((row) => row.id),
      image,
    ),
    '已沿用上一笔的图',
    { stale: '记录已被删除，请刷新后重试' },
  );
}

async function remove() {
  if (!image.value) return;
  const shared = isShared.value
    ? `（${props.rows.length} 笔记录共用，会一起删除）`
    : '';
  const ok = await confirmDelete(
    '删除示意图',
    `确认删除“${image.value.fileName}”吗？${shared}`,
  );
  if (!ok) return;
  notifyResult(
    store.saveMachineRowsImage(
      props.sectionId,
      props.machineName,
      props.rows.map((row) => row.id),
      null,
    ),
    '示意图已删除',
    { stale: '记录已被删除，请刷新后重试' },
  );
}
</script>

<template>
  <div
    class="machine-row-image"
    :class="{ 'machine-row-image--filled': image }"
    @click.stop
  >
    <template v-if="image">
      <div class="machine-row-image__frame" :title="image.fileName">
        <a-image
          class="machine-row-image__media"
          :src="image.dataUrl"
          :alt="image.fileName"
          width="100%"
        />
      </div>
      <a-space v-if="writable" :size="4">
        <a-upload
          :accept="MACHINE_ROW_IMAGE_RULES.accept"
          :before-upload="picker.beforeUpload"
          :disabled="uploading"
          :show-upload-list="false"
          @reject="picker.onReject"
        >
          <a-tooltip :title="uploading ? UPLOADING_TITLE : '更换示意图'">
            <a-button
              type="text"
              size="small"
              :loading="uploading"
              :aria-label="`更换 ${label} 的示意图`"
            >
              <template #icon><ImageUp :size="14" /></template>
            </a-button>
          </a-tooltip>
        </a-upload>
        <a-tooltip title="删除示意图">
          <a-button
            type="text"
            size="small"
            danger
            :aria-label="`删除 ${label} 的示意图`"
            @click="remove"
          >
            <template #icon><Trash2 :size="14" /></template>
          </a-button>
        </a-tooltip>
      </a-space>
    </template>
    <template v-else-if="writable">
      <a-tooltip
        v-if="previousRow?.image"
        :title="`和上一笔「${previousRow.role}」共用「${previousRow.image.fileName}」，合并成一格`"
      >
        <a-button
          size="small"
          :disabled="uploading"
          :aria-label="`${label} 沿用上一笔的图`"
          @click="reusePrevious"
        >
          <template #icon><CopyPlus :size="14" /></template>
          沿用上一笔的图
        </a-button>
      </a-tooltip>
      <a-upload
        :accept="MACHINE_ROW_IMAGE_RULES.accept"
        :before-upload="picker.beforeUpload"
        :disabled="uploading"
        :show-upload-list="false"
        @reject="picker.onReject"
      >
        <a-button
          size="small"
          :loading="uploading"
          :aria-label="`给 ${label} 新增示意图`"
        >
          <template #icon><ImagePlus :size="14" /></template>
          {{ uploading ? UPLOADING_TITLE : '新增图片' }}
        </a-button>
      </a-upload>
    </template>
    <span v-else>—</span>
  </div>
</template>

<style scoped src="./MachineRowImageCell.css"></style>
