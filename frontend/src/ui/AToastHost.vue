<script setup lang="ts">
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  X,
} from 'lucide-vue-next';
import { computed } from 'vue';

import AIconButton from './AIconButton.vue';
import type { ToastTone } from './toast';
import { useToastState } from './toast';

const { items, dismiss } = useToastState();

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
  <div class="a-toast-host">
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
        aria-hidden="true"
      />
      <p class="a-toast__message">{{ item.message }}</p>
      <AIconButton
        class="a-toast__close"
        :icon="X"
        label="关闭提示"
        size="small"
        @click="dismiss(item.id)"
      />
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
  /*
   * 底部居中：顶部居中会盖住全局搜索框，右上角会盖住每个页面的主操作按钮
   * （新增要求/新增型号…）。错误提示现在不会自动消失，盖住可点区域就等于
   * 把主操作永久锁死。底部中间左右两侧分别是分页的条数和页码，正中是空的。
   */
  position: fixed;
  bottom: var(--space-5);
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
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  color: var(--label);
  pointer-events: auto;
  background: var(--material-menu-bg);
  border-radius: var(--radius-xl);
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
  flex: 1;
  min-width: 0;
  margin: 0;
  font: var(--text-control);
  color: var(--label);
}

.a-toast__close {
  flex-shrink: 0;
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
