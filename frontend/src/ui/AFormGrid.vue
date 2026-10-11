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

  /* 行距小、列距大：每个 AFormRow 底部已固定预留一行校验提示的高度，
     再叠 12px 行距会让「字段之间」远大于「标签与字段」，节奏发散。 */
  gap: var(--space-2) var(--space-4);
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
