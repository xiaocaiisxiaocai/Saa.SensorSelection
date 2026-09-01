<script setup lang="ts">
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import AIconButton from './AIconButton.vue';
import APopover from './APopover.vue';
import {
  addDays,
  addMonths,
  buildCalendarWeeks,
  isInRange,
  monthTitle,
  orderedRange,
  parseDateKey,
  toDateKey,
  WEEKDAY_LABELS,
} from './date-picker';
import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    range?: boolean;
    placeholder?: string | [string, string];
    clearable?: boolean;
    describedBy?: string;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
  }>(),
  {
    clearable: true,
  },
);

const model = defineModel<string | [string | null, string | null] | null>({
  default: null,
});
const { id, describedBy, invalid, required } = useFormControl(props);

const open = ref(false);
const view = ref(new Date());
const cursor = ref(toDateKey(new Date()));
const rangeDraft = ref<[string | null, string | null]>([null, null]);

const todayKey = toDateKey(new Date());
const weeks = computed(() => buildCalendarWeeks(view.value));

const startPlaceholder = computed(() =>
  Array.isArray(props.placeholder)
    ? props.placeholder[0]
    : props.range
      ? '开始时间'
      : (props.placeholder ?? '选择日期'),
);
const endPlaceholder = computed(() =>
  Array.isArray(props.placeholder) ? props.placeholder[1] : '结束时间',
);

const selectedKey = computed(() =>
  typeof model.value === 'string' ? model.value : null,
);
const rangeValue = computed<[string | null, string | null]>(() => {
  if (Array.isArray(model.value)) {
    return model.value;
  }
  return rangeDraft.value;
});

const triggerLabel = computed(() => {
  if (props.range) {
    const [start, end] = rangeValue.value;
    if (!start && !end) {
      return `${startPlaceholder.value} – ${endPlaceholder.value}`;
    }
    return `${start ?? startPlaceholder.value} – ${end ?? endPlaceholder.value}`;
  }

  return selectedKey.value ?? startPlaceholder.value;
});

const isPlaceholder = computed(() => {
  if (props.range) {
    const [start, end] = rangeValue.value;
    return !start && !end;
  }
  return !selectedKey.value;
});

const showClear = computed(
  () => props.clearable && !props.disabled && !isPlaceholder.value,
);

function syncView(key: string | null) {
  const date = key ? parseDateKey(key) : null;
  if (date) {
    view.value = date;
    cursor.value = key ?? cursor.value;
  }
}

function pick(key: string) {
  cursor.value = key;
  if (!props.range) {
    model.value = key;
    open.value = false;
    return;
  }

  const [start, end] = rangeDraft.value;
  if (!start || end) {
    rangeDraft.value = [key, null];
    model.value = [key, null];
    return;
  }

  const next = orderedRange(start, key);
  rangeDraft.value = next;
  model.value = next;
  open.value = false;
}

function clear() {
  model.value = props.range ? [null, null] : null;
  rangeDraft.value = [null, null];
}

function onGridKey(event: KeyboardEvent) {
  const current = parseDateKey(cursor.value) ?? new Date();
  let next: Date | null = null;
  if (event.key === 'ArrowLeft') {
    next = addDays(current, -1);
  } else if (event.key === 'ArrowRight') {
    next = addDays(current, 1);
  } else if (event.key === 'ArrowUp') {
    next = addDays(current, -7);
  } else if (event.key === 'ArrowDown') {
    next = addDays(current, 7);
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    pick(cursor.value);
    return;
  }

  if (!next) {
    return;
  }

  event.preventDefault();
  cursor.value = toDateKey(next);
  view.value = next;
}

function isSelected(key: string) {
  if (props.range) {
    const [start, end] = rangeValue.value;
    return key === start || key === end;
  }
  return key === selectedKey.value;
}

watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }

  if (props.range) {
    rangeDraft.value = Array.isArray(model.value)
      ? [...model.value]
      : [null, null];
    syncView(rangeDraft.value[0] ?? rangeDraft.value[1]);
    return;
  }

  syncView(selectedKey.value);
});
</script>

