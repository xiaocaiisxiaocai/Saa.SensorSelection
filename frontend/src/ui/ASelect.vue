<script setup lang="ts">
import { Select as AntSelect } from 'ant-design-vue';
import { computed } from 'vue';

import type { ControlSize, SelectOption } from './types';
import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    options: SelectOption[];
    placeholder?: string;
    filterable?: boolean;
    clearable?: boolean;
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

const model = defineModel<string | number | null>({ default: null });
const { id, describedBy, invalid, hasFormLabel } = useFormControl(props);

const antdSize = computed(() => (props.size === 'small' ? 'small' : 'middle'));
const accessibleLabel = computed(
  () => props.ariaLabel ?? (hasFormLabel.value ? undefined : props.placeholder),
);
const selectOptions = computed(() =>
  props.options.map((option) => ({
    label: option.hint ? `${option.label}（${option.hint}）` : option.label,
    value: option.value,
    disabled: option.disabled,
  })),
);
const selectValue = computed(() =>
  model.value == null ? undefined : model.value,
);

function onSelectValue(value: unknown) {
  model.value =
    typeof value === 'string' || typeof value === 'number' ? value : null;
}
</script>

<template>
  <AntSelect
    :id="id"
    :value="selectValue"
    class="a-select"
    :allow-clear="clearable"
    :aria-describedby="describedBy"
    :aria-invalid="invalid ? true : undefined"
    :aria-label="accessibleLabel"
    :disabled="disabled"
    :options="selectOptions"
    :placeholder="placeholder"
    :show-search="filterable"
    :size="antdSize"
    :status="invalid ? 'error' : ''"
    option-filter-prop="label"
    style="width: 100%"
    @update:value="onSelectValue"
  />
</template>
