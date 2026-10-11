<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <a-empty class="a-empty-state">
    <template #description>
      <template v-if="description">
        <div>{{ title }}</div>
        <div>{{ description }}</div>
      </template>
      <template v-else>{{ title }}</template>
    </template>
    <slot name="action" />
  </a-empty>
</template>
