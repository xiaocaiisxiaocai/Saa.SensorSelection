<script setup lang="ts">
import { Button as AntButton } from 'ant-design-vue';
import { computed } from 'vue';

import type { ButtonSize, ButtonVariant } from './types';

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
    type?: 'button' | 'submit';
  }>(),
  {
    variant: 'plain',
    size: 'medium',
    type: 'button',
  },
);

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

const isDisabled = computed(() => Boolean(props.disabled || props.loading));
const antdType = computed(() => {
  if (props.variant === 'filled' || props.variant === 'destructive') {
    return 'primary';
  }
  if (props.variant === 'borderless') return 'text';
  return 'default';
});
const antdSize = computed(() => {
  if (props.size === 'small') return 'small';
  if (props.size === 'medium') return 'middle';
  return 'large';
});

function onClick(event: MouseEvent) {
  if (isDisabled.value) {
    event.preventDefault();
    return;
  }
  emit('click', event);
}
</script>

<template>
  <AntButton
    class="a-button"
    :class="[
      `a-button--${variant}`,
      `a-button--${size}`,
      { 'a-button--block': block },
    ]"
    :type="antdType"
    :danger="variant === 'destructive'"
    :size="antdSize"
    :block="block"
    :html-type="type"
    :loading="loading"
    :disabled="disabled"
    :aria-busy="loading ? true : undefined"
    @click="onClick"
  >
    <span class="a-button__label"><slot /></span>
  </AntButton>
</template>

<style scoped>
.a-button__label {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
}
</style>
