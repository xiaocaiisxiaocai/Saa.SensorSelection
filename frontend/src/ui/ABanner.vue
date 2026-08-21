<script setup lang="ts">
import { CircleAlert, Info, WifiOff, X } from 'lucide-vue-next';
import { computed } from 'vue';

import AButton from './AButton.vue';
import AIconButton from './AIconButton.vue';
import type { BannerTone } from './types';

const props = withDefaults(
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

const icon = computed(() => {
  if (props.tone === 'warning') {
    return WifiOff;
  }
  if (props.tone === 'error') {
    return CircleAlert;
  }
  return Info;
});
</script>

<template>
  <div
    class="a-banner"
    :class="`a-banner--${tone}`"
    role="status"
  >
    <component
      :is="icon"
      class="a-banner__icon"
      :size="16"
      :stroke-width="1.5"
      aria-hidden="true"
    />
    <p class="a-banner__message">{{ message }}</p>
    <AButton
      v-if="actionLabel"
      size="small"
      variant="tinted"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </AButton>
    <AIconButton
      v-if="closable"
      :icon="X"
      label="关闭"
      size="small"
      @click="emit('close')"
    />
  </div>
</template>

<style scoped>
.a-banner {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) var(--space-4);
  font: var(--text-control);
  border-radius: var(--radius-md);
}

.a-banner--info {
  color: var(--sys-blue);
  background: var(--sys-blue-fill);
}

.a-banner--warning {
  color: var(--sys-orange);
  background: var(--sys-orange-fill);
}

.a-banner--error {
  color: var(--sys-red);
  background: var(--sys-red-fill);
}

.a-banner__icon {
  flex-shrink: 0;
}

.a-banner__message {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--label);
}
</style>
