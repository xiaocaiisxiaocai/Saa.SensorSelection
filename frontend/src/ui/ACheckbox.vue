<script setup lang="ts">
import { Checkbox as AntCheckbox } from 'ant-design-vue';

const props = defineProps<{
  disabled?: boolean;
  ariaLabel?: string;
}>();

const model = defineModel<boolean | 'indeterminate'>({ default: false });

function onChange(event: { target: { checked: boolean } }) {
  model.value = Boolean(event.target.checked);
}

function onClick(event: MouseEvent) {
  if (props.disabled || event.isTrusted) return;
  model.value = model.value !== true;
}
</script>

<template>
  <AntCheckbox
    :checked="model === true"
    :indeterminate="model === 'indeterminate'"
    :disabled="disabled"
    :aria-label="props.ariaLabel"
    role="checkbox"
    @change="onChange"
    @click="onClick"
  >
    <slot />
  </AntCheckbox>
</template>
