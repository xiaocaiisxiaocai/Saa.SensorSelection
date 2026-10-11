<script setup lang="ts">
import { computed } from 'vue';

import type { ControlSize, SelectOption } from './types';
import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    options: SelectOption[];
    placeholder?: string;
    filterable?: boolean;
    maxVisibleTokens?: number;
    size?: ControlSize;
    describedBy?: string;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
    ariaLabel?: string;
  }>(),
  {
    placeholder: '请选择',
    size: 'medium',
  },
);

const model = defineModel<Array<string | number>>({ default: () => [] });
const { id, describedBy, invalid, hasFormLabel } = useFormControl(props);
const antdSize = computed(() => (props.size === 'small' ? 'small' : 'middle'));
const accessibleLabel = computed(
  () => props.ariaLabel ?? (hasFormLabel.value ? undefined : props.placeholder),
);
const selectOptions = computed(() =>
  props.options.map((option) => ({
    label: option.label,
    value: option.value,
    disabled: option.disabled,
  })),
);
</script>

<template>
  <a-select
    :id="id"
    v-model:value="model"
    class="a-token-field"
    mode="multiple"
    :aria-describedby="describedBy"
    :aria-invalid="invalid ? true : undefined"
    :aria-label="accessibleLabel"
    :disabled="disabled"
    :max-tag-count="maxVisibleTokens ?? 'responsive'"
    :options="selectOptions"
    :placeholder="placeholder"
    :show-search="filterable !== false"
    :size="antdSize"
    :status="invalid ? 'error' : ''"
    option-filter-prop="label"
    style="width: 100%"
  />
</template>
