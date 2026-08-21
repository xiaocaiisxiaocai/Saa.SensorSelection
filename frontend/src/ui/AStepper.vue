<script setup lang="ts">
import { ChevronDown, ChevronUp } from 'lucide-vue-next';
import { ref, watch } from 'vue';

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
const { id, describedBy, invalid, required } = useFormControl(props);
const draft = ref(String(model.value));

watch(model, (value) => {
  draft.value = String(value);
});

function clamp(value: number) {
  let next = value;
  if (props.min !== undefined) {
    next = Math.max(props.min, next);
  }
  if (props.max !== undefined) {
    next = Math.min(props.max, next);
  }
  return next;
}

function commit(raw = draft.value) {
  const parsed = Number(raw);
  const next = clamp(Number.isFinite(parsed) ? parsed : model.value);
  model.value = next;
  draft.value = String(next);
}

function nudge(direction: 1 | -1) {
  if (props.disabled) {
    return;
  }

  commit(String(model.value + direction * props.step));
}
</script>

<template>
  <div
    class="a-control a-stepper"
    :class="{
      'a-control--disabled': disabled,
      'a-control--invalid': invalid,
    }"
  >
    <input
      :id="id"
      class="a-control__input"
      type="text"
      inputmode="decimal"
      :value="draft"
      :disabled="disabled"
      :aria-invalid="invalid ? true : undefined"
      :aria-required="required ? true : undefined"
      :aria-describedby="describedBy"
      @input="draft = ($event.target as HTMLInputElement).value"
      @blur="commit()"
      @keydown.up.prevent="nudge(1)"
      @keydown.down.prevent="nudge(-1)"
    >
    <div class="a-stepper__nudge">
      <button
        type="button"
        aria-label="增加"
        :disabled="disabled"
        @click="nudge(1)"
      >
        <ChevronUp :size="12" :stroke-width="1.5" />
      </button>
      <button
        type="button"
        aria-label="减少"
        :disabled="disabled"
        @click="nudge(-1)"
      >
        <ChevronDown :size="12" :stroke-width="1.5" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.a-stepper {
  padding-right: 0;
}

.a-stepper__nudge {
  display: flex;
  flex-direction: column;
  align-self: stretch;
  width: var(--control-height-sm);
  box-shadow: inset 0.5px 0 0 var(--separator);
}

.a-stepper__nudge button {
  display: grid;
  flex: 1;
  place-items: center;
  min-height: var(--stepper-nudge-height);
  padding: 0;
  color: var(--label-2);
  background: transparent;
  border: 0;
}

.a-stepper__nudge button:first-child {
  box-shadow: inset 0 -0.5px 0 var(--separator);
}

.a-stepper__nudge button:disabled {
  cursor: not-allowed;
}

.a-stepper__nudge button:hover:not(:disabled) {
  background: var(--fill-3);
}
</style>
