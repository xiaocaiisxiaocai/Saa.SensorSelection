<script setup lang="ts">
import { Check, ChevronDown, ChevronRight, X } from 'lucide-vue-next';
import type { ComponentPublicInstance } from 'vue';
import { computed, nextTick, ref, watch } from 'vue';

import AIconButton from './AIconButton.vue';
import APopover from './APopover.vue';
import ASearchField from './ASearchField.vue';
import {
  collectExpandableIds,
  filterTree,
  findTreeLabel,
  flattenTree,
  type TreeNode,
} from './tree-select';
import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    nodes: TreeNode[];
    placeholder?: string;
    filterable?: boolean;
    clearable?: boolean;
    describedBy?: string;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
  }>(),
  {
    placeholder: '请选择',
    filterable: true,
    clearable: true,
  },
);

const model = defineModel<string | number | null>({ default: null });
const { id, describedBy, invalid, required } = useFormControl(props);

const open = ref(false);
const query = ref('');
const expanded = ref(new Set<string>());
const filterEl = ref<ComponentPublicInstance | null>(null);

const filtered = computed(() => filterTree(props.nodes, query.value));
const rows = computed(() => flattenTree(filtered.value, expanded.value));
const selectedLabel = computed(() => findTreeLabel(props.nodes, model.value));
const showClear = computed(
  () => Boolean(props.clearable) && !props.disabled && model.value != null,
);

function toggle(idValue: string | number) {
  const key = String(idValue);
  const next = new Set(expanded.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expanded.value = next;
}

function pick(idValue: string | number, disabled?: boolean) {
  if (disabled) {
    return;
  }

  model.value = idValue;
  open.value = false;
  query.value = '';
}

function clear() {
  model.value = null;
}

watch(query, (value) => {
  if (value.trim()) {
    expanded.value = new Set(collectExpandableIds(filtered.value));
  }
});

watch(open, async (isOpen) => {
  if (!isOpen) {
    query.value = '';
    return;
  }

  await nextTick();
  const root = filterEl.value?.$el as HTMLElement | undefined;
  root?.querySelector('input')?.focus();
});
</script>

<template>
  <div class="a-tree-select" :class="{ 'a-tree-select--clearable': showClear }">
    <APopover v-model:open="open" align="start" match-trigger-width>
      <template #trigger>
        <button
          :id="id"
          class="a-control a-tree-select__trigger"
          :class="{
            'a-control--disabled': disabled,
            'a-control--invalid': invalid,
          }"
          type="button"
          role="combobox"
          :aria-expanded="open"
          :aria-invalid="invalid ? true : undefined"
          :aria-required="required ? true : undefined"
          :aria-describedby="describedBy"
          :disabled="disabled"
        >
          <span
            class="a-tree-select__value"
            :data-placeholder="selectedLabel ? undefined : ''"
          >
            {{ selectedLabel ?? placeholder }}
          </span>
          <ChevronDown :size="16" :stroke-width="1.5" aria-hidden="true" />
        </button>
      </template>
      <div class="a-tree-select__panel">
        <ASearchField
          v-if="filterable"
          ref="filterEl"
          v-model="query"
          size="small"
          placeholder="筛选"
          aria-label="筛选组织"
        />
        <div v-if="rows.length === 0" class="a-tree-select__empty">
          无匹配项
        </div>
        <div v-else class="a-tree-select__list" role="listbox">
          <div
            v-for="row in rows"
            :key="String(row.id)"
            class="a-tree-select__row"
            :style="{ '--depth': String(row.depth) }"
          >
            <button
              v-if="row.hasChildren"
              class="a-tree-select__twist"
              type="button"
              :aria-expanded="expanded.has(String(row.id))"
              :aria-label="expanded.has(String(row.id)) ? '折叠' : '展开'"
              @click.stop="toggle(row.id)"
            >
              <ChevronDown
                v-if="expanded.has(String(row.id))"
                :size="14"
                :stroke-width="1.5"
              />
              <ChevronRight v-else :size="14" :stroke-width="1.5" />
            </button>
            <span v-else class="a-tree-select__twist" aria-hidden="true" />
            <button
              class="a-tree-select__option"
              type="button"
              role="option"
              :aria-selected="model === row.id"
              :disabled="row.disabled"
              @click="pick(row.id, row.disabled)"
            >
              <span>{{ row.label }}</span>
              <Check
                v-if="model === row.id"
                class="a-tree-select__check"
                :size="14"
                :stroke-width="1.5"
              />
            </button>
          </div>
        </div>
      </div>
    </APopover>
    <span v-if="showClear" class="a-tree-select__clear">
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
.a-tree-select {
  position: relative;
  align-self: start;
  width: 100%;
  max-width: calc(var(--space-9) * 8);
}

.a-tree-select__trigger {
  width: 100%;
  cursor: pointer;
}

.a-tree-select--clearable .a-tree-select__trigger {
  padding-inline-end: calc(var(--space-3) + var(--control-height-sm));
}

.a-tree-select__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a-tree-select__value[data-placeholder] {
  color: var(--label-placeholder);
}

.a-tree-select__clear {
  position: absolute;
  inset-block: 0;
  right: var(--space-3);
  z-index: 1;
  display: flex;
  align-items: center;
  line-height: 0;
}

.a-tree-select__panel {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

.a-tree-select__list {
  max-height: calc(var(--space-9) * 6);
  overflow: auto;
}

.a-tree-select__row {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  padding-inline-start: calc(var(--space-5) * var(--depth));
}

.a-tree-select__twist {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: var(--control-height-sm);
  height: var(--control-height-sm);
  padding: 0;
  color: var(--label-3);
  background: transparent;
  border: 0;
}

.a-tree-select__option {
  display: flex;
  flex: 1;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
  height: var(--row-height);
  padding: 0 var(--space-2);
  font: var(--text-field);
  color: var(--label);
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
}

.a-tree-select__option:hover,
.a-tree-select__option[aria-selected='true'] {
  background: var(--fill-4);
}

.a-tree-select__check {
  margin-left: auto;
  color: var(--sys-blue);
}

.a-tree-select__empty {
  margin: 0;
  padding: var(--space-3);
  font: var(--text-caption);
  color: var(--label-3);
  text-align: center;
}
</style>
