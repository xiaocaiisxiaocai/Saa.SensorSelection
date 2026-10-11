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

.brand-mark--toolbar {
  height: var(--space-7);
}

.brand-mark--login {
  height: var(--space-8);
}
</style>
