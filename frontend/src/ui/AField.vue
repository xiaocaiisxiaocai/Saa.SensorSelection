<script setup lang="ts">
import type { Component } from 'vue';
import { computed, markRaw, ref } from 'vue';

import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    ariaLabel?: string;
    autocomplete?: string;
    clearable?: boolean;
    describedBy?: string;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
    maxlength?: number;
    placeholder?: string;
    prefixIcon?: Component;
    showCount?: boolean;
    type?: 'text' | 'password';
  }>(),
  {
    clearable: true,
    showCount: true,
    type: 'text',
  },
);

const model = defineModel<string>({ default: '' });
const { id, describedBy, invalid } = useFormControl(props);
const inputRef = ref<{ focus: () => void } | null>(null);
const resolvedPrefix = computed(() =>
  props.prefixIcon ? markRaw(props.prefixIcon) : undefined,
);

defineExpose({
  focus: () => inputRef.value?.focus(),
});
</script>

<template>
  <a-input-password
    v-if="type === 'password'"
    :id="id"
    ref="inputRef"
    v-model:value="model"
    :allow-clear="clearable"
    :autocomplete="autocomplete"
    :aria-describedby="describedBy"
    :aria-invalid="invalid ? true : undefined"
    :aria-label="ariaLabel"
    :disabled="disabled"
    :maxlength="maxlength"
    :placeholder="placeholder"
    :status="invalid ? 'error' : ''"
  >
    <template #iconRender="visible">
      <span :aria-label="visible ? '隐藏密码' : '显示密码'">
        {{ visible ? '隐藏' : '显示' }}
      </span>
    </template>
  </a-input-password>
  <a-input
    v-else
    :id="id"
    ref="inputRef"
    v-model:value="model"
    :allow-clear="clearable"
    :autocomplete="autocomplete"
    :aria-describedby="describedBy"
    :aria-invalid="invalid ? true : undefined"
    :aria-label="ariaLabel"
    :disabled="disabled"
    :maxlength="maxlength"
    :placeholder="placeholder"
    :show-count="Boolean(showCount && maxlength)"
    :status="invalid ? 'error' : ''"
  >
    <template v-if="resolvedPrefix" #prefix>
      <component :is="resolvedPrefix" :size="16" />
    </template>
  </a-input>
</template>
