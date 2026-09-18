<script setup lang="ts">
import { computed } from 'vue';

import ASpinner from './ASpinner.vue';
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

function onClick(event: MouseEvent) {
  if (isDisabled.value) {
    event.preventDefault();
    return;
  }

  emit('click', event);
}
</script>

<template>
  <button
    class="a-button"
    :class="[
      `a-button--${variant}`,
      `a-button--${size}`,
      { 'a-button--block': block },
    ]"
    :type="type"
    :disabled="isDisabled"
    :aria-busy="loading ? true : undefined"
    @click="onClick"
  >
    <span class="a-button__spinner" :data-active="loading ? '' : undefined">
      <ASpinner v-if="loading" :size="12" />
    </span>
    <span class="a-button__label"><slot /></span>
  </button>
</template>

<style scoped>
.a-button {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: center;
  min-width: 0;
  border: 0;
  transition:
    background-color var(--dur-1) var(--ease-out),
    color var(--dur-1) var(--ease-out),
    opacity var(--dur-1) var(--ease-out),
    filter var(--dur-1) var(--ease-out);
}

.a-button--small {
  height: var(--control-height-sm);
  padding: 0 var(--control-pad-sm);
  font: var(--text-caption);
  border-radius: var(--radius-sm);
}

.a-button--medium {
  height: var(--control-height-md);
  padding: 0 var(--control-pad-md);
  font: var(--text-control-em);
  border-radius: var(--radius-md);
}

.a-button--large {
  height: var(--control-height-lg);
  padding: 0 var(--control-pad-lg);
  font: var(--text-control-em);
  border-radius: var(--radius-md);
}

.a-button--xlarge {
  height: var(--control-height-xl);
  padding: 0 var(--control-pad-xl);
  font: var(--text-headline);
  letter-spacing: var(--tracking-headline);
  border-radius: var(--radius-lg);
}

.a-button--block {
  width: 100%;
}

.a-button--filled {
  color: var(--label-on-color);
  background: var(--sys-blue-solid);
  box-shadow: var(--shadow-1);
}

.a-button--filled:focus-visible {
  box-shadow: var(--focus-ring-offset), var(--shadow-1);
}

/* 实心按钮禁用时不再把蓝底整体压淡：0.4 透明度下白字落在浅蓝底上几乎读不出。
   改为中性填充 + 正文色（Apple 惯例：禁用态不借用强调色），叠加下方通用的
   0.5 禁用透明度后呈中灰，一眼可辨是禁用、文字仍读得清。 */
.a-button--filled:disabled {
  color: var(--label);
  background: var(--fill-2);
  box-shadow: none;
}

.a-button--filled:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: var(--shadow-2);
}

.a-button--tinted {
  color: var(--sys-blue);
  background: var(--sys-blue-fill);
}

.a-button--tinted:focus-visible {
  box-shadow: var(--focus-ring);
}

.a-button--tinted:hover:not(:disabled) {
  background: var(--sys-blue-fill-strong);
}

.a-button--plain {
  color: var(--label);
  background: var(--bg-content);
  box-shadow: inset 0 0 0 0.5px var(--separator);
}

.a-button--plain:focus-visible {
  box-shadow: var(--focus-ring), inset 0 0 0 0.5px var(--separator);
}

.a-button--plain:hover:not(:disabled) {
  background: var(--fill-4);
}

.a-button--borderless {
  color: var(--sys-blue);
  background: transparent;
}

.a-button--borderless:focus-visible {
  box-shadow: var(--focus-ring);
}

.a-button--borderless:hover:not(:disabled) {
  background: var(--fill-4);
}

.a-button--destructive {
  color: var(--sys-red);
  background: var(--sys-red-fill);
}

.a-button--destructive:focus-visible {
  box-shadow: var(--focus-ring);
}

/* 破坏性按钮禁用时转中性灰，不保留红色警示（Apple 惯例：禁用态不借用强调色） */
.a-button--destructive:disabled {
  color: var(--label-3);
  background: var(--fill-2);
}

.a-button--destructive:hover:not(:disabled) {
  background: var(--sys-red-fill-strong);
}

.a-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.a-button:active:not(:disabled) {
  opacity: 0.7;
}

.a-button__spinner {
  display: inline-grid;
  flex-shrink: 0;
  place-items: center;
  width: 0;
  overflow: hidden;
}

.a-button__spinner[data-active] {
  width: var(--space-4);
}

.a-button__label {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
