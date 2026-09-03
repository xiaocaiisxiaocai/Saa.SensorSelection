<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { computed } from 'vue';
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from 'reka-ui';

import AIconButton from './AIconButton.vue';

const props = withDefaults(
  defineProps<{
    title: string;
    width?: number | string;
    closeOnOverlay?: boolean;
    viewport?: boolean;
  }>(),
  {
    closeOnOverlay: true,
    viewport: false,
  },
);

const open = defineModel<boolean>('open', { default: false });

const panelWidth = computed(() => {
  if (props.viewport) {
    return 'calc(100vw - var(--space-8))';
  }

  if (props.width == null) {
    return 'calc(var(--space-9) * 13)';
  }

  return typeof props.width === 'number' ? `${props.width}px` : props.width;
});

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function onDismissOutside(event: Event) {
  if (!props.closeOnOverlay) {
    event.preventDefault();
  }
}

function onOpenAutoFocus(event: Event) {
  event.preventDefault();
  const sheet =
    event.target instanceof HTMLElement
      ? (event.target.closest('.a-sheet') ?? event.target)
      : null;
  const next = sheet
    ?.querySelector<HTMLElement>('.a-sheet__body')
    ?.querySelector<HTMLElement>(FOCUSABLE);
  (next ?? (sheet instanceof HTMLElement ? sheet : null))?.focus();
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="a-sheet__overlay" />
      <DialogContent
        class="a-sheet"
        :class="{ 'a-sheet--viewport': viewport }"
        aria-modal="true"
        :aria-describedby="undefined"
        :style="{ width: panelWidth }"
        @open-auto-focus="onOpenAutoFocus"
        @pointer-down-outside="onDismissOutside"
        @interact-outside="onDismissOutside"
      >
        <header class="a-sheet__header">
          <DialogTitle class="a-sheet__title">{{ title }}</DialogTitle>
          <span class="a-sheet__close">
            <AIconButton :icon="X" label="关闭" @click="open = false" />
          </span>
        </header>
        <div class="a-sheet__body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="a-sheet__footer">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
/* Teleported to document.body — do not scope. */
.a-sheet {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: var(--z-overlay);
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - var(--space-8));
  max-height: calc(100dvh - var(--space-9));
  overflow: hidden;
  color: var(--label);
  background: var(--bg-elevated);
  border-radius: var(--radius-2xl);
  box-shadow:
    var(--shadow-4),
    inset 0 0 0 0.5px var(--separator);
  transform: translate(-50%, -50%);
}

.a-sheet[data-state='open'] {
  animation: a-sheet-in var(--dur-3) var(--ease-sheet);
}

.a-sheet--viewport {
  height: calc(100dvh - var(--space-8));
  max-height: calc(100dvh - var(--space-8));
}

.a-sheet__header {
  position: relative;
  display: grid;
  flex-shrink: 0;
  place-items: center;
  min-height: var(--row-height-loose);
  padding: var(--space-3) var(--space-8);
}

.a-sheet__title {
  margin: 0;
  font: var(--text-headline);
  font-weight: 600;
  letter-spacing: var(--tracking-title-2);
  text-align: center;
}

.a-sheet__close {
  position: absolute;
  top: 50%;
  right: var(--space-4);
  transform: translateY(-50%);
}

.a-sheet__body {
  min-width: 0;
  min-height: 0;
  padding: var(--space-5);
  overflow: hidden auto;
}

.a-sheet__footer {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-3);
  align-items: center;
  justify-content: flex-end;
  padding: var(--space-4) var(--space-5);
}

.a-sheet--viewport .a-sheet__body {
  display: flex;
  flex: 1;
  padding: var(--space-3);
  overflow: hidden;
}

.a-sheet--viewport .a-pdf-viewer {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
