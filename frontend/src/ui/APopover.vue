<script setup lang="ts">
import {
  PopoverArrow,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';

import type { PopoverAlign, PopoverSide } from './types';

withDefaults(
  defineProps<{
    side?: PopoverSide;
    align?: PopoverAlign;
    arrow?: boolean;
    modal?: boolean;
    matchTriggerWidth?: boolean;
    minTriggerWidth?: boolean;
  }>(),
  {
    side: 'bottom',
    align: 'center',
  },
);

const open = defineModel<boolean>('open');
</script>

<template>
  <PopoverRoot v-model:open="open" :modal="modal">
    <PopoverTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        class="a-popover"
        :class="{
          'a-popover--match-trigger': matchTriggerWidth,
          'a-popover--min-trigger': minTriggerWidth,
        }"
        :side="side"
        :align="align"
        :side-offset="8"
        :collision-padding="8"
      >
        <div class="a-popover__body">
          <slot />
        </div>
        <PopoverArrow v-if="arrow" class="a-popover__arrow" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
/* Teleported to document.body — do not scope. */
.a-popover {
  display: flex;
  z-index: var(--z-popover);
  flex-direction: column;
  min-width: var(--space-8);
  max-width: min(24rem, calc(100vw - var(--space-8)));
  max-height: min(
    calc(var(--space-9) * 8),
    var(--reka-popover-content-available-height, 100vh)
  );
  overflow: visible;
  color: var(--label);
  background: var(--material-menu-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-3), inset 0 0 0 0.5px var(--separator);
  backdrop-filter: var(--material-blur);
  -webkit-backdrop-filter: var(--material-blur);
  transform-origin: var(--reka-popover-content-transform-origin);
}

.a-popover--match-trigger {
  width: var(--reka-popover-trigger-width);
  min-width: var(--reka-popover-trigger-width);
  max-width: min(
    var(--reka-popover-trigger-width),
    calc(100vw - var(--space-8))
  );
}

.a-popover--min-trigger {
  width: max-content;
  min-width: min(
    max(var(--reka-popover-trigger-width), 10rem),
    calc(100vw - var(--space-8))
  );
}

.a-popover__body {
  min-width: 0;
  min-height: 0;
  padding: var(--space-3);
  overflow: hidden auto;
}

.a-popover[data-state='open'] {
  animation: a-popover-in var(--dur-2) var(--ease-out);
}

.a-popover__arrow {
  fill: var(--material-menu-bg);
}

@keyframes a-popover-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .a-popover[data-state='open'] {
    animation: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .a-popover {
    background: var(--bg-elevated);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
