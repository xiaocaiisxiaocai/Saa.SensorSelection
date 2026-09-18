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
    :aria-label="active ? '重置筛选' : '当前没有已应用的筛选条件'"
    :title="active ? undefined : '当前没有已应用的筛选条件'"
    @click="emit('reset')"
  >
    <RotateCcw :size="14" :stroke-width="1.5" aria-hidden="true" />
    重置
  </AButton>
</template>
