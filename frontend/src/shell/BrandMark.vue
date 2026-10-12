<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'toolbar';
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

<style scoped src="./BrandMark.css"></style>
