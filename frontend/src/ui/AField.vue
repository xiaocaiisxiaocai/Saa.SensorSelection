<script setup lang="ts">
import { Eye, EyeOff, X } from 'lucide-vue-next';
import type { Component } from 'vue';
import { computed, markRaw, ref } from 'vue';

import AIconButton from './AIconButton.vue';
import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    autocomplete?: string;
    clearable?: boolean;
    describedBy?: string;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
    maxlength?: number;
    placeholder?: string;
    prefixIcon?: Component;
    type?: 'text' | 'password';
  }>(),
  {
    clearable: true,
    type: 'text',
  },
);

const model = defineModel<string>({ default: '' });
const { id, describedBy, invalid, required } = useFormControl(props);

const focused = ref(false);
const hovered = ref(false);
const revealing = ref(false);

const inputType = computed(() =>
  props.type === 'password' && !revealing.value ? 'password' : 'text',
);
const resolvedPrefix = computed(() =>
  props.prefixIcon ? markRaw(props.prefixIcon) : undefined,
);
const showClear = computed(
  () =>
    props.clearable &&
    !props.disabled &&
    model.value.length > 0 &&
    (focused.value || hovered.value),
);
const showCount = computed(() => {
  if (!props.maxlength) {
    return false;
  }

  return (
    focused.value || model.value.length / props.maxlength > 0.8
  );
});

function clear() {
  model.value = '';
}
</script>

<template>
  <div
    class="a-control"
    :class="{
      'a-control--disabled': disabled,
      'a-control--invalid': invalid,
    }"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <component
      :is="resolvedPrefix"
      v-if="resolvedPrefix"
      class="a-field__prefix"
      :size="18"
      :stroke-width="1.5"
    />
    <input
      :id="id"
      class="a-control__input"
      :type="inputType"
      :value="model"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :maxlength="maxlength"
      :disabled="disabled"
      :aria-invalid="invalid ? true : undefined"
      :aria-required="required ? true : undefined"
      :aria-describedby="describedBy"
      @focus="focused = true"
      @blur="focused = false"
      @input="model = ($event.target as HTMLInputElement).value"
    >
    <AIconButton
      v-if="type === 'password'"
      :icon="revealing ? EyeOff : Eye"
      :label="revealing ? '隐藏密码' : '显示密码'"
      size="small"
      :disabled="disabled"
      @mousedown.prevent
      @click="revealing = !revealing"
    />
    <AIconButton
      v-if="showClear"
      :icon="X"
      label="清除"
      size="small"
      :disabled="disabled"
      @mousedown.prevent
      @click="clear"
    />
    <span v-if="showCount" class="a-control__count">
      {{ model.length }}/{{ maxlength }}
    </span>
  </div>
</template>

<style scoped>
.a-field__prefix {
  flex-shrink: 0;
  color: var(--label-3);
}
</style>
