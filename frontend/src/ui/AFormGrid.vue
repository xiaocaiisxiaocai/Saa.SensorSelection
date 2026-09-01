<script setup lang="ts">
withDefaults(
  defineProps<{
    columns?: 1 | 2 | 3;
  }>(),
  {
    columns: 2,
  },
);
</script>

<template>
  <div class="a-form-grid" :class="`a-form-grid--${columns}`">
    <slot />
  </div>
</template>

<style scoped>
.a-form-grid {
  display: grid;
  gap: var(--space-4);
  width: 100%;
  min-width: 0;
}

.a-form-grid--1 {
  grid-template-columns: 1fr;
}

.a-form-grid--2 {
  grid-template-columns: 1fr 1fr;
}

.a-form-grid--3 {
  grid-template-columns: 1fr 1fr 1fr;
}

@media (width < 45rem) {
  .a-form-grid--2,
  .a-form-grid--3 {
    grid-template-columns: 1fr;
  }
}
</style>
