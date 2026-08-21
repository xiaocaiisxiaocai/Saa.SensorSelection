<script setup lang="ts">
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui';

import type { PopoverSide } from './types';

withDefaults(
  defineProps<{
    content?: string;
    side?: PopoverSide;
    disabled?: boolean;
  }>(),
  {
    side: 'top',
  },
);

const open = defineModel<boolean>('open');
</script>

<template>
  <TooltipProvider
    :delay-duration="500"
    :skip-delay-duration="100"
    ignore-non-keyboard-focus
  >
    <TooltipRoot
      v-model:open="open"
      :disabled="disabled"
      ignore-non-keyboard-focus
    >
      <TooltipTrigger as-child>
        <slot name="trigger" />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          v-if="content || $slots.default"
          class="a-tooltip"
          :side="side"
          :side-offset="8"
          :collision-padding="8"
        >
          <slot>{{ content }}</slot>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<style>
/* Teleported to document.body — do not scope. */
.a-tooltip {
  z-index: var(--z-toast);
  max-width: min(36rem, calc(100vw - var(--space-8)));
  padding: var(--space-1) var(--space-3);
  overflow: hidden;
  font: var(--text-caption);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--label);
  letter-spacing: var(--tracking-caption);
  background: var(--material-menu-bg);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-2), inset 0 0 0 0.5px var(--separator);
  backdrop-filter: var(--material-blur);
  -webkit-backdrop-filter: var(--material-blur);
  transform-origin: var(--reka-tooltip-content-transform-origin);
}

.a-tooltip[data-state='delayed-open'],
.a-tooltip[data-state='instant-open'] {
  animation: a-tooltip-in var(--dur-1) var(--ease-out);
}

@keyframes a-tooltip-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .a-tooltip[data-state='delayed-open'],
  .a-tooltip[data-state='instant-open'] {
    animation: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .a-tooltip {
    background: var(--bg-elevated);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
