<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'toolbar' | 'login';
  }>(),
  { size: 'toolbar' },
);
</script>

<template>
  <img
    class="brand-mark"
    :class="`brand-mark--${size}`"
    src="/logo-saa.png"
    alt=""
    aria-hidden="true"
    draggable="false"
  >
</template>

<style scoped>
.brand-mark {
  display: block;
  flex-shrink: 0;
  width: auto;
  object-fit: contain;
  user-select: none;
}

/* 标志是单色深蓝 PNG，放在暗色背景上几乎看不见；暗色主题用反白标志 */
:root[data-theme='dark'] .brand-mark {
  filter: brightness(0) invert(1);
}

.brand-mark--toolbar {
  height: var(--space-7);
}

.brand-mark--login {
  height: var(--space-8);
}
</style>
