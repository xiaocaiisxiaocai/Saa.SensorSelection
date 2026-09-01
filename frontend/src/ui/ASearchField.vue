<script setup lang="ts">
import { Search, X } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import AIconButton from './AIconButton.vue';
import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
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
const { id, describedBy, invalid, required } = useFormControl(props);
const focused = ref(false);
const input = ref<HTMLInputElement | null>(null);

const showShortcut = computed(
  () => Boolean(props.shortcut) && !focused.value && model.value.length === 0,
);
const showClear = computed(() => !props.disabled && model.value.length > 0);

function clear() {
  model.value = '';
}

function focusFromSurface(event: MouseEvent) {
  if (props.disabled) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, button, a, [role="button"]')) return;
  event.preventDefault();
  input.value?.focus();
}
</script>

<template>
  <div
    class="a-control a-control--pill"
    :class="{
      'a-control--disabled': disabled,
      'a-control--invalid': invalid,
      'a-control--small': size === 'small',
    }"
    @mousedown="focusFromSurface"
  >
    <Search class="a-search__icon" :size="18" :stroke-width="1.5" />
    <input
      :id="id"
      ref="input"
      class="a-control__input"
      type="search"
      :value="model"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="invalid ? true : undefined"
      :aria-required="required ? true : undefined"
      :aria-describedby="describedBy"
      @focus="focused = true"
      @blur="focused = false"
      @input="model = ($event.target as HTMLInputElement).value"
    >
    <kbd v-if="showShortcut" class="a-control__shortcut">{{ shortcut }}</kbd>
    <AIconButton
      v-if="showClear"
      :icon="X"
      label="清除"
      size="small"
      :disabled="disabled"
      @mousedown.prevent
      @click="clear"
    />
  </div>
</template>

<style scoped>
.a-control {
  width: 100%;
  min-width: 0;
}

.a-search__icon {
  flex-shrink: 0;
  color: var(--label-3);
}

.a-control__input[type='search']::-webkit-search-decoration,
.a-control__input[type='search']::-webkit-search-cancel-button,
.a-control__input[type='search']::-webkit-search-results-button,
.a-control__input[type='search']::-webkit-search-results-decoration {
  display: none;
}

.a-control__input {
  align-self: stretch;
}
</style>
