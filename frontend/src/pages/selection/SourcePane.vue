<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

import {
  clampSourceWidth,
  readSourceWidth,
  SOURCE_WIDTH_MAX,
  SOURCE_WIDTH_MIN,
  SOURCE_WIDTH_STEP,
  writeSourceWidth,
} from './source-pane-width';

/**
 * 左侧目录列：右边缘可左右拖拽调宽（方向键微调、双击恢复默认），
 * 宽度通过 --source-list-width 传给里面的目录树。
 */
const props = defineProps<{
  storageKey: string;
  defaultWidth: number;
}>();

const RESIZING_CLASS = 'is-resizing-pane';

const root = ref<HTMLElement>();
const width = ref(readSourceWidth(props.storageKey, props.defaultWidth));
const dragging = ref(false);
let startX = 0;
let startWidth = 0;

// 右侧内容至少保留一半宽度
function clamp(next: number): number {
  const container = root.value?.parentElement?.clientWidth;
  return clampSourceWidth(next, container ? container / 2 : undefined);
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  startX = event.clientX;
  startWidth = width.value;
  dragging.value = true;
  // 拖动期间全局保持列宽光标、不选中文字
  document.body.classList.add(RESIZING_CLASS);
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return;
  width.value = clamp(startWidth + event.clientX - startX);
}

function endDrag() {
  if (!dragging.value) return;
  dragging.value = false;
  document.body.classList.remove(RESIZING_CLASS);
  writeSourceWidth(props.storageKey, width.value);
}

function onKeydown(event: KeyboardEvent) {
  const delta = {
    ArrowLeft: -SOURCE_WIDTH_STEP,
    ArrowRight: SOURCE_WIDTH_STEP,
  }[event.key];
  if (delta === undefined) return;
  event.preventDefault();
  width.value = clamp(width.value + delta);
  writeSourceWidth(props.storageKey, width.value);
}

function reset() {
  width.value = props.defaultWidth;
  writeSourceWidth(props.storageKey, null);
}

onBeforeUnmount(() => document.body.classList.remove(RESIZING_CLASS));
</script>

<template>
  <div
    ref="root"
    class="source-pane"
    :class="{ 'source-pane--dragging': dragging }"
    :style="{ '--source-list-width': `${width}px` }"
  >
    <slot />
    <div
      class="source-pane__handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整目录宽度"
      :aria-valuenow="width"
      :aria-valuemin="SOURCE_WIDTH_MIN"
      :aria-valuemax="SOURCE_WIDTH_MAX"
      tabindex="0"
      title="拖动调整宽度，双击恢复默认"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
      @dblclick="reset"
      @keydown="onKeydown"
    />
  </div>
</template>

<style scoped src="./SourcePane.css"></style>
