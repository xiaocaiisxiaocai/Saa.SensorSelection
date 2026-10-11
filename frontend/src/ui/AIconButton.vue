<script setup lang="ts">
import type { Component } from 'vue';
import { computed, markRaw } from 'vue';

import type { IconButtonSize, IconButtonVariant, PopoverSide } from './types';

const props = withDefaults(
  defineProps<{
    icon: Component;
    label: string;
    variant?: IconButtonVariant;
    size?: IconButtonSize;
    side?: PopoverSide;
    disabled?: boolean;
    disabledReason?: string;
  }>(),
  {
    variant: 'borderless',
    size: 'medium',
    side: 'top',
  },
);

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

if (import.meta.env.DEV && props.label.trim() === '') {
  throw new Error('AIconButton: label is required');
}

const explainDisabled = computed(
  () => Boolean(props.disabled && props.disabledReason?.trim()),
);
const tooltip = computed(() =>
  explainDisabled.value ? props.disabledReason : props.label,
);
const resolvedIcon = computed(() => markRaw(props.icon));
const antdSize = computed(() => (props.size === 'small' ? 'small' : 'middle'));

function onClick(event: MouseEvent) {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  emit('click', event);
}
</script>

<template>
  <a-tooltip :title="tooltip" :placement="side">
    <a-button
      class="a-icon-button"
      type="text"
      :danger="variant === 'destructive'"
      :size="antdSize"
      shape="circle"
      :aria-label="
        explainDisabled ? `${label}（${disabledReason}）` : label
      "
      :disabled="disabled && !explainDisabled"
      :aria-disabled="explainDisabled ? true : undefined"
      @click="onClick"
    >
      <component :is="resolvedIcon" :size="size === 'small' ? 14 : 16" />
    </a-button>
  </a-tooltip>
</template>
