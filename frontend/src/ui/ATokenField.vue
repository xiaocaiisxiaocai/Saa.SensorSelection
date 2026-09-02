<script setup lang="ts">
import { Check, ChevronDown, X } from 'lucide-vue-next';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from 'vue';
import { ListboxItem, ListboxItemIndicator, ListboxRoot } from 'reka-ui';

import APopover from './APopover.vue';
import ATooltip from './ATooltip.vue';
import { filterOptions, findOption } from './select-options';
import { fitVisibleTokenCount } from './token-field-layout';
import type { ControlSize, SelectOption } from './types';
import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    options: SelectOption[];
    placeholder?: string;
    filterable?: boolean;
    maxVisibleTokens?: number;
    size?: ControlSize;
    describedBy?: string;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
    ariaLabel?: string;
  }>(),
  {
    placeholder: '请选择',
    size: 'medium',
  },
);

const model = defineModel<Array<string | number>>({ default: () => [] });
const { id, describedBy, hasFormLabel, labelledBy, invalid, required } =
  useFormControl(props);

const open = ref(false);
const query = ref('');
const listId = useId();
const trigger = ref<HTMLElement | null>(null);
const fittedVisibleLimit = ref<number | null>(null);
let triggerResizeObserver: ResizeObserver | null = null;
let mounted = false;

const selected = computed(() =>
  model.value
    .map((value) => findOption(props.options, value))
    .filter((option): option is SelectOption => Boolean(option)),
);
const accessibleLabel = computed(
  () => props.ariaLabel ?? (hasFormLabel.value ? undefined : props.placeholder),
);
const visibleLimit = computed(() => {
  if (props.maxVisibleTokens == null) return selected.value.length;
  return Math.min(
    props.maxVisibleTokens,
    fittedVisibleLimit.value ?? props.maxVisibleTokens,
  );
});
const visible = computed(() => {
  return selected.value.slice(0, visibleLimit.value);
});
const hidden = computed(() => {
  return selected.value.slice(visibleLimit.value);
});
const overflowLabel = computed(() =>
  hidden.value.map((option) => option.label).join('、'),
);
const filtered = computed(() => filterOptions(props.options, query.value));

