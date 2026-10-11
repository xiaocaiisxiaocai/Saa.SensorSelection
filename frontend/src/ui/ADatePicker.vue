<script setup lang="ts">
import { DatePicker as AntDatePicker } from 'ant-design-vue';
import { computed } from 'vue';

import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    range?: boolean;
    placeholder?: string | [string, string];
    clearable?: boolean;
    describedBy?: string;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
  }>(),
  {
    clearable: true,
  },
);

const model = defineModel<string | [string | null, string | null] | null>({
  default: null,
});
const { id, describedBy, invalid } = useFormControl(props);

const singleValue = computed({
  get: () => (typeof model.value === 'string' ? model.value : undefined),
  set: (value: string | undefined) => {
    model.value = value || null;
  },
});

const rangeValue = computed({
  get: () => {
    if (!Array.isArray(model.value)) return undefined;
    const [start, end] = model.value;
    if (!start && !end) return undefined;
    return [start ?? '', end ?? ''] as [string, string];
  },
  set: (value: [string, string] | undefined) => {
    model.value = value ? [value[0] || null, value[1] || null] : null;
  },
});

const singlePlaceholder = computed(() =>
  typeof props.placeholder === 'string' ? props.placeholder : '选择日期',
);
</script>

<template>
  <a-range-picker
    v-if="range"
    :id="id"
    v-model:value="rangeValue"
    class="a-date-picker"
    :allow-clear="clearable"
    :aria-describedby="describedBy"
    :disabled="disabled"
    :placeholder="Array.isArray(placeholder) ? placeholder : ['开始日期', '结束日期']"
    :status="invalid ? 'error' : ''"
    value-format="YYYY-MM-DD"
    style="width: 100%"
  />
  <AntDatePicker
    v-else
    :id="id"
    v-model:value="singleValue"
    class="a-date-picker"
    :allow-clear="clearable"
    :aria-describedby="describedBy"
    :disabled="disabled"
    :placeholder="singlePlaceholder"
    :status="invalid ? 'error' : ''"
    value-format="YYYY-MM-DD"
    style="width: 100%"
  />
</template>
