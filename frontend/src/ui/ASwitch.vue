<script setup lang="ts">
import { Switch as AntSwitch } from 'ant-design-vue';

import { useFormControl } from './use-form-control';

const props = defineProps<{
  describedBy?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  ariaLabel?: string;
}>();

const model = defineModel<boolean>({ default: false });
const { id, describedBy } = useFormControl(props);
</script>

<template>
  <AntSwitch
    :id="id"
    v-model:checked="model"
    :aria-describedby="describedBy"
    :aria-label="ariaLabel"
    :disabled="disabled"
  />
</template>