function pixelValue(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function measuredTextWidth(
  context: CanvasRenderingContext2D,
  text: string,
  font: string,
  letterSpacing: number,
): number {
  context.font = font;
  return (
    context.measureText(text).width +
    Math.max(0, text.length - 1) * letterSpacing
  );
}

function updateVisibleTokens() {
  const element = trigger.value;
  if (
    !element ||
    props.maxVisibleTokens == null ||
    selected.value.length === 0
  ) {
    fittedVisibleLimit.value = null;
    return;
  }

  const label = element.querySelector<HTMLElement>(
    '.a-token-field__chip-label',
  );
  const chip = element.querySelector<HTMLElement>('.a-token-field__chip');
  const remove = element.querySelector<HTMLElement>(
    '.a-token-field__chip-remove',
  );
  const context = document.createElement('canvas').getContext('2d');
  if (!label || !chip || !remove || !context || element.clientWidth <= 0) {
    fittedVisibleLimit.value = props.maxVisibleTokens;
    return;
  }

  const triggerStyle = window.getComputedStyle(element);
  const labelStyle = window.getComputedStyle(label);
  const chipStyle = window.getComputedStyle(chip);
  const more = element.querySelector<HTMLElement>('.a-token-field__more');
  const moreStyle = more ? window.getComputedStyle(more) : null;
  const gap = pixelValue(triggerStyle.columnGap || triggerStyle.gap);
  const availableWidth =
    element.clientWidth -
    pixelValue(triggerStyle.paddingInlineStart || triggerStyle.paddingLeft) -
    pixelValue(triggerStyle.paddingInlineEnd || triggerStyle.paddingRight);
  const labelFont = labelStyle.font || triggerStyle.font;
  const labelLetterSpacing = pixelValue(labelStyle.letterSpacing);
  const chipChrome =
    pixelValue(chipStyle.paddingInlineStart || chipStyle.paddingLeft) +
    pixelValue(chipStyle.paddingInlineEnd || chipStyle.paddingRight) +
    pixelValue(chipStyle.columnGap || chipStyle.gap) +
    remove.getBoundingClientRect().width;
  const fallbackMorePadding =
    pixelValue(triggerStyle.getPropertyValue('--space-3')) * 2;
  const moreChrome = moreStyle
    ? pixelValue(moreStyle.paddingInlineStart || moreStyle.paddingLeft) +
      pixelValue(moreStyle.paddingInlineEnd || moreStyle.paddingRight)
    : fallbackMorePadding;
  const moreFont = moreStyle?.font || labelFont;
  const moreLetterSpacing = pixelValue(
    moreStyle?.letterSpacing ?? labelStyle.letterSpacing,
  );
  const tokenWidths = selected.value.map(
    (option) =>
      measuredTextWidth(
        context,
        option.label,
        labelFont,
        labelLetterSpacing,
      ) + chipChrome,
  );

  fittedVisibleLimit.value = fitVisibleTokenCount({
    availableWidth,
    tokenWidths,
    gap,
    maxVisibleTokens: props.maxVisibleTokens,
    overflowWidth: (hiddenCount) =>
      measuredTextWidth(
        context,
        `+${hiddenCount}`,
        moreFont,
        moreLetterSpacing,
      ) + moreChrome,
  });
}

function scheduleVisibleTokenUpdate() {
  void nextTick(updateVisibleTokens);
}

function refreshVisibleTokens() {
  // Recalculate against the current trigger before Vue paints the new
  // selection, then verify once more after the DOM update. This prevents a
  // stale token count from briefly pushing the overflow badge under the
  // chevron when another option is selected.
  updateVisibleTokens();
  scheduleVisibleTokenUpdate();
}

watch(
  () => [
    props.maxVisibleTokens,
    props.size,
    selected.value.map((option) => option.label).join('\u0000'),
  ],
  refreshVisibleTokens,
  { flush: 'sync' },
);

onMounted(() => {
  mounted = true;
  scheduleVisibleTokenUpdate();
  if (trigger.value && typeof ResizeObserver !== 'undefined') {
    triggerResizeObserver = new ResizeObserver(updateVisibleTokens);
    triggerResizeObserver.observe(trigger.value);
  }
  void document.fonts?.ready.then(() => {
    if (mounted) updateVisibleTokens();
  });
});

onBeforeUnmount(() => {
  mounted = false;
  triggerResizeObserver?.disconnect();
});

function remove(value: string | number, event: Event) {
  event.preventDefault();
  event.stopPropagation();
  model.value = model.value.filter((item) => item !== value);
}
</script>

<template>
  <div class="a-token-field">
    <APopover v-model:open="open" align="start" min-trigger-width>
      <template #trigger>
        <div
          :id="id"
          ref="trigger"
          class="a-control a-token-field__trigger"
          :class="{
            'a-control--disabled': disabled,
            'a-control--invalid': invalid,
            'a-control--small': size === 'small',
          }"
          role="combobox"
          tabindex="0"
          :aria-expanded="open"
          :aria-controls="listId"
          :aria-invalid="invalid ? true : undefined"
          :aria-required="required ? true : undefined"
          :aria-describedby="describedBy"
          :aria-labelledby="labelledBy"
          :aria-label="accessibleLabel"
          :aria-disabled="disabled ? true : undefined"
        >
          <span
            v-for="option in visible"
            :key="String(option.value)"
            class="a-token-field__chip"
          >
            <span class="a-token-field__chip-label">{{ option.label }}</span>
            <button
              class="a-token-field__chip-remove"
              type="button"
              :aria-label="`移除 ${option.label}`"
              :disabled="disabled"
              @pointerdown.stop
              @click="remove(option.value, $event)"
            >
              <X :size="12" :stroke-width="1.5" />
            </button>
          </span>
          <ATooltip v-if="hidden.length" :content="overflowLabel">
            <template #trigger>
              <span class="a-token-field__more">+{{ hidden.length }}</span>
            </template>
          </ATooltip>
          <span v-if="selected.length === 0" class="a-token-field__placeholder">
            {{ placeholder }}
          </span>
          <ChevronDown
            class="a-token-field__chevron"
            :size="16"
            :stroke-width="1.5"
          />
        </div>
      </template>

      <div class="a-select__panel">
        <input
          v-if="filterable"
          v-model="query"
          class="a-select__filter"
          type="search"
          placeholder="筛选"
          aria-label="筛选选项"
        >
        <ListboxRoot
          :id="listId"
          v-model="model"
          class="a-select__list"
          role="listbox"
          multiple
          highlight-on-hover
          selection-behavior="toggle"
          :disabled="disabled"
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
                <Check :size="16" :stroke-width="1.5" />
              </ListboxItemIndicator>
            </span>
            <span class="a-menu-item__text">
              <span class="a-menu-item__label" :title="option.label">
                {{ option.label }}
              </span>
              <span
                v-if="option.hint"
                class="a-menu-item__hint"
                :title="option.hint"
              >
                {{ option.hint }}
              </span>
            </span>
          </ListboxItem>
        </ListboxRoot>
        <p v-if="filtered.length === 0" class="a-select__empty">无匹配结果</p>
      </div>
    </APopover>
  </div>
</template>

<style scoped>
.a-token-field {
  width: 100%;
  min-width: 0;
}

.a-token-field__trigger {
  position: relative;
  flex-wrap: nowrap;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: var(--control-height-lg);
  min-height: var(--control-height-lg);
  overflow: hidden;
  padding-inline-end: calc(var(--space-4) + var(--space-5));
  cursor: pointer;
}

.a-token-field__trigger.a-control--small {
  height: var(--control-height-sm);
  min-height: var(--control-height-sm);
}

.a-token-field__trigger.a-control--disabled {
  pointer-events: none;
}

.a-token-field__chip,
.a-token-field__more {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  max-width: 100%;
  min-width: 0;
  font: var(--text-caption);
  color: var(--sys-blue);
  letter-spacing: var(--tracking-caption);
  background: var(--sys-blue-fill);
  border-radius: var(--radius-pill);
}

.a-token-field__chip {
  flex: 0 0 auto;
  max-width: 100%;
  padding: 0 var(--space-1) 0 var(--space-3);
}

.a-token-field__chip-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a-token-field__chip-remove {
  display: grid;
  flex: 0 0 var(--control-height-sm);
  place-items: center;
  width: var(--control-height-sm);
  height: var(--control-height-sm);
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
}

.a-token-field__chip-remove:hover:not(:disabled) {
  background: var(--sys-blue-fill-strong);
}

.a-token-field__more {
  flex: 0 0 auto;
  padding: var(--space-1) var(--space-3);
  white-space: nowrap;
}

.a-token-field__placeholder {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--label-placeholder);
}

.a-token-field__chevron {
  position: absolute;
  top: 50%;
  right: var(--space-3);
  flex-shrink: 0;
  color: var(--label-3);
  transform: translateY(-50%);
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
  font: var(--text-field);
  color: var(--label);
  background: var(--fill-2);
  border: 0;
  border-radius: var(--radius-sm);
}

.a-select__filter::placeholder {
  color: var(--label-placeholder);
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
</style>
