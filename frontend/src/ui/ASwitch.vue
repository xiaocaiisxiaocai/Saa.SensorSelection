<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui';

import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    describedBy?: string;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
    size?: 'medium' | 'large';
  }>(),
  {
    size: 'medium',
  },
);

const model = defineModel<boolean>({ default: false });
const { id, describedBy, invalid, required } = useFormControl(props);
</script>

<template>
  <SwitchRoot
    :id="id"
    v-model="model"
    class="a-switch"
    :class="[`a-switch--${size}`, { 'a-switch--invalid': invalid }]"
    :disabled="disabled"
    :aria-invalid="invalid ? true : undefined"
    :aria-required="required ? true : undefined"
    :aria-describedby="describedBy"
  >
    <SwitchThumb class="a-switch__thumb" />
  </SwitchRoot>
</template>

<style scoped>
.a-switch {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  width: var(--switch-track-md-width);
  height: var(--switch-track-md-height);
  padding: var(--switch-inset);
  appearance: none;
  background: var(--fill-1);
  border: 0;
  border-radius: var(--radius-pill);
  transition: background-color var(--dur-2) var(--ease-in-out);
}

.a-switch--large {
  width: var(--switch-track-lg-width);
  height: var(--switch-track-lg-height);
}

.a-switch[data-state='checked'] {
  background: var(--sys-green);
}

.a-switch--invalid {
  box-shadow: inset 0 0 0 1px var(--sys-red);
}

.a-switch:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.a-switch__thumb {
  flex-shrink: 0;
  width: calc(var(--switch-track-md-height) - var(--switch-inset) * 2);
  height: calc(var(--switch-track-md-height) - var(--switch-inset) * 2);
  background: var(--label-on-color);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-2);
  transition: transform var(--dur-2) var(--ease-in-out);
}

.a-switch--large .a-switch__thumb {
  width: calc(var(--switch-track-lg-height) - var(--switch-inset) * 2);
  height: calc(var(--switch-track-lg-height) - var(--switch-inset) * 2);
}

.a-switch[data-state='checked'] .a-switch__thumb {
  transform: translateX(
    calc(var(--switch-track-md-width) - var(--switch-track-md-height))
  );
}

.a-switch--large[data-state='checked'] .a-switch__thumb {
  transform: translateX(
    calc(var(--switch-track-lg-width) - var(--switch-track-lg-height))
  );
}

@media (prefers-reduced-motion: reduce) {
  .a-switch,
  .a-switch__thumb {
    transition: none;
  }
}
</style>
