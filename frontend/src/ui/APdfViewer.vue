<script setup lang="ts">
import { Minus, Plus, RotateCcw } from 'lucide-vue-next';
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';

import AIconButton from './AIconButton.vue';
import { destroyPdf, getDocument, type PdfDocument } from './pdf';

const props = defineProps<{
  src: string;
}>();

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

const canvasEls = ref<HTMLCanvasElement[]>([]);
const stageEl = ref<HTMLElement | null>(null);
const loading = ref(false);
const error = ref('');
const pageCount = ref(0);
const zoom = ref(1);
const fitScale = ref(1);
const percent = computed(() => `${Math.round(zoom.value * 100)}%`);

let activeDoc: PdfDocument | null = null;
let token = 0;
let renderToken = 0;
const currentRenderTasks = new Set<{
  cancel: () => void;
  promise: Promise<unknown>;
}>();

function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2))));
}

function cancelRender() {
  for (const task of currentRenderTasks) {
    try {
      task.cancel();
    } catch {
      // ignore
    }
  }
  currentRenderTasks.clear();
}

async function release() {
  renderToken += 1;
  cancelRender();
  const doc = activeDoc;
  activeDoc = null;
  await destroyPdf(doc);
}

async function renderPages(currentToken: number) {
  if (!activeDoc || currentToken !== token) {
    return;
  }

  const currentRender = (renderToken += 1);
  cancelRender();

  for (let pageNumber = 1; pageNumber <= pageCount.value; pageNumber += 1) {
    if (
      currentToken !== token ||
      currentRender !== renderToken ||
      !activeDoc
    ) {
      return;
    }

    let pdfPage: Awaited<ReturnType<PdfDocument['getPage']>> | null = null;
    try {
      pdfPage = await activeDoc.getPage(pageNumber);
      if (
        currentToken !== token ||
        currentRender !== renderToken ||
        !activeDoc
      ) {
        return;
      }

      const viewport = pdfPage.getViewport({
        scale: fitScale.value * zoom.value,
      });
      const canvas = canvasEls.value[pageNumber - 1];
      if (!canvas) {
        continue;
      }
      const context = canvas.getContext('2d');
      if (!context) {
        continue;
      }

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const task = pdfPage.render({
        canvas,
        canvasContext: context,
        viewport,
      });
      currentRenderTasks.add(task);
      await task.promise;
      currentRenderTasks.delete(task);
    } catch (renderError) {
      if (
        renderError &&
        typeof renderError === 'object' &&
        'name' in renderError &&
        renderError.name === 'RenderingCancelledException'
      ) {
        currentRenderTasks.clear();
        return;
      }
      currentRenderTasks.clear();
      if (currentToken === token && currentRender === renderToken) {
        error.value =
          renderError instanceof Error ? renderError.message : '页面渲染失败';
      }
      return;
    } finally {
      pdfPage?.cleanup();
    }
  }
}

async function load(src: string) {
  const current = (token += 1);
  loading.value = true;
  error.value = '';
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
    await nextTick();
    const first = await doc.getPage(1);
    const viewport = first.getViewport({ scale: 1 });
    first.cleanup();
    const width = Math.max(stageEl.value?.clientWidth ?? 0, 320);
    fitScale.value = Math.min(1.75, width / viewport.width);
    await renderPages(current);
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

function zoomBy(delta: number) {
  zoom.value = clampZoom(zoom.value + delta);
  void renderPages(token);
}

function fitWidth() {
  zoom.value = 1;
  void renderPages(token);
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
      <span v-if="pageCount" class="a-pdf-viewer__count">共 {{ pageCount }} 页</span>
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
    <div
      ref="stageEl"
      class="a-pdf-viewer__stage"
      role="region"
      tabindex="0"
      :aria-label="`PDF 连续预览，共 ${pageCount} 页`"
    >
      <figure
        v-for="pageNumber in pageCount"
        :key="pageNumber"
        class="a-pdf-viewer__page"
        :aria-label="`第 ${pageNumber} 页`"
      >
        <canvas ref="canvasEls" />
      </figure>
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

.a-pdf-viewer--large {
  height: min(calc(var(--space-9) * 16), calc(100dvh - 152px));
  min-height: min(calc(var(--space-9) * 11), calc(100dvh - 152px));
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

.a-pdf-viewer__zoom {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin-left: auto;
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
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  align-items: center;
  overflow: auto;
  padding: var(--space-4);
}

.a-pdf-viewer__page {
  margin: 0;
}

.a-pdf-viewer__page canvas {
  display: block;
  background: var(--bg-content);
  box-shadow: var(--shadow-2);
}
</style>
