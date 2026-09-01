<script setup lang="ts">
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import AIconButton from './AIconButton.vue';
import type { TabItem } from './types';

const props = withDefaults(
  defineProps<{
    tabs: TabItem[];
    addable?: boolean;
    addLabel?: string;
  }>(),
  {
    addLabel: '新增 Tab',
  },
);

const emit = defineEmits<{
  rename: [value: string];
  close: [value: string];
  add: [];
}>();

const model = defineModel<string>({ required: true });
const scroller = ref<HTMLElement | null>(null);
const indicatorX = ref(0);
const indicatorWidth = ref(0);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
let resizeObserver: ResizeObserver | null = null;

function select(value: string) {
  if (value !== model.value) {
    model.value = value;
  }
}

function updateMetrics() {
  const root = scroller.value;
  if (!root) {
    return;
  }

  const selected = root.querySelector<HTMLElement>('[aria-selected="true"]');
  if (selected) {
    indicatorX.value = selected.offsetLeft;
    indicatorWidth.value = selected.offsetWidth;
  }

  const max = root.scrollWidth - root.clientWidth;
  canScrollLeft.value = root.scrollLeft > 0;
  canScrollRight.value = max > 1 && root.scrollLeft < max - 1;
}

function scrollByPage(direction: -1 | 1) {
  const root = scroller.value;
  if (!root) {
    return;
  }

  root.scrollBy({
    left: direction * Math.max(root.clientWidth * 0.6, 1),
    behavior: 'smooth',
  });
}

function onKeydown(event: KeyboardEvent) {
  const index = props.tabs.findIndex((item) => item.value === model.value);
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    const next = props.tabs[index + 1];
    if (next) {
      select(next.value);
    }
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    const prev = props.tabs[index - 1];
    if (prev) {
      select(prev.value);
    }
  }
}

watch(
  () => [model.value, props.tabs] as const,
  async () => {
    await nextTick();
    updateMetrics();
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  updateMetrics();
  if (typeof ResizeObserver === 'undefined' || !scroller.value) {
    return;
  }

  resizeObserver = new ResizeObserver(() => {
    updateMetrics();
  });
  resizeObserver.observe(scroller.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="a-tab-bar">
    <div
      class="a-tab-bar__viewport"
      :data-overflow-start="canScrollLeft ? '' : undefined"
      :data-overflow-end="canScrollRight ? '' : undefined"
    >
      <AIconButton
        v-if="canScrollLeft"
        class="a-tab-bar__nudge"
        :icon="ChevronLeft"
        label="向左滚动"
        size="small"
        variant="plain"
        side="bottom"
        @click="scrollByPage(-1)"
      />
      <div
        ref="scroller"
        class="a-tab-bar__scroller"
        role="tablist"
        @scroll="updateMetrics"
        @keydown="onKeydown"
      >
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="a-tab-bar__tab"
          :class="{
            'a-tab-bar__tab--selected': tab.value === model,
            'a-tab-bar__tab--actions': tab.renamable || tab.closable,
          }"
          type="button"
          role="tab"
          :aria-selected="tab.value === model"
          :tabindex="tab.value === model ? 0 : -1"
          @click="select(tab.value)"
        >
          <span class="a-tab-bar__label">{{ tab.label }}</span>
          <span v-if="tab.renamable || tab.closable" class="a-tab-bar__actions">
            <AIconButton
              v-if="tab.renamable"
              :icon="Pencil"
              :label="`重命名${tab.label}`"
              size="small"
              @click.stop="emit('rename', tab.value)"
            />
            <AIconButton
              v-if="tab.closable"
              :icon="Trash2"
              :label="`删除${tab.label}`"
              size="small"
              variant="destructive"
              @click.stop="emit('close', tab.value)"
            />
          </span>
        </button>
        <span
          class="a-tab-bar__indicator"
          :style="{
            width: `${indicatorWidth}px`,
            transform: `translateX(${indicatorX}px)`,
          }"
        />
      </div>
      <AIconButton
        v-if="canScrollRight"
        class="a-tab-bar__nudge"
        :icon="ChevronRight"
        label="向右滚动"
        size="small"
        variant="plain"
        side="bottom"
        @click="scrollByPage(1)"
      />
    </div>
    <AIconButton
      v-if="addable"
      :icon="Plus"
      :label="addLabel"
      @click="emit('add')"
    />
  </div>
</template>

<style scoped>
.a-tab-bar {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
}

.a-tab-bar__viewport {
  position: relative;
  display: flex;
  flex: 1;
  gap: var(--space-1);
  align-items: center;
  min-width: 0;
}

.a-tab-bar__scroller {
  position: relative;
  display: flex;
  flex: 1;
  align-items: stretch;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.a-tab-bar__scroller::-webkit-scrollbar {
  display: none;
}

.a-tab-bar__tab {
  position: relative;
  z-index: 1;
  display: inline-flex;
  flex-shrink: 0;
  gap: var(--space-1);
  align-items: center;
  height: var(--control-height-lg);
  padding: 0 var(--space-3);
  font: var(--text-caption);
  color: var(--label-2);
  background: transparent;
  border: 0;
}

.a-tab-bar__tab--selected {
  font-weight: 600;
  color: var(--sys-blue);
}

.a-tab-bar__tab:active {
  opacity: 0.7;
}

.a-tab-bar__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a-tab-bar__actions {
  display: inline-flex;
  opacity: 0;
  transition: opacity var(--dur-1) var(--ease-out);
}

.a-tab-bar__tab:hover .a-tab-bar__actions {
  opacity: 0.35;
}

.a-tab-bar__tab .a-tab-bar__actions:hover {
  opacity: 1;
}

.a-tab-bar__indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  height: var(--space-1);
  pointer-events: none;
  background: var(--sys-blue);
  transition:
    transform var(--dur-2) var(--ease-in-out),
    width var(--dur-2) var(--ease-in-out);
}

.a-tab-bar__nudge {
  z-index: 2;
  flex-shrink: 0;
}

.a-tab-bar__viewport[data-overflow-start] .a-tab-bar__scroller {
  mask-image: linear-gradient(
    to right,
    transparent,
    var(--label) var(--space-5),
    var(--label)
  );
}

.a-tab-bar__viewport[data-overflow-end] .a-tab-bar__scroller {
  mask-image: linear-gradient(
    to left,
    transparent,
    var(--label) var(--space-5),
    var(--label)
  );
}

.a-tab-bar__viewport[data-overflow-start][data-overflow-end] .a-tab-bar__scroller {
  mask-image: linear-gradient(
    to right,
    transparent,
    var(--label) var(--space-5),
    var(--label) calc(100% - var(--space-5)),
    transparent
  );
}

@media (prefers-reduced-motion: reduce) {
  .a-tab-bar__actions,
  .a-tab-bar__indicator {
    transition: none;
  }
}
</style>
