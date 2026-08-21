<script setup lang="ts">
import type { SpinnerSize } from './types';

withDefaults(
  defineProps<{
    size?: SpinnerSize;
  }>(),
  {
    size: 16,
  },
);

const spokes = [0, 1, 2, 3, 4, 5, 6, 7];
</script>

<template>
  <span
    class="a-spinner"
    :class="`a-spinner--${size}`"
    role="status"
    aria-label="加载中"
  >
    <span
      v-for="index in spokes"
      :key="index"
      class="a-spinner__spoke"
      :style="{ '--spoke-index': index }"
    />
  </span>
</template>

<style scoped>
.a-spinner {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
  color: currentcolor;
}

.a-spinner--12 {
  width: var(--space-4);
  height: var(--space-4);
}

.a-spinner--16 {
  width: var(--space-5);
  height: var(--space-5);
}

.a-spinner--24 {
  width: var(--space-7);
  height: var(--space-7);
}

.a-spinner--32 {
  width: var(--space-8);
  height: var(--space-8);
}

.a-spinner__spoke {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  opacity: 0.2;
  transform: rotate(calc(var(--spoke-index) * 45deg));
  animation: a-spoke-fade var(--dur-spin) linear infinite;
  animation-delay: calc(var(--spoke-index) * var(--dur-spin) / -8);
}

.a-spinner__spoke::before {
  display: block;
  width: 12.5%;
  height: 28%;
  content: '';
  background: currentcolor;
  border-radius: var(--radius-pill);
}

@keyframes a-spoke-fade {
  0% {
    opacity: 1;
  }

  100% {
    opacity: 0.15;
  }
}

@media (prefers-reduced-motion: reduce) {
  .a-spinner__spoke {
    animation: none;
    opacity: calc(0.2 + (7 - var(--spoke-index)) * 0.1);
  }
}
</style>
