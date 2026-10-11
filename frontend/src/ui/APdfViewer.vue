<script setup lang="ts">
import { Minus, Plus, RotateCcw } from 'lucide-vue-next';
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';

// 只引类型：pdf.js 体积大且 ./pdf 有设置 workerSrc 的顶层副作用，
// 运行时在 load() 里按需 import('./pdf')，不让它经 ui/index.ts 进入口 chunk
import type { PdfDocument, PdfLoadingTask } from './pdf';

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
/** 当前 getDocument 的加载任务；切换 src 或卸载时 destroy，中断还在下载/解析的文档 */
let activeTask: PdfLoadingTask | null = null;
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
  const task = activeTask;
  const doc = activeDoc;
  activeTask = null;
  activeDoc = null;
  if (task) {
    try {
      // 加载中途被打断时文档还没交到 activeDoc 手里，只能靠 task 收尾；
      // pdf.js 的 destroy 可重复调用，已加载的文档再走一次 destroyPdf 也无妨
      await task.destroy();
    } catch {
      // ignore
    }
  }
  if (doc) {
    const { destroyPdf } = await import('./pdf');
    await destroyPdf(doc);
  }
}

async function renderPages(currentToken: number) {
  if (!activeDoc || currentToken !== token) {
    return;
  }

  const currentRender = (renderToken += 1);
  cancelRender();

  for (let pageNumber = 1; pageNumber <= pageCount.value; pageNumber += 1) {
    if (currentToken !== token || currentRender !== renderToken || !activeDoc) {
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
    const { destroyPdf, getDocument } = await import('./pdf');
    if (current !== token) {
      return;
    }
    const task = getDocument(src);
    activeTask = task;
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
      <a-typography-text v-if="pageCount" type="secondary">
        共 {{ pageCount }} 页
      </a-typography-text>
      <a-typography-text v-if="loading" type="secondary">
        正在加载预览…
      </a-typography-text>
      <a-typography-text v-else-if="error" type="danger">
        {{ error }}
      </a-typography-text>
      <a-space class="a-pdf-viewer__zoom" :size="4">
        <a-tooltip title="缩小">
          <a-button
            type="text"
            size="small"
            aria-label="缩小"
            :disabled="loading || zoom <= ZOOM_MIN"
            @click="zoomBy(-ZOOM_STEP)"
          >
            <template #icon><Minus :size="14" /></template>
          </a-button>
        </a-tooltip>
        <a-typography-text class="a-pdf-viewer__percent" strong>
          {{ percent }}
        </a-typography-text>
        <a-tooltip title="放大">
          <a-button
            type="text"
            size="small"
            aria-label="放大"
            :disabled="loading || zoom >= ZOOM_MAX"
            @click="zoomBy(ZOOM_STEP)"
          >
            <template #icon><Plus :size="14" /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip title="适应宽度">
          <a-button
            type="text"
            size="small"
            aria-label="适应宽度"
            :disabled="loading"
            @click="fitWidth"
          >
            <template #icon><RotateCcw :size="14" /></template>
          </a-button>
        </a-tooltip>
      </a-space>
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
  background: var(--color-bg-layout);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-lg);
}

.a-pdf-viewer--large {
  height: min(calc(var(--space-9) * 16), calc(100dvh - 152px));
  min-height: min(calc(var(--space-9) * 11), calc(100dvh - 152px));
}

.a-pdf-viewer__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  align-items: center;
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg-container);
  border-bottom: 1px solid var(--color-border-secondary);
}

.a-pdf-viewer__zoom {
  margin-left: auto;
}

.a-pdf-viewer__percent {
  display: inline-block;
  min-width: var(--space-8);
  text-align: center;
}

.a-pdf-viewer__stage {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  align-items: center;
  padding: var(--space-5);
  overflow: auto;
}

.a-pdf-viewer__page {
  margin: 0;
}

.a-pdf-viewer__page canvas {
  display: block;
  background: var(--color-bg-container);
  box-shadow: var(--box-shadow-tertiary);
}
</style>
