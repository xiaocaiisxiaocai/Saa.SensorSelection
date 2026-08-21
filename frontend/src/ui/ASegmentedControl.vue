<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { SegmentedSize, SegmentOption } from './types';

const props = withDefaults(
  defineProps<{
    segments: SegmentOption[];
    size?: SegmentedSize;
  }>(),
  {
    size: 'medium',
  },
);

const model = defineModel<string>({ required: true });
const root = ref<HTMLElement | null>(null);
const thumbX = ref(0);
const thumbWidth = ref(0);
let resizeObserver: ResizeObserver | null = null;

const selectedIndex = computed(() => {
  const index = props.segments.findIndex((item) => item.value === model.value);
  return index < 0 ? 0 : index;
});

function updateThumb() {
  const selected = root.value?.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!selected) {
    thumbX.value = 0;
    thumbWidth.value = 0;
    return;
  }
  thumbX.value = selected.offsetLeft;
  thumbWidth.value = selected.offsetWidth;
}

function select(value: string) {
  if (value !== model.value) {
    model.value = value;
  }
}

function onKeydown(event: KeyboardEvent) {
  const index = selectedIndex.value;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    const next = props.segments[index + 1];
    if (next) {
      select(next.value);
    }
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    const prev = props.segments[index - 1];
    if (prev) {
      select(prev.value);
    }
  }
}

onMounted(() => {
  updateThumb();
  if (typeof ResizeObserver === 'undefined' || !root.value) return;
  resizeObserver = new ResizeObserver(() => updateThumb());
  resizeObserver.observe(root.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

watch(
  [model, () => props.segments],
  async () => {
    await nextTick();
    updateThumb();
  },
  { deep: true },
);
</script>

<template>
  <div
    ref="root"
    class="a-segmented"
    :class="`a-segmented--${size}`"
    role="tablist"
    @keydown="onKeydown"
  >
    <div
      class="a-segmented__thumb"
      :style="{
        width: `${thumbWidth}px`,
        transform: `translateX(${thumbX}px)`,
      }"
    />
    <button
      v-for="(segment, index) in segments"
      :key="segment.value"
      class="a-segmented__tab"
      :class="{ 'a-segmented__tab--selected': segment.value === model }"
      type="button"
      role="tab"
      :aria-selected="segment.value === model"
      :tabindex="segment.value === model ? 0 : -1"
      @click="select(segment.value)"
    >
      <span>{{ segment.label }}</span>
      <span
        v-if="segment.badge != null && segment.badge > 0"
        class="a-segmented__badge"
      >
        {{ segment.badge }}
      </span>
      <span
        v-if="index < segments.length - 1"
        class="a-segmented__rule"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped>
.a-segmented {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-self: flex-start;
  width: max-content;
  max-width: 100%;
  padding: var(--space-1);
  background: var(--fill-1);
  border-radius: var(--radius-lg);
}

.a-segmented__thumb {
  position: absolute;
  top: var(--space-1);
  bottom: var(--space-1);
  left: 0;
  z-index: 0;
  background: var(--bg-content);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-1);
  transition:
    transform var(--dur-2) var(--ease-in-out),
    width var(--dur-2) var(--ease-in-out);
}

.a-segmented__tab {
  position: relative;
  z-index: 1;
  display: inline-flex;
  flex: 0 0 auto;
  gap: var(--space-1);
  align-items: center;
  justify-content: center;
  padding: 0 var(--space-3);
  overflow: hidden;
  color: var(--label-2);
  background: transparent;
  border: 0;
  white-space: nowrap;
}

.a-segmented--medium .a-segmented__tab {
  height: var(--control-height-md);
  font: var(--text-control);
}

.a-segmented--large .a-segmented__tab {
  height: var(--control-height-lg);
  font: var(--text-control);
}

.a-segmented__tab--selected {
  color: var(--label);
}

.a-segmented__tab:active:not(.a-segmented__tab--selected) {
  opacity: 0.7;
}

.a-segmented__badge {
  font: var(--text-caption);
  color: var(--label-3);
  letter-spacing: var(--tracking-caption);
}

.a-segmented__tab--selected .a-segmented__badge {
  color: var(--label-2);
}

.a-segmented__rule {
  position: absolute;
  top: var(--space-2);
  right: 0;
  bottom: var(--space-2);
  width: 0.5px;
  background: var(--separator);
  opacity: 1;
  transition: opacity var(--dur-1) var(--ease-out);
}

.a-segmented__tab--selected .a-segmented__rule,
.a-segmented__tab:has(+ .a-segmented__tab--selected) .a-segmented__rule {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .a-segmented__thumb,
  .a-segmented__rule {
    transition: none;
  }
}
</style>
