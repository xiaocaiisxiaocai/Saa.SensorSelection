<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'toolbar' | 'login';
  }>(),
  { size: 'toolbar' },
);
</script>

<template>
  <span class="brand-mark" :class="`brand-mark--${size}`" aria-hidden="true">SAA</span>
</template>

<style scoped>
.brand-mark {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  overflow: hidden;
  font-weight: 700;
  color: var(--label-on-color);
  letter-spacing: var(--tracking-headline);
  user-select: none;
  background: linear-gradient(165deg, var(--sys-blue), var(--sys-indigo));
}

.brand-mark--toolbar {
  width: var(--control-height-lg);
  height: var(--control-height-lg);
  font: var(--text-control-em);
  font-weight: 700;
  border-radius: var(--radius-md);
}

.brand-mark--login {
  width: calc(var(--space-8) + var(--space-7));
  height: calc(var(--space-8) + var(--space-7));
  font: var(--text-title-2);
  font-weight: 700;
  letter-spacing: var(--tracking-title-2);
  border-radius: var(--radius-xl);
}
</style>
