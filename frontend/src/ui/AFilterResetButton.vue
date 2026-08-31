<script setup lang="ts">
import { RotateCcw } from 'lucide-vue-next';

import AButton from './AButton.vue';

withDefaults(defineProps<{ active?: boolean }>(), {
  active: false,
});

const emit = defineEmits<{
  reset: [];
}>();
</script>

<template>
  <AButton
    variant="plain"
    :disabled="!active"
    aria-label="重置筛选"
    @click="emit('reset')"
  >
    <RotateCcw :size="14" :stroke-width="1.5" aria-hidden="true" />
    重置
  </AButton>
</template>
