<script lang="ts" setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';

import { ElButton, ElTooltip } from 'element-plus';
import { Minus, Plus, RotateCcw } from 'lucide-vue-next';

import {
  dataUrlToPdfBytes,
  drawPdfWatermark,
  getDocument,
} from '../pdf-preview.js';

type PdfDoc = Awaited<ReturnType<typeof getDocument>['promise']>;

const props = withDefaults(
  defineProps<{ dataUrl: string; watermark?: string }>(),
  {
    watermark: 'Symtek · 仅供内部预览',
  },
);

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

const containerRef = ref<HTMLElement | null>(null);
const loading = ref(false);
const error = ref('');
const pageCount = ref(0);
const renderedCount = ref(0);
const zoom = ref(1);
const fitScale = ref(1);

const renderScale = computed(() => fitScale.value * zoom.value);
const scalePercent = computed(() => `${Math.round(zoom.value * 100)}%`);

let renderToken = 0;
let activeDoc: null | PdfDoc = null;
let observer: IntersectionObserver | null = null;
const pageSlots = new Map<number, HTMLElement>();
const renderedPages = new Set<number>();
const renderingPages = new Set<number>();
const pageSizes = new Map<number, { height: number; width: number }>();

function releasePdfDoc(doc: null | PdfDoc) {
  if (!doc) return;
  const destroyable = doc as { destroy?: () => Promise<unknown> } & PdfDoc;
  if (typeof destroyable.destroy === 'function') {
    void destroyable.destroy().catch(() => {
      try {
        doc.cleanup();
      } catch {
        // ignore
      }
    });
    return;
  }
  try {
    doc.cleanup();
  } catch {
    // ignore
  }
}

function disconnectObserver() {
  observer?.disconnect();
  observer = null;
}

function clearContainer() {
  disconnectObserver();
  containerRef.value?.replaceChildren();
  pageSlots.clear();
  renderedPages.clear();
  renderingPages.clear();
  pageSizes.clear();
  renderedCount.value = 0;
}

async function waitForContainer(token: number) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (token !== renderToken) return null;
    await nextTick();
    if (containerRef.value) return containerRef.value;
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  return containerRef.value;
}

function updateSlotSize(
  slot: HTMLElement,
  pageNumber: number,
  nextScale: number,
) {
  const size = pageSizes.get(pageNumber);
  if (!size) return;
  slot.style.width = `${Math.floor(size.width * nextScale)}px`;
  slot.style.height = `${Math.floor(size.height * nextScale)}px`;
}

async function ensurePageRendered(pageNumber: number, token: number) {
  if (
    token !== renderToken ||
    !activeDoc ||
    renderedPages.has(pageNumber) ||
    renderingPages.has(pageNumber)
  ) {
    return;
  }

  const slot = pageSlots.get(pageNumber);
  if (!slot) return;

  renderingPages.add(pageNumber);
  try {
    const page = await activeDoc.getPage(pageNumber);
    if (token !== renderToken) return;

    if (!pageSizes.has(pageNumber)) {
      const baseViewport = page.getViewport({ scale: 1 });
      pageSizes.set(pageNumber, {
        height: baseViewport.height,
        width: baseViewport.width,
      });
    }

    const nextScale = renderScale.value;
    updateSlotSize(slot, pageNumber, nextScale);
    const viewport = page.getViewport({ scale: nextScale });
    const canvas = window.document.createElement('canvas');
    const cssWidth = Math.floor(viewport.width);
    const cssHeight = Math.floor(viewport.height);
    canvas.className = 'controlled-preview-viewer__page';
    canvas.width = cssWidth;
    canvas.height = cssHeight;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.dataset.page = String(pageNumber);

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('canvas unavailable');

    await page.render({
      canvas,
      canvasContext: context,
      viewport,
    }).promise;
    if (token !== renderToken) return;

    drawPdfWatermark(context, canvas.width, canvas.height, props.watermark);
    slot.replaceChildren(canvas);
    renderedPages.add(pageNumber);
    renderedCount.value = renderedPages.size;
    page.cleanup();
  } catch (pageError) {
    console.error('[pdf-preview] page render failed', pageNumber, pageError);
    if (token === renderToken) {
      error.value = `第 ${pageNumber} 页预览失败`;
    }
  } finally {
    renderingPages.delete(pageNumber);
  }
}

function observeVisiblePages(token: number) {
  disconnectObserver();
  const root = containerRef.value;
  if (!root) return;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pageNumber = Number(
          (entry.target as HTMLElement).dataset.page || 0,
        );
        if (pageNumber > 0) void ensurePageRendered(pageNumber, token);
      }
    },
    {
      root,
      rootMargin: '240px 0px',
      threshold: 0.01,
    },
  );

  for (const slot of pageSlots.values()) observer.observe(slot);
}

async function buildPageSlots(pdfDoc: PdfDoc, token: number) {
  const root = containerRef.value;
  if (!root) return;

  root.replaceChildren();
  pageSlots.clear();

  const fallback = pageSizes.get(1);
  if (!fallback) return;

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
    if (token !== renderToken) return;
    const slot = window.document.createElement('div');
    slot.className = 'controlled-preview-viewer__slot';
    slot.dataset.page = String(pageNumber);
    const size = pageSizes.get(pageNumber) || fallback;
    slot.style.width = `${Math.floor(size.width * renderScale.value)}px`;
    slot.style.height = `${Math.floor(size.height * renderScale.value)}px`;
    root.append(slot);
    pageSlots.set(pageNumber, slot);
  }
}

