<script setup lang="ts">
import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    describedBy?: string;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
    max?: number;
    min?: number;
    step?: number;
  }>(),
  {
    step: 1,
  },
);

const model = defineModel<number>({ default: 0 });
const { id, describedBy, invalid } = useFormControl(props);
</script>

<template>
  <a-input-number
    :id="id"
    v-model:value="model"
    :aria-describedby="describedBy"
    :disabled="disabled"
    :max="max"
    :min="min"
    :status="invalid ? 'error' : ''"
    :step="step"
    style="width: 100%"
  />
</template>
