<script setup lang="ts">
import { ref } from 'vue';

import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    describedBy?: string;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
    maxlength?: number;
    placeholder?: string;
    rows?: number;
  }>(),
  {
    rows: 3,
  },
);

const model = defineModel<string>({ default: '' });
const { id, describedBy, invalid } = useFormControl(props);
const area = ref<{ focus: () => void } | null>(null);

defineExpose({
  focus: () => area.value?.focus(),
});
</script>

<template>
  <a-textarea
    :id="id"
    ref="area"
    v-model:value="model"
    :aria-describedby="describedBy"
    :aria-invalid="invalid ? true : undefined"
    :disabled="disabled"
    :maxlength="maxlength"
    :placeholder="placeholder"
    :rows="rows"
    :show-count="Boolean(maxlength)"
    :status="invalid ? 'error' : ''"
  />
</template>