async function loadDocument(dataUrl: string) {
  const token = ++renderToken;
  loading.value = true;
  error.value = '';
  pageCount.value = 0;
  renderedCount.value = 0;
  zoom.value = 1;

  if (activeDoc) {
    releasePdfDoc(activeDoc);
    activeDoc = null;
  }

  const root = await waitForContainer(token);
  if (!root) {
    if (token === renderToken) {
      error.value = '预览容器未就绪，请关闭后重试';
      loading.value = false;
    }
    return;
  }
  clearContainer();

  try {
    // 直接传 Uint8Array（pdfjs 原生支持），避免展开成普通数组造成数倍内存膨胀
    const bytes = dataUrlToPdfBytes(dataUrl);
    const pdfDoc = await getDocument({
      data: bytes,
      useSystemFonts: true,
    }).promise;
    if (token !== renderToken) {
      releasePdfDoc(pdfDoc);
      return;
    }

    activeDoc = pdfDoc;
    pageCount.value = pdfDoc.numPages;

    const firstPage = await pdfDoc.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: 1 });
    pageSizes.set(1, {
      height: firstViewport.height,
      width: firstViewport.width,
    });
    firstPage.cleanup();

    const availableWidth = Math.max(320, (root.clientWidth || 760) - 32);
    fitScale.value = Math.min(1.35, availableWidth / firstViewport.width);
    zoom.value = 1;

    await buildPageSlots(pdfDoc, token);
    if (token !== renderToken) return;

    observeVisiblePages(token);
    await ensurePageRendered(1, token);
  } catch (loadError) {
    console.error('[pdf-preview] load failed', loadError);
    if (token !== renderToken) return;
    clearContainer();
    pageCount.value = 0;
    const message =
      loadError instanceof Error && loadError.message
        ? loadError.message
        : '未知错误';
    error.value = `PDF 预览加载失败：${message}`;
  } finally {
    if (token === renderToken) loading.value = false;
  }
}

async function applyZoom(nextZoom: number) {
  const token = renderToken;
  if (!activeDoc || pageCount.value === 0) return;

  zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
  renderedPages.clear();
  renderingPages.clear();
  renderedCount.value = 0;

  for (const [pageNumber, slot] of pageSlots) {
    slot.replaceChildren();
    updateSlotSize(slot, pageNumber, renderScale.value);
  }

  observeVisiblePages(token);

  const root = containerRef.value;
  if (!root) return;
  const visible = [...pageSlots.entries()]
    .filter(([, slot]) => {
      const slotRect = slot.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      return slotRect.bottom >= rootRect.top && slotRect.top <= rootRect.bottom;
    })
    .map(([pageNumber]) => pageNumber);

  const targets = visible.length > 0 ? visible : [1];
  await Promise.all(
    targets.map((pageNumber) => ensurePageRendered(pageNumber, token)),
  );
}

function zoomIn() {
  void applyZoom(Number((zoom.value + ZOOM_STEP).toFixed(2)));
}

function zoomOut() {
  void applyZoom(Number((zoom.value - ZOOM_STEP).toFixed(2)));
}

function resetZoom() {
  void applyZoom(1);
}

watch(
  () => [props.dataUrl, props.watermark] as const,
  ([dataUrl]) => {
    if (!dataUrl) return;
    void loadDocument(dataUrl);
  },
  { immediate: true },
);

onUnmounted(() => {
  renderToken += 1;
  disconnectObserver();
  releasePdfDoc(activeDoc);
  activeDoc = null;
});
</script>

<template>
  <div class="controlled-preview-shell">
    <div class="controlled-preview-toolbar">
      <span v-if="loading">正在加载预览...</span>
      <span
        v-else-if="error && renderedCount === 0"
        class="controlled-preview-viewer__status--error"
      >
        {{ error }}
      </span>
      <span v-else-if="pageCount > 0">
        可见渲染 {{ renderedCount }} / {{ pageCount }} 页 · 含水印 · 禁止下载
      </span>
      <span v-else>准备预览</span>

      <div class="controlled-preview-toolbar__zoom">
        <ElTooltip content="缩小" placement="top">
          <ElButton
            :disabled="loading || zoom <= ZOOM_MIN"
            aria-label="缩小"
            circle
            size="small"
            @click="zoomOut"
          >
            <Minus :size="14" aria-hidden="true" />
          </ElButton>
        </ElTooltip>
        <strong>{{ scalePercent }}</strong>
        <ElTooltip content="放大" placement="top">
          <ElButton
            :disabled="loading || zoom >= ZOOM_MAX"
            aria-label="放大"
            circle
            size="small"
            @click="zoomIn"
          >
            <Plus :size="14" aria-hidden="true" />
          </ElButton>
        </ElTooltip>
        <ElTooltip content="重置缩放" placement="top">
          <ElButton
            :disabled="loading"
            aria-label="重置缩放"
            circle
            size="small"
            @click="resetZoom"
          >
            <RotateCcw :size="14" aria-hidden="true" />
          </ElButton>
        </ElTooltip>
      </div>
    </div>

    <p
      v-if="error && renderedCount > 0"
      class="controlled-preview-viewer__status controlled-preview-viewer__status--error"
    >
      {{ error }}
    </p>

    <div
      ref="containerRef"
      class="controlled-preview-viewer"
      @contextmenu.prevent
    ></div>
  </div>
</template>
