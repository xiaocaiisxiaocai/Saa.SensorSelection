<script setup lang="ts">
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw } from 'lucide-vue-next';
import { computed, onUnmounted, ref, watch } from 'vue';

import AIconButton from './AIconButton.vue';
import { destroyPdf, getDocument, type PdfDocument } from './pdf';

const props = defineProps<{
  src: string;
}>();

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

const canvasEl = ref<HTMLCanvasElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const loading = ref(false);
const error = ref('');
const pageCount = ref(0);
const page = ref(1);
const zoom = ref(1);
const fitScale = ref(1);
const percent = computed(() => `${Math.round(zoom.value * 100)}%`);

let activeDoc: PdfDocument | null = null;
let token = 0;

function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2))));
}

async function release() {
  const doc = activeDoc;
  activeDoc = null;
  await destroyPdf(doc);
}

async function renderPage(currentToken: number) {
  if (!activeDoc || !canvasEl.value || currentToken !== token) {
    return;
  }

  const pdfPage = await activeDoc.getPage(page.value);
  if (currentToken !== token) {
    pdfPage.cleanup();
    return;
  }

  const viewport = pdfPage.getViewport({
    scale: fitScale.value * zoom.value,
  });
  const canvas = canvasEl.value;
  const context = canvas.getContext('2d');
  if (!context) {
    pdfPage.cleanup();
    return;
  }

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await pdfPage.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise;
  pdfPage.cleanup();
}

async function load(src: string) {
  const current = (token += 1);
  loading.value = true;
  error.value = '';
  page.value = 1;
  zoom.value = 1;
  await release();

  if (!src) {
    pageCount.value = 0;
    loading.value = false;
    return;
  }

  try {
    const task = getDocument(src);
    const doc = await task.promise;
    if (current !== token) {
      await destroyPdf(doc);
      return;
    }

    activeDoc = doc;
    pageCount.value = doc.numPages;
    const first = await doc.getPage(1);
    const viewport = first.getViewport({ scale: 1 });
    first.cleanup();
    const width = Math.max(stageEl.value?.clientWidth ?? 0, 320);
    fitScale.value = Math.min(1.35, width / viewport.width);
    await renderPage(current);
  } catch (loadError) {
    if (current !== token) {
      return;
    }
    pageCount.value = 0;
    error.value =
      loadError instanceof Error ? loadError.message : 'PDF 预览加载失败';
  } finally {
    if (current === token) {
      loading.value = false;
    }
  }
}

async function goTo(next: number) {
  if (pageCount.value === 0) {
    return;
  }

  page.value = Math.min(pageCount.value, Math.max(1, next));
  await renderPage(token);
}

function zoomBy(delta: number) {
  zoom.value = clampZoom(zoom.value + delta);
  void renderPage(token);
}

function fitWidth() {
  zoom.value = 1;
  void renderPage(token);
}

watch(
  () => props.src,
  (src) => {
    void load(src);
  },
  { immediate: true },
);

onUnmounted(() => {
  token += 1;
  void release();
});
</script>

<template>
  <div class="a-pdf-viewer">
    <header class="a-pdf-viewer__toolbar">
      <div class="a-pdf-viewer__pager">
        <AIconButton
          :icon="ChevronLeft"
          label="上一页"
          size="small"
          :disabled="page <= 1 || loading"
          @click="goTo(page - 1)"
        />
        <input
          class="a-pdf-viewer__page-input"
          type="text"
          inputmode="numeric"
          aria-label="页码"
          :value="page"
          :disabled="loading || pageCount === 0"
          @change="goTo(Number(($event.target as HTMLInputElement).value) || page)"
        >
        <span class="a-pdf-viewer__count">/ {{ pageCount }}</span>
        <AIconButton
          :icon="ChevronRight"
          label="下一页"
          size="small"
          :disabled="page >= pageCount || loading"
          @click="goTo(page + 1)"
        />
      </div>
      <span class="a-pdf-viewer__zoom">
        <AIconButton
          :icon="Minus"
          label="缩小"
          size="small"
          :disabled="loading || zoom <= ZOOM_MIN"
          @click="zoomBy(-ZOOM_STEP)"
        />
        <strong>{{ percent }}</strong>
        <AIconButton
          :icon="Plus"
          label="放大"
          size="small"
          :disabled="loading || zoom >= ZOOM_MAX"
          @click="zoomBy(ZOOM_STEP)"
        />
        <AIconButton
          :icon="RotateCcw"
          label="适应宽度"
          size="small"
          :disabled="loading"
          @click="fitWidth"
        />
      </span>
      <span v-if="loading" class="a-pdf-viewer__status">正在加载预览…</span>
      <span v-else-if="error" class="a-pdf-viewer__status a-pdf-viewer__status--error">
        {{ error }}
      </span>
    </header>
    <div ref="stageEl" class="a-pdf-viewer__stage">
      <canvas ref="canvasEl" />
    </div>
  </div>
</template>

<style scoped>
.a-pdf-viewer {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: calc(var(--space-9) * 10);
  overflow: hidden;
  background: var(--bg-grouped);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 0 0.5px var(--separator);
}

.a-pdf-viewer__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  min-height: var(--row-height-loose);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-content);
  box-shadow: var(--hairline);
}

.a-pdf-viewer__pager,
.a-pdf-viewer__zoom {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.a-pdf-viewer__zoom {
  margin-left: auto;
}

.a-pdf-viewer__page-input {
  width: var(--space-9);
  height: var(--control-height-sm);
  padding: 0;
  font: var(--text-control);
  color: var(--label);
  text-align: center;
  background: var(--fill-2);
  border: 0;
  border-radius: var(--radius-sm);
}

.a-pdf-viewer__page-input:focus,
.a-pdf-viewer__page-input:focus-visible {
  background: var(--bg-content);
  box-shadow: var(--focus-ring);
}

.a-pdf-viewer__count,
.a-pdf-viewer__status {
  font: var(--text-control);
  line-height: var(--control-height-sm);
  color: var(--label-2);
}

.a-pdf-viewer__status--error {
  color: var(--sys-red);
}

.a-pdf-viewer__zoom strong {
  min-width: var(--space-8);
  font: var(--text-control-em);
  line-height: var(--control-height-sm);
  color: var(--label);
  text-align: center;
}

.a-pdf-viewer__stage {
  overflow: auto;
  padding: var(--space-4);
}

.a-pdf-viewer__stage canvas {
  display: block;
  margin: 0 auto;
  background: var(--bg-content);
  box-shadow: var(--shadow-2);
}
</style>
