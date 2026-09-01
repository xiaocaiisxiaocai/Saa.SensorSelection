<script setup lang="ts">
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
} from 'lucide-vue-next';
import { computed } from 'vue';

import type { ToastTone } from './toast';
import { useToastState } from './toast';

const { items } = useToastState();

const livePolite = computed(() =>
  items.value.filter((item) => item.tone !== 'error'),
);
const liveAssertive = computed(() =>
  items.value.filter((item) => item.tone === 'error'),
);

const icons: Record<ToastTone, typeof CircleCheck> = {
  success: CircleCheck,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};
</script>

<template>
  <div class="a-toast-host" aria-hidden="true">
    <div
      v-for="item in items"
      :key="item.id"
      class="a-toast"
      :class="`a-toast--${item.tone}`"
    >
      <component
        :is="icons[item.tone]"
        class="a-toast__icon"
        :size="16"
        :stroke-width="1.5"
      />
      <p class="a-toast__message">{{ item.message }}</p>
    </div>
  </div>
  <div class="visually-hidden" aria-live="polite" aria-atomic="true">
    {{ livePolite.map((item) => item.message).join(' ') }}
  </div>
  <div class="visually-hidden" aria-live="assertive" aria-atomic="true">
    {{ liveAssertive.map((item) => item.message).join(' ') }}
  </div>
</template>

<style>
.a-toast-host {
  position: fixed;
  top: var(--space-3);
  left: 50%;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: center;
  pointer-events: none;
  transform: translateX(-50%);
}

.a-toast {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  max-width: min(24rem, calc(100vw - var(--space-8)));
  padding: var(--space-2) var(--space-4);
  color: var(--label);
  background: var(--material-menu-bg);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-3), inset 0 0 0 0.5px var(--separator);
  backdrop-filter: var(--material-blur);
  -webkit-backdrop-filter: var(--material-blur);
  animation: a-toast-in var(--dur-2) var(--ease-out);
}

.a-toast--success {
  color: var(--sys-green);
}

.a-toast--error {
  color: var(--sys-red);
}

.a-toast--warning {
  color: var(--sys-orange);
}

.a-toast--info {
  color: var(--sys-blue);
}

.a-toast__icon {
  flex-shrink: 0;
}

.a-toast__message {
  margin: 0;
  font: var(--text-control);
  color: var(--label);
}

@keyframes a-toast-in {
  from {
    opacity: 0;
    transform: translateY(calc(var(--space-3) * -1));
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .a-toast {
    animation: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .a-toast {
    background: var(--bg-elevated);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
