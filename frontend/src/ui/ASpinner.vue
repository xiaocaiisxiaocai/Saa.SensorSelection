<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  size?: number;
}>();

const antdSize = computed(() => {
  if (props.size != null && props.size <= 16) return 'small';
  if (props.size != null && props.size >= 32) return 'large';
  return 'default';
});
</script>

<template>
  <a-spin class="a-spinner" :size="antdSize" />
</template>
