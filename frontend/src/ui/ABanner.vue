<script setup lang="ts">
import type { BannerTone } from './types';

withDefaults(
  defineProps<{
    message: string;
    tone?: BannerTone;
    closable?: boolean;
    actionLabel?: string;
  }>(),
  {
    tone: 'info',
  },
);

const emit = defineEmits<{
  close: [];
  action: [];
}>();
</script>

<template>
  <a-alert
    class="a-banner"
    :type="tone === 'error' ? 'error' : tone"
    :message="message"
    show-icon
    :closable="closable"
    @close="emit('close')"
  >
    <template v-if="actionLabel" #action>
      <a-button size="small" type="link" @click="emit('action')">
        {{ actionLabel }}
      </a-button>
    </template>
  </a-alert>
</template>
