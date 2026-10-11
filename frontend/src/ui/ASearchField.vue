<script setup lang="ts">
import { Search } from 'lucide-vue-next';
import { computed } from 'vue';

import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    ariaLabel?: string;
    describedBy?: string;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
    placeholder?: string;
    shortcut?: string;
    size?: 'small' | 'medium';
  }>(),
  {
    size: 'medium',
  },
);

const model = defineModel<string>({ default: '' });
const { id, describedBy, hasFormLabel, invalid } = useFormControl(props);
const accessibleLabel = computed(() =>
  props.ariaLabel ?? (hasFormLabel.value ? undefined : props.placeholder),
);
</script>

<template>
  <a-input
    :id="id"
    v-model:value="model"
    class="a-search-field"
    allow-clear
    :aria-describedby="describedBy"
    :aria-invalid="invalid ? true : undefined"
    :aria-label="accessibleLabel"
    :disabled="disabled"
    :placeholder="placeholder"
    type="search"
    :size="size === 'small' ? 'small' : 'middle'"
    :status="invalid ? 'error' : ''"
  >
    <template #prefix>
      <Search :size="16" />
    </template>
    <template v-if="shortcut" #suffix>
      <span>{{ shortcut }}</span>
    </template>
  </a-input>
</template>

<style scoped>
.a-search-field :deep(input[type='search']::-webkit-search-cancel-button) {
  display: none;
}
</style>
