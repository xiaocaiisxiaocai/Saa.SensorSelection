<script setup lang="ts">
import { computed } from 'vue';

import type { BadgeTone } from './types';

const props = withDefaults(
  defineProps<{
    label: string;
    tone?: BadgeTone;
  }>(),
  {
    tone: 'neutral',
  },
);

const color = computed(() => {
  switch (props.tone) {
    case 'blue':
      return 'blue';
    case 'green':
      return 'green';
    case 'orange':
      return 'orange';
    case 'red':
      return 'red';
    case 'yellow':
      return 'gold';
    case 'indigo':
      return 'purple';
    default:
      return 'default';
  }
});
</script>

<template>
  <a-tag class="a-badge" :class="`a-badge--${tone}`" :color="color">
    {{ label }}
  </a-tag>
</template>
