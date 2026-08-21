<script setup lang="ts">
import { computed, provide, useId } from 'vue';

import { formRowKey } from './form-context';

const props = defineProps<{
  error?: string;
  hint?: string;
  label: string;
  required?: boolean;
  wide?: boolean;
}>();

const controlId = useId();
const messageId = `${controlId}-message`;

const describedBy = computed(() =>
  props.error || props.hint ? messageId : undefined,
);
const invalid = computed(() => Boolean(props.error));
const required = computed(() => Boolean(props.required));

provide(formRowKey, {
  describedBy,
  id: controlId,
  invalid,
  required,
});
</script>

<template>
  <div class="a-form-row" :class="{ 'a-form-row--wide': wide }">
    <label class="a-form-row__label" :for="controlId">
      {{ label }}
      <span v-if="required" class="a-form-row__req" aria-hidden="true" />
      <span v-if="required" class="visually-hidden">必填</span>
    </label>
    <slot />
    <p v-if="error" :id="messageId" class="a-form-row__error">{{ error }}</p>
    <p v-else-if="hint" :id="messageId" class="a-form-row__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.a-form-row {
  display: grid;
  gap: var(--space-2);
  align-content: start;
  min-width: 0;
}

.a-form-row--wide {
  grid-column: 1 / -1;
}

.a-form-row__label {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  font: var(--text-control-em);
  color: var(--label);
}

.a-form-row__req {
  width: var(--space-2);
  height: var(--space-2);
  background: var(--sys-red);
  border-radius: var(--radius-pill);
}

.a-form-row__error {
  margin: 0;
  font: var(--text-caption);
  color: var(--sys-red);
  letter-spacing: var(--tracking-caption);
}

.a-form-row__hint {
  margin: 0;
  font: var(--text-caption);
  color: var(--label-2);
  letter-spacing: var(--tracking-caption);
}
</style>
