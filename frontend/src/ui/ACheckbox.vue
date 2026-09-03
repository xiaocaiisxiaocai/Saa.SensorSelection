<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui';

import { useFormControl } from './use-form-control';

const props = defineProps<{
  describedBy?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
}>();

const model = defineModel<boolean | 'indeterminate'>({ default: false });
const { id, describedBy, invalid, required } = useFormControl(props);
</script>

<template>
  <CheckboxRoot
    :id="id"
    v-model="model"
    class="a-checkbox"
    :class="{ 'a-checkbox--invalid': invalid }"
    :disabled="disabled"
    :aria-invalid="invalid ? true : undefined"
    :aria-required="required ? true : undefined"
    :aria-describedby="describedBy"
  >
    <CheckboxIndicator class="a-checkbox__indicator">
      <svg
        class="a-checkbox__icon"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <path
          v-if="model === 'indeterminate'"
          d="M3.5 8h9"
          fill="none"
          stroke="currentcolor"
          stroke-linecap="round"
          stroke-width="1.5"
        />
        <path
          v-else
          class="a-checkbox__check"
          d="M3.8 8.6 6.8 11.6 12.4 5.2"
          fill="none"
          stroke="currentcolor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
        />
      </svg>
    </CheckboxIndicator>
  </CheckboxRoot>
</template>

<style scoped>
.a-checkbox {
  display: inline-grid;
  place-items: center;
  width: var(--space-5);
  height: var(--space-5);
  padding: 0;
  color: var(--label-on-color);
  line-height: 0;
  appearance: none;
  background: var(--bg-content);
  border: 0;
  border-radius: var(--radius-xs);
  box-shadow: inset 0 0 0 1px var(--control-stroke);
  transition:
    background-color var(--dur-1) var(--ease-out),
    box-shadow var(--dur-1) var(--ease-out);
}

.a-checkbox[data-state='checked'],
.a-checkbox[data-state='indeterminate'] {
  background: var(--sys-blue-solid);
  box-shadow: none;
}

.a-checkbox--invalid {
  box-shadow: inset 0 0 0 1px var(--sys-red);
}

.a-checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.a-checkbox__indicator {
  display: grid;
  place-items: center;
  width: var(--space-5);
  height: var(--space-5);
  line-height: 0;
}

.a-checkbox__icon {
  display: block;
  width: var(--space-5);
  height: var(--space-5);
}

.a-checkbox__check {
  stroke-dasharray: 16;
  stroke-dashoffset: 16;
  animation: a-check-draw var(--dur-1) var(--ease-out) forwards;
}

@keyframes a-check-draw {
  to {
    stroke-dashoffset: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .a-checkbox__check {
    stroke-dashoffset: 0;
    animation: none;
  }
}
</style>
