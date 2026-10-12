<script setup lang="ts">
import type { SensorFileItem } from '@/domain';
import { APdfViewer } from '@/ui';

/** 从型号表格直接预览关联的型录 / 3D PDF；置空即关闭 */
const preview = defineModel<{
  file: SensorFileItem;
  kind: '3D' | '型录';
} | null>({ required: true });
</script>

<template>
  <a-modal
    :open="Boolean(preview)"
    :title="preview ? `${preview.kind} · ${preview.file.title}` : '预览 PDF'"
    width="calc(100vw - 48px)"
    wrap-class-name="pdf-preview-modal"
    :footer="null"
    destroy-on-close
    @cancel="preview = null"
  >
    <APdfViewer
      v-if="preview"
      class="a-pdf-viewer--large"
      :src="preview.file.dataUrl"
    />
  </a-modal>
</template>
