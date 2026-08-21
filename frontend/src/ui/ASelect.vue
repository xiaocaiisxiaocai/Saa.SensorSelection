<script setup lang="ts">
import { Check, ChevronDown, X } from 'lucide-vue-next';
import { computed, nextTick, ref, useId, watch } from 'vue';
import {
  ListboxItem,
  ListboxItemIndicator,
  ListboxRoot,
} from 'reka-ui';

import AIconButton from './AIconButton.vue';
import APopover from './APopover.vue';
import { filterOptions, findOption } from './select-options';
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
  }>(),
  {
    placeholder: '请选择',
    size: 'medium',
  },
);

const model = defineModel<string | number | null>({ default: null });
const { id, describedBy, invalid, required } = useFormControl(props);

const open = ref(false);
const query = ref('');
const listId = useId();
const filterEl = ref<HTMLInputElement | null>(null);

const selected = computed(() => findOption(props.options, model.value));
const filtered = computed(() => filterOptions(props.options, query.value));
const showClear = computed(
  () => Boolean(props.clearable) && !props.disabled && model.value != null,
);

function onPick(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return;
  }

  model.value = value;
  open.value = false;
  query.value = '';
}

function clear() {
  model.value = null;
}

watch(open, async (isOpen) => {
  if (!isOpen) {
    query.value = '';
    return;
  }

  await nextTick();
  filterEl.value?.focus();
});
</script>

<template>
  <div class="a-select" :class="{ 'a-select--clearable': showClear }">
    <APopover v-model:open="open" align="start" match-trigger-width>
      <template #trigger>
        <button
          :id="id"
          class="a-control a-select__trigger"
          :class="{
            'a-control--disabled': disabled,
            'a-control--invalid': invalid,
            'a-control--small': size === 'small',
            'a-select__trigger--large': size === 'large',
          }"
          type="button"
          role="combobox"
          :aria-expanded="open"
          :aria-controls="listId"
          :aria-invalid="invalid ? true : undefined"
          :aria-required="required ? true : undefined"
          :aria-describedby="describedBy"
          :disabled="disabled"
        >
          <span
            class="a-select__value"
            :data-placeholder="selected ? undefined : ''"
          >
            {{ selected?.label ?? placeholder }}
          </span>
          <ChevronDown
            class="a-select__chevron"
            :size="18"
            :stroke-width="1.5"
          />
        </button>
      </template>

      <div class="a-select__panel">
        <input
          v-if="filterable"
          ref="filterEl"
          v-model="query"
          class="a-select__filter"
          type="search"
          placeholder="筛选"
          aria-label="筛选选项"
        >
        <ListboxRoot
          :id="listId"
          class="a-select__list"
          role="listbox"
          highlight-on-hover
          :model-value="model ?? undefined"
          :disabled="disabled"
          @update:model-value="onPick"
        >
          <ListboxItem
            v-for="option in filtered"
            :key="String(option.value)"
            class="a-menu-item"
            :value="option.value"
            :disabled="option.disabled"
          >
            <span class="a-menu-item__check">
              <ListboxItemIndicator>
                <Check :size="18" :stroke-width="1.5" />
              </ListboxItemIndicator>
            </span>
            <span class="a-menu-item__text">
              <span class="a-menu-item__label">{{ option.label }}</span>
              <span v-if="option.hint" class="a-menu-item__hint">
                {{ option.hint }}
              </span>
            </span>
          </ListboxItem>
        </ListboxRoot>
        <p v-if="filtered.length === 0" class="a-select__empty">无匹配结果</p>
      </div>
    </APopover>

    <span v-if="showClear" class="a-select__clear">
      <AIconButton
        :icon="X"
        label="清除"
        size="small"
        @mousedown.prevent
        @click.stop="clear"
      />
    </span>
  </div>
</template>

<style scoped>
.a-select {
  position: relative;
  align-self: start;
  width: 100%;
}

.a-select__trigger {
  width: 100%;
  cursor: pointer;
}

.a-select--clearable .a-select__trigger {
  padding-inline-end: calc(var(--space-3) + var(--control-height-sm));
}

.a-select__trigger--large {
  min-height: var(--control-height-xl);
}

.a-select__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a-select__value[data-placeholder] {
  color: var(--label-3);
}

.a-select__chevron {
  flex-shrink: 0;
  color: var(--label-3);
  transition: transform var(--dur-1) var(--ease-out);
}

.a-select__trigger[aria-expanded='true'] {
  box-shadow: none;
}

.a-select__trigger[aria-expanded='true'] .a-select__chevron {
  transform: rotate(180deg);
}

.a-select__clear {
  position: absolute;
  inset-block: 0;
  right: var(--space-3);
  z-index: 1;
  display: flex;
  align-items: center;
  line-height: 0;
}

.a-select__panel {
  display: grid;
  min-width: 0;
  gap: var(--space-2);
}

.a-select__filter {
  width: 100%;
  height: var(--control-height-md);
  padding: 0 var(--space-3);
  font: var(--text-control);
  color: var(--label);
  background: var(--fill-2);
  border: 0;
  border-radius: var(--radius-sm);
}

.a-select__filter:focus,
.a-select__filter:focus-visible {
  background: var(--bg-content);
  box-shadow: inset 0 0 0 1px var(--sys-blue);
}

.a-select__list {
  display: grid;
  min-width: 0;
  outline: none;
}

.a-select__empty {
  margin: 0;
  padding: var(--space-3);
  font: var(--text-caption);
  color: var(--label-3);
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .a-select__chevron {
    transition: none;
  }
}
</style>
