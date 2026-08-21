<script setup lang="ts">
import { Maximize2, Minimize2, Minus, Plus, RotateCcw, X } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';

import AIconButton from './AIconButton.vue';
import {
  canPanImage,
  clampImageZoom,
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  imageZoomPercent,
  stepImageZoom,
} from './image-viewer';

defineProps<{
  src: string;
  alt?: string;
}>();

const open = defineModel<boolean>('open', { default: false });
const maximized = ref(false);
const zoom = ref(1);
const offset = ref({ x: 0, y: 0 });
const dragging = ref(false);
const origin = ref({ x: 0, y: 0, ox: 0, oy: 0 });

const percent = computed(() => imageZoomPercent(zoom.value));
const imageStyle = computed(() => ({
  transform: `translate(${offset.value.x}px, ${offset.value.y}px) scale(${zoom.value})`,
}));

function setZoom(next: number) {
  zoom.value = clampImageZoom(next);
  if (!canPanImage(zoom.value)) {
    offset.value = { x: 0, y: 0 };
  }
}

function reset() {
  setZoom(1);
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const direction = event.deltaY > 0 ? -1 : 1;
  setZoom(stepImageZoom(zoom.value, direction));
}

function onPointerDown(event: PointerEvent) {
  if (!canPanImage(zoom.value) || event.button !== 0) {
    return;
  }

  dragging.value = true;
  origin.value = {
    x: event.clientX,
    y: event.clientY,
    ox: offset.value.x,
    oy: offset.value.y,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) {
    return;
  }

  offset.value = {
    x: origin.value.ox + event.clientX - origin.value.x,
    y: origin.value.oy + event.clientY - origin.value.y,
  };
}

function onPointerUp() {
  dragging.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) {
    reset();
    maximized.value = false;
  }
});
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="a-sheet__overlay" />
      <DialogContent
        class="a-image-viewer"
        :class="{ 'a-image-viewer--max': maximized }"
        aria-modal="true"
        :aria-describedby="undefined"
      >
        <header class="a-image-viewer__toolbar">
          <DialogTitle class="a-image-viewer__title">图片预览</DialogTitle>
          <div class="a-image-viewer__zoom">
            <AIconButton
              :icon="Minus"
              label="缩小"
              :disabled="zoom <= IMAGE_ZOOM_MIN"
              @click="setZoom(stepImageZoom(zoom, -1))"
            />
            <strong>{{ percent }}</strong>
            <AIconButton
              :icon="Plus"
              label="放大"
              :disabled="zoom >= IMAGE_ZOOM_MAX"
              @click="setZoom(stepImageZoom(zoom, 1))"
            />
            <AIconButton :icon="RotateCcw" label="重置" @click="reset" />
          </div>
          <AIconButton
            :icon="maximized ? Minimize2 : Maximize2"
            :label="maximized ? '还原' : '最大化'"
            @click="maximized = !maximized"
          />
          <AIconButton :icon="X" label="关闭" @click="open = false" />
        </header>
        <div
          class="a-image-viewer__stage"
          :data-panning="canPanImage(zoom) ? '' : undefined"
          @wheel.prevent="onWheel"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
        >
          <img :src="src" :alt="alt ?? ''" :style="imageStyle">
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
.a-image-viewer {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: var(--z-overlay);
  display: grid;
  grid-template-rows: auto 1fr;
  width: min(calc(100vw - var(--space-8)), calc(var(--space-9) * 18));
  height: min(calc(100vh - var(--space-8)), calc(var(--space-9) * 16));
  overflow: hidden;
  color: var(--label);
  background: var(--bg-elevated);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-4), inset 0 0 0 0.5px var(--separator);
  transform: translate(-50%, -50%);
}

.a-image-viewer--max {
  width: calc(100vw - var(--space-4));
  height: calc(100vh - var(--space-4));
  border-radius: var(--radius-lg);
}

.a-image-viewer__toolbar {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) var(--space-4);
  box-shadow: var(--hairline);
}

.a-image-viewer__title {
  margin: 0;
  font: var(--text-control-em);
}

.a-image-viewer__zoom {
  display: flex;
  flex: 1;
  gap: var(--space-2);
  align-items: center;
  justify-content: center;
  font: var(--text-control-em);
}

.a-image-viewer__stage {
  overflow: hidden;
  cursor: default;
  background: var(--bg-grouped);
}

.a-image-viewer__stage[data-panning] {
  cursor: grab;
}

.a-image-viewer__stage img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: center center;
  user-select: none;
}

@media (prefers-reduced-motion: reduce) {
  .a-image-viewer__stage img {
    transition: none;
  }
}
</style>