<template>
  <div class="a-date-picker" :class="{ 'a-date-picker--clearable': showClear }">
    <APopover v-model:open="open" align="start">
      <template #trigger>
        <button
          :id="id"
          class="a-control a-date-picker__trigger"
          :class="{
            'a-control--disabled': disabled,
            'a-control--invalid': invalid,
          }"
          type="button"
          :aria-expanded="open"
          :aria-invalid="invalid ? true : undefined"
          :aria-required="required ? true : undefined"
          :aria-describedby="describedBy"
          :disabled="disabled"
        >
          <CalendarDays :size="16" :stroke-width="1.5" aria-hidden="true" />
          <span
            class="a-date-picker__value"
            :data-placeholder="isPlaceholder ? '' : undefined"
          >
            {{ triggerLabel }}
          </span>
        </button>
      </template>
      <div
        class="a-date-picker__panel"
        role="application"
        :aria-label="monthTitle(view)"
        @keydown="onGridKey"
      >
        <header class="a-date-picker__header">
          <button
            class="a-date-picker__nav"
            type="button"
            aria-label="上个月"
            @click="view = addMonths(view, -1)"
          >
            <ChevronLeft :size="16" :stroke-width="1.5" aria-hidden="true" />
          </button>
          <p class="a-date-picker__month">{{ monthTitle(view) }}</p>
          <button
            class="a-date-picker__nav"
            type="button"
            aria-label="下个月"
            @click="view = addMonths(view, 1)"
          >
            <ChevronRight :size="16" :stroke-width="1.5" aria-hidden="true" />
          </button>
        </header>
        <div class="a-date-picker__weekdays" aria-hidden="true">
          <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
        </div>
        <div class="a-date-picker__grid" role="grid">
          <div
            v-for="(week, weekIndex) in weeks"
            :key="weekIndex"
            class="a-date-picker__row"
            role="row"
          >
            <template v-for="day in week" :key="day.key">
              <span
                v-if="!day.inMonth"
                class="a-date-picker__day a-date-picker__day--muted"
                aria-hidden="true"
              />
              <button
                v-else
                class="a-date-picker__day"
                :class="{
                  'a-date-picker__day--today': day.key === todayKey,
                  'a-date-picker__day--selected': isSelected(day.key),
                  'a-date-picker__day--in-range':
                    range && isInRange(day.key, rangeValue[0], rangeValue[1]),
                }"
                type="button"
                role="gridcell"
                :aria-selected="isSelected(day.key) ? 'true' : undefined"
                :tabindex="day.key === cursor ? 0 : -1"
                @click="pick(day.key)"
              >
                {{ day.date.getDate() }}
              </button>
            </template>
          </div>
        </div>
      </div>
    </APopover>
    <span v-if="showClear" class="a-date-picker__clear">
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
.a-date-picker {
  position: relative;
  align-self: start;
  width: 100%;
  max-width: calc(var(--space-9) * 8);
}

.a-date-picker__trigger {
  width: 100%;
  cursor: pointer;
}

.a-date-picker--clearable .a-date-picker__trigger {
  padding-inline-end: calc(var(--space-3) + var(--control-height-sm));
}

.a-date-picker__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a-date-picker__value[data-placeholder] {
  color: var(--label-placeholder);
}

.a-date-picker__clear {
  position: absolute;
  inset-block: 0;
  right: var(--space-3);
  z-index: 1;
  display: flex;
  align-items: center;
  line-height: 0;
}

.a-date-picker__panel {
  display: grid;
  gap: var(--space-3);
  width: calc(var(--control-height-lg) * 7);
  padding: var(--space-1) var(--space-2) var(--space-2);
}

.a-date-picker__header {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--space-1);
}

.a-date-picker__month {
  margin: 0;
  font: var(--text-control-em);
}

.a-date-picker__nav {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: var(--control-height-sm);
  height: var(--control-height-sm);
  padding: 0;
  color: var(--label-2);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
}

.a-date-picker__nav:hover {
  background: var(--fill-4);
}

.a-date-picker__weekdays,
.a-date-picker__row {
  display: grid;
  grid-template-columns: repeat(7, var(--control-height-lg));
  place-items: center;
}

.a-date-picker__weekdays {
  font: var(--text-caption);
  color: var(--label-3);
  letter-spacing: var(--tracking-caption);
  text-align: center;
}

.a-date-picker__day {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--control-height-lg);
  height: var(--control-height-lg);
  padding: 0;
  font: var(--text-control);
  color: var(--label);
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
}

.a-date-picker__day--muted {
  pointer-events: none;
}

.a-date-picker__day--in-range {
  background: var(--sys-blue-fill);
  border-radius: 0;
}

.a-date-picker__day--selected,
.a-date-picker__day--selected.a-date-picker__day--in-range {
  color: var(--label-on-color);
  background: var(--sys-blue);
  border-radius: var(--radius-pill);
}

.a-date-picker__day--today::after {
  position: absolute;
  bottom: var(--space-1);
  left: 50%;
  width: var(--space-1);
  height: var(--space-1);
  background: var(--sys-blue);
  border-radius: var(--radius-pill);
  transform: translateX(-50%);
  content: '';
}

.a-date-picker__day--selected.a-date-picker__day--today::after {
  background: var(--label-on-color);
}
</style>
