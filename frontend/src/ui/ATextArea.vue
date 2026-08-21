<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';

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
const { id, describedBy, invalid, required } = useFormControl(props);
const area = ref<HTMLTextAreaElement | null>(null);
const focused = ref(false);

const showCount = computed(() => {
  if (!props.maxlength) {
    return false;
  }

  return focused.value || model.value.length / props.maxlength > 0.8;
});

function fit() {
  const el = area.value;
  if (!el) {
    return;
  }

  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

onMounted(fit);
watch(model, async () => {
  await nextTick();
  fit();
});
</script>

<template>
  <div
    class="a-control a-control--textarea"
    :class="{
      'a-control--disabled': disabled,
      'a-control--invalid': invalid,
    }"
    :style="{ '--textarea-rows': rows }"
  >
    <textarea
      :id="id"
      ref="area"
      class="a-control__input a-textarea__input"
      :value="model"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :disabled="disabled"
      :rows="rows"
      :aria-invalid="invalid ? true : undefined"
      :aria-required="required ? true : undefined"
      :aria-describedby="describedBy"
      @focus="focused = true"
      @blur="focused = false"
      @input="model = ($event.target as HTMLTextAreaElement).value"
    />
    <span v-if="showCount" class="a-control__count">
      {{ model.length }}/{{ maxlength }}
    </span>
  </div>
</template>

<style scoped>
.a-textarea__input {
  min-height: calc(var(--space-5) * var(--textarea-rows, 3));
  max-height: calc(var(--space-5) * 10);
  overflow: auto;
  font: var(--text-control);
  line-height: var(--space-5);
  resize: none;
}
</style>
