<script setup lang="ts">
import {
  ChevronDown,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';

import AButton from './AButton.vue';
import ACheckbox from './ACheckbox.vue';
import AEmptyState from './AEmptyState.vue';
import AIconButton from './AIconButton.vue';
import ASearchField from './ASearchField.vue';
import ATooltip from './ATooltip.vue';
import {
  clampSourceListWidth,
  filterSourceGroups,
  findGroupName,
  moveIndex,
  sourceListWidthFromKey,
  SOURCE_LIST_DEFAULT_WIDTH,
  SOURCE_LIST_MAX_WIDTH,
  SOURCE_LIST_MIN_WIDTH,
  type SourceGroup,
} from './source-list';

const props = withDefaults(
  defineProps<{
    groups: SourceGroup[];
    selected: string;
    checkedItems?: string[];
    searchable?: boolean;
    editable?: boolean;
    sortable?: boolean;
    groupLabel: string;
    itemLabel: string;
    storageKey: string;
    minWidth?: number;
    maxWidth?: number;
    defaultWidth?: number;
  }>(),
  {
    searchable: true,
    editable: false,
    sortable: false,
    minWidth: SOURCE_LIST_MIN_WIDTH,
    maxWidth: SOURCE_LIST_MAX_WIDTH,
    defaultWidth: SOURCE_LIST_DEFAULT_WIDTH,
  },
);

const emit = defineEmits<{
  select: [payload: { group: string; item: string }];
  toggleCheck: [payload: { item: string; checked: boolean }];
  createGroup: [];
  editGroup: [name: string];
  deleteGroup: [name: string];
  createItem: [group?: string];
  editItem: [payload: { group: string; item: string }];
  deleteItem: [payload: { group: string; item: string }];
  reorderGroups: [names: string[]];
  reorderItems: [payload: { group: string; items: string[] }];
}>();

const query = ref('');
const width = ref(props.defaultWidth);
const expanded = ref(new Set<string>());
const dragging = ref<{ kind: 'group' | 'item'; group: string; item?: string } | null>(
  null,
);

const checkable = computed(() => props.checkedItems !== undefined);
const canSort = computed(
  () => props.sortable && props.editable && query.value.trim() === '',
);
const visibleGroups = computed(() =>
  filterSourceGroups(props.groups, query.value),
);

function isExpanded(name: string) {
  return expanded.value.has(name);
}

function expand(name: string) {
  if (expanded.value.has(name)) {
    return;
  }

  expanded.value = new Set(expanded.value).add(name);
}

function toggleGroup(name: string) {
  const next = new Set(expanded.value);
  if (next.has(name)) {
    next.delete(name);
  } else {
    next.add(name);
  }
  expanded.value = next;
}

function groupCount(group: SourceGroup) {
  return group.count ?? group.items.length;
}

function isChecked(item: string) {
  return props.checkedItems?.includes(item) ?? false;
}

function clampWidth(value: number) {
  return clampSourceListWidth(value, props.minWidth, props.maxWidth);
}

function persistWidth(next: number) {
  width.value = clampWidth(next);
  try {
    localStorage.setItem(props.storageKey, String(width.value));
  } catch {
    // private mode
  }
}

function restoreWidth() {
  try {
    const stored = localStorage.getItem(props.storageKey);
    const parsed = stored === null ? Number.NaN : Number(stored);
    if (Number.isFinite(parsed)) {
      width.value = clampWidth(parsed);
      return;
    }
  } catch {
    // default
  }

  width.value = props.defaultWidth;
}

function onResizeKey(event: KeyboardEvent) {
  const next = sourceListWidthFromKey(
    event,
    width.value,
    props.minWidth,
    props.maxWidth,
  );
  if (next == null) {
    return;
  }

  event.preventDefault();
  persistWidth(next);
}

function startResize(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  const startX = event.clientX;
  const startWidth = width.value;
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);

  const onMove = (moveEvent: PointerEvent) => {
    width.value = clampWidth(startWidth + moveEvent.clientX - startX);
  };
  const onUp = () => {
    persistWidth(width.value);
    target.releasePointerCapture(event.pointerId);
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);
  };

  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
}

function onGroupDragStart(event: DragEvent, name: string) {
  if (!canSort.value) {
    event.preventDefault();
    return;
  }

  dragging.value = { kind: 'group', group: name };
  event.dataTransfer?.setData('text/plain', name);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function onItemDragStart(event: DragEvent, group: string, item: string) {
  if (!canSort.value) {
    event.preventDefault();
    return;
  }

  dragging.value = { kind: 'item', group, item };
  event.dataTransfer?.setData('text/plain', item);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function onGroupDrop(event: DragEvent, name: string) {
  event.preventDefault();
  const drag = dragging.value;
  if (!drag || drag.kind !== 'group' || drag.group === name) {
    return;
  }

  dragging.value = null;
  const names = props.groups.map((group) => group.name);
  const from = names.indexOf(drag.group);
  const to = names.indexOf(name);
  emit('reorderGroups', moveIndex(names, from, to));
}

function onItemDrop(event: DragEvent, group: string, item: string) {
  event.preventDefault();
  event.stopPropagation();
  const drag = dragging.value;
  if (
    !drag ||
    drag.kind !== 'item' ||
    drag.group !== group ||
    drag.item == null ||
    drag.item === item
  ) {
    return;
  }

  const current = props.groups.find((entry) => entry.name === group);
  if (!current) {
    return;
  }

  dragging.value = null;
  const from = current.items.indexOf(drag.item);
  const to = current.items.indexOf(item);
  emit('reorderItems', {
    group,
    items: moveIndex(current.items, from, to),
  });
}

function allowDrop(event: DragEvent) {
  if (!dragging.value) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

watch(
  () => [props.groups, props.selected] as const,
  ([groups, selected]) => {
    const name = findGroupName(groups, selected);
    if (name) {
      expand(name);
    }
  },
  { immediate: true },
);

watch(query, (value) => {
  if (value.trim()) {
    expanded.value = new Set(visibleGroups.value.map((group) => group.name));
  }
});

onMounted(restoreWidth);
</script>

<template>
  <aside
    class="a-source-list"
    :aria-label="`${itemLabel}列表`"
    :style="{ width: `${width}px`, maxWidth: `${width}px` }"
  >
    <button
      class="a-source-list__resizer"
      type="button"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整分类栏宽度"
      :aria-valuemin="minWidth"
      :aria-valuemax="maxWidth"
      :aria-valuenow="width"
      @keydown="onResizeKey"
      @pointerdown="startResize"
    />
    <div v-if="searchable" class="a-source-list__search">
      <ASearchField
        v-model="query"
        size="small"
        :placeholder="`搜索${itemLabel}...`"
        :aria-label="`搜索${itemLabel}`"
      />
    </div>
    <div v-if="editable" class="a-source-list__toolbar">
      <AButton
        size="small"
        :aria-label="`新建${groupLabel}`"
        @click="emit('createGroup')"
      >
        <Plus :size="16" :stroke-width="1.5" />
        {{ groupLabel }}
      </AButton>
      <AButton
        size="small"
        variant="filled"
        :disabled="groups.length === 0"
        :aria-label="`新建${itemLabel}`"
        @click="emit('createItem')"
      >
        <Plus :size="16" :stroke-width="1.5" />
        {{ itemLabel }}
      </AButton>
    </div>
    <div v-if="visibleGroups.length > 0" class="a-source-list__groups">
      <section
        v-for="group in visibleGroups"
        :key="group.name"
        class="a-source-list__group"
        @dragover="allowDrop"
        @drop="onGroupDrop($event, group.name)"
      >
        <div class="a-source-list__row a-source-list__row--group">
          <button
            v-if="canSort"
            class="a-source-list__handle"
            type="button"
            aria-label="拖拽排序"
            draggable="true"
            @click.stop
            @dragstart="onGroupDragStart($event, group.name)"
            @dragend="dragging = null"
          >
            <GripVertical :size="14" :stroke-width="1.5" />
          </button>
          <button
            class="a-source-list__toggle"
            type="button"
            :aria-expanded="isExpanded(group.name)"
            @click="toggleGroup(group.name)"
          >
            <ChevronDown
              class="a-source-list__chevron"
              :class="{ 'a-source-list__chevron--closed': !isExpanded(group.name) }"
              :size="18"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            <span class="a-source-list__label">
              <ATooltip :content="group.name">
                <template #trigger>
                  <span class="a-source-list__name">{{ group.name }}</span>
                </template>
              </ATooltip>
            </span>
            <span class="a-source-list__count">{{ groupCount(group) }}</span>
          </button>
          <div v-if="editable" class="a-source-list__actions">
            <AIconButton
              :icon="Plus"
              :label="`在该${groupLabel}下新建${itemLabel}`"
              size="small"
              @click.stop="emit('createItem', group.name)"
            />
            <AIconButton
              :icon="Pencil"
              :label="`编辑${groupLabel}`"
              size="small"
              @click.stop="emit('editGroup', group.name)"
            />
            <AIconButton
              :icon="Trash2"
              :label="`删除${groupLabel}`"
              size="small"
              variant="destructive"
              @click.stop="emit('deleteGroup', group.name)"
            />
          </div>
        </div>
        <div
          v-show="isExpanded(group.name)"
          class="a-source-list__items"
          :data-group="group.name"
        >
          <div
            v-for="item in group.items"
            :key="item"
            class="a-source-list__row a-source-list__row--item"
            :class="{ 'a-source-list__row--selected': selected === item }"
            @dragover="allowDrop"
            @drop="onItemDrop($event, group.name, item)"
          >
            <span
              v-if="checkable"
              class="a-source-list__check"
              @click.stop
              @mousedown.stop
            >
              <ACheckbox
                :model-value="isChecked(item)"
                :aria-label="`选择${item}`"
                @update:model-value="
                  emit('toggleCheck', { item, checked: $event === true })
                "
              />
            </span>
            <button
              v-if="canSort"
              class="a-source-list__handle"
              type="button"
              aria-label="拖拽排序"
              draggable="true"
              @click.stop
              @dragstart="onItemDragStart($event, group.name, item)"
              @dragend="dragging = null"
            >
              <GripVertical :size="14" :stroke-width="1.5" />
            </button>
            <span class="a-source-list__label">
              <ATooltip :content="item">
                <template #trigger>
                  <button
                    class="a-source-list__item"
                    type="button"
                    :aria-current="selected === item ? 'page' : undefined"
                    @click="emit('select', { group: group.name, item })"
                  >
                    {{ item }}
                  </button>
                </template>
              </ATooltip>
            </span>
            <div v-if="editable" class="a-source-list__actions">
              <AIconButton
                :icon="Pencil"
                :label="`编辑${itemLabel}`"
                size="small"
                @click.stop="emit('editItem', { group: group.name, item })"
              />
              <AIconButton
                :icon="Trash2"
                :label="`删除${itemLabel}`"
                size="small"
                variant="destructive"
                @click.stop="emit('deleteItem', { group: group.name, item })"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
    <AEmptyState
      v-else
      :title="
        query.trim()
          ? `没有匹配“${query.trim()}”的结果`
          : `暂无${itemLabel}，请先新建${groupLabel}`
      "
    />
  </aside>
</template>

<style scoped>
.a-source-list {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  height: 100%;
  background: var(--bg-content);
  box-shadow: inset -0.5px 0 0 var(--separator);
}

.a-source-list__resizer {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
  width: var(--space-2);
  height: 100%;
  padding: 0;
  appearance: none;
  cursor: col-resize;
  background: transparent;
  border: 0;
}

.a-source-list__resizer::before {
  position: absolute;
  inset: 0 calc(var(--space-2) * -1);
  content: '';
}

.a-source-list__search,
.a-source-list__toolbar {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-2);
  padding: var(--space-4);
}

.a-source-list__search {
  padding-bottom: var(--space-2);
}

.a-source-list__toolbar {
  padding-top: 0;
}

.a-source-list__toolbar .a-button {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
}

.a-source-list__search :deep(.a-control) {
  flex: 1;
  width: 100%;
}

.a-source-list__groups {
  flex: 1;
  min-height: 0;
  padding: 0 0 var(--space-4);
  overflow: auto;
}

.a-source-list__row {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  min-height: var(--row-height);
  padding-right: var(--space-4);
}

.a-source-list__row--group {
  padding-left: var(--space-4);
}

.a-source-list__row--item {
  padding-left: var(--space-8);
}

.a-source-list__row--item:hover,
.a-source-list__row--group:hover {
  background: var(--fill-4);
}

.a-source-list__row--selected,
.a-source-list__row--selected:hover {
  background: var(--sys-blue-fill);
}

.a-source-list__handle,
.a-source-list__toggle,
.a-source-list__item {
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
}

.a-source-list__handle {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: var(--control-height-sm);
  height: var(--control-height-sm);
  color: var(--label-3);
  cursor: grab;
}

.a-source-list__toggle,
.a-source-list__item {
  display: flex;
  flex: 1;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
  height: var(--row-height);
  font: var(--text-control);
  text-align: start;
}

.a-source-list__toggle {
  color: var(--label-2);
}

.a-source-list__item {
  overflow: hidden;
  color: var(--label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a-source-list__label {
  display: flex;
  flex: 1;
  min-width: 0;
}

.a-source-list__label :deep(.a-source-list__name),
.a-source-list__label :deep(.a-source-list__item) {
  width: 100%;
}

.a-source-list__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a-source-list__row--selected .a-source-list__item {
  color: var(--sys-blue);
}

.a-source-list__chevron {
  flex-shrink: 0;
  transition: transform var(--dur-2) var(--ease-in-out);
}

.a-source-list__chevron--closed {
  transform: rotate(-90deg);
}

.a-source-list__count {
  flex-shrink: 0;
  padding-right: var(--space-2);
  font: var(--text-control);
  color: var(--label-3);
}

.a-source-list__check {
  display: grid;
  flex-shrink: 0;
  place-items: center;
}

.a-source-list__actions {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-1);
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--dur-1) var(--ease-out);
}

.a-source-list__row:hover .a-source-list__actions,
.a-source-list__row:focus-within .a-source-list__actions {
  pointer-events: auto;
  opacity: 1;
}

.a-source-list .a-empty-state {
  padding-block: var(--space-8);
}

@media (prefers-reduced-motion: reduce) {
  .a-source-list__chevron,
  .a-source-list__actions {
    transition: none;
  }
}
</style>
