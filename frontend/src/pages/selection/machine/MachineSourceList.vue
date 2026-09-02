<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Edit3,
  FolderPlus,
  GripVertical,
  Plus,
  Search,
  Trash2,
} from 'lucide-vue-next';

import { entityTreeItemKey, type EntityGroup } from '@/domain';
import { AIconButton } from '@/ui';
import {
  clampSourceListWidth,
  MACHINE_SOURCE_LIST_DEFAULT_WIDTH,
  MACHINE_SOURCE_LIST_MAX_WIDTH,
  MACHINE_SOURCE_LIST_MIN_WIDTH,
  sourceListWidthFromKey,
} from '@/ui/source-list';

const props = withDefaults(
  defineProps<{
    groups: EntityGroup[];
    selected: string;
    selectedKey?: string;
    checkedItems?: string[];
    editable?: boolean;
    sortable?: boolean;
    allowConfigurations?: boolean;
    storageKey: string;
    minWidth?: number;
    maxWidth?: number;
    defaultWidth?: number;
  }>(),
  {
    editable: false,
    sortable: false,
    allowConfigurations: true,
    minWidth: MACHINE_SOURCE_LIST_MIN_WIDTH,
    maxWidth: MACHINE_SOURCE_LIST_MAX_WIDTH,
    defaultWidth: MACHINE_SOURCE_LIST_DEFAULT_WIDTH,
  },
);

const emit = defineEmits<{
  select: [
    payload: { category: string; configuration: string | null; item: string },
  ];
  toggleCheck: [
    payload: {
      category: string;
      configuration: string | null;
      item: string;
      checked: boolean;
    },
  ];
  createGroup: [];
  editGroup: [name: string];
  deleteGroup: [name: string];
  createConfiguration: [category?: string];
  editConfiguration: [payload: { category: string; configuration: string }];
  deleteConfiguration: [payload: { category: string; configuration: string }];
  createItem: [payload?: { category: string; configuration: string | null }];
  editItem: [
    payload: { category: string; configuration: string | null; item: string },
  ];
  deleteItem: [
    payload: { category: string; configuration: string | null; item: string },
  ];
  reorderGroups: [payload: { oldIndex: number; newIndex: number }];
  reorderConfigurations: [
    payload: { category: string; oldIndex: number; newIndex: number },
  ];
  reorderItems: [
    payload: {
      category: string;
      configuration: string | null;
      oldIndex: number;
      newIndex: number;
    },
  ];
  resize: [width: number];
}>();

const query = ref('');
const tree = ref<HTMLElement | null>(null);
const focusedItemKey = ref('');
const width = ref(props.defaultWidth);
const openGroups = ref(new Set(props.groups.map((group) => group.name)));
const openConfigurations = ref(
  new Set(
    props.groups.flatMap((group) =>
      (group.configurations ?? []).map(
        (configuration) => `${group.name}\u0000${configuration.name}`,
      ),
    ),
  ),
);
const seenGroups = new Set(openGroups.value);
const seenConfigurations = new Set(openConfigurations.value);

watch(
  () => props.groups,
  (groups) => {
    const nextGroups = new Set(openGroups.value);
    const nextConfigurations = new Set(openConfigurations.value);
    for (const group of groups) {
      if (!seenGroups.has(group.name)) {
        seenGroups.add(group.name);
        nextGroups.add(group.name);
      }
      for (const configuration of group.configurations ?? []) {
        const key = `${group.name}\u0000${configuration.name}`;
        if (seenConfigurations.has(key)) continue;
        seenConfigurations.add(key);
        nextConfigurations.add(key);
      }
    }
    openGroups.value = nextGroups;
    openConfigurations.value = nextConfigurations;
  },
  { deep: true },
);
type Dragging =
  | { kind: 'group'; category: string }
  | { kind: 'configuration'; category: string; configuration: string }
  | {
      kind: 'item';
      category: string;
      configuration: string | null;
      item: string;
    };
const dragging = ref<Dragging | null>(null);
const canSort = computed(
  () => props.sortable && props.editable && query.value.trim() === '',
);
const allGroupsExpanded = computed(
  () =>
    props.groups.length > 0 &&
    props.groups.every(
      (group) =>
        openGroups.value.has(group.name) &&
        (group.configurations ?? []).every((configuration) =>
          openConfigurations.value.has(
            configurationKey(group.name, configuration.name),
          ),
        ),
    ),
);

function itemKey(category: string, configuration: string | null, item: string) {
  return entityTreeItemKey({ category, configuration, name: item });
}

function isSelected(
  category: string,
  configuration: string | null,
  item: string,
) {
  return props.selectedKey
    ? props.selectedKey === itemKey(category, configuration, item)
    : props.selected === item;
}

const visibleGroups = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase('zh-CN');
  if (!keyword) return props.groups;
  return props.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.toLocaleLowerCase('zh-CN').includes(keyword),
      ),
      configurations: (group.configurations ?? [])
        .map((configuration) => ({
          ...configuration,
          items: configuration.items.filter((item) =>
            item.toLocaleLowerCase('zh-CN').includes(keyword),
          ),
        }))
        .filter(
          (configuration) =>
            configuration.name.toLocaleLowerCase('zh-CN').includes(keyword) ||
            configuration.items.length > 0,
        ),
    }))
    .filter(
      (group) =>
        group.name.toLocaleLowerCase('zh-CN').includes(keyword) ||
        group.items.length > 0 ||
        (group.configurations?.length ?? 0) > 0,
    );
});
const visibleItemKeys = computed(() =>
  visibleGroups.value.flatMap((group) => [
    ...(group.configurations ?? []).flatMap((configuration) =>
      configuration.items.map((item) =>
        itemKey(group.name, configuration.name, item),
      ),
    ),
    ...group.items.map((item) => itemKey(group.name, null, item)),
  ]),
);

function rowTabIndex(
  category: string,
  configuration: string | null,
  item: string,
) {
  const key = itemKey(category, configuration, item);
  const activeKey =
    focusedItemKey.value ||
    props.selectedKey ||
    visibleItemKeys.value.find((candidate) => {
      if (!props.selected) return false;
      return candidate.endsWith(`"${props.selected}"]`);
    }) ||
    visibleItemKeys.value[0];
  return key === activeKey ? 0 : -1;
}

function focusItem(key: string) {
  focusedItemKey.value = key;
  void nextTick(() => {
    const row = [
      ...(tree.value?.querySelectorAll<HTMLElement>('[data-tree-key]') ?? []),
    ].find((candidate) => candidate.dataset.treeKey === key);
    row?.focus();
  });
}

function onGroupKeydown(event: KeyboardEvent, category: string) {
  if (!props.editable) return;
  if (event.key === 'F2') {
    event.preventDefault();
    event.stopPropagation();
    emit('editGroup', category);
    return;
  }
  if (event.key === 'Delete') {
    event.preventDefault();
    event.stopPropagation();
    emit('deleteGroup', category);
  }
}

function onConfigurationKeydown(
  event: KeyboardEvent,
  category: string,
  configuration: string,
) {
  if (!props.editable) return;
  const payload = { category, configuration };
  if (event.key === 'F2') {
    event.preventDefault();
    event.stopPropagation();
    emit('editConfiguration', payload);
    return;
  }
  if (event.key === 'Delete') {
    event.preventDefault();
    event.stopPropagation();
    emit('deleteConfiguration', payload);
  }
}

function onItemKeydown(
  event: KeyboardEvent,
  category: string,
  configuration: string | null,
  item: string,
) {
  if (event.target !== event.currentTarget) return;
  const payload = { category, configuration, item };
  const key = itemKey(category, configuration, item);
  if (event.key === 'Enter') {
    event.preventDefault();
    emit('select', payload);
    return;
  }
  if (event.key === ' ' && props.checkedItems) {
    event.preventDefault();
    emit('toggleCheck', {
      ...payload,
      checked: !props.checkedItems.includes(key),
    });
    return;
  }
  if (event.key === 'F2' && props.editable) {
    event.preventDefault();
    emit('editItem', payload);
    return;
  }
  if (event.key === 'Delete' && props.editable) {
    event.preventDefault();
    emit('deleteItem', payload);
    return;
  }
  if (
    event.altKey &&
    canSort.value &&
    (event.key === 'ArrowUp' || event.key === 'ArrowDown')
  ) {
    const group = props.groups.find((candidate) => candidate.name === category);
    const siblings = configuration
      ? group?.configurations?.find(
          (candidate) => candidate.name === configuration,
        )?.items
      : group?.items;
    const oldIndex = siblings?.indexOf(item) ?? -1;
    const newIndex = event.key === 'ArrowDown' ? oldIndex + 1 : oldIndex - 1;
    if (
      siblings &&
      oldIndex >= 0 &&
      newIndex >= 0 &&
      newIndex < siblings.length
    ) {
      event.preventDefault();
      emit('reorderItems', { category, configuration, oldIndex, newIndex });
    }
    return;
  }
  const index = visibleItemKeys.value.indexOf(key);
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? visibleItemKeys.value.length - 1
        : event.key === 'ArrowDown'
          ? Math.min(visibleItemKeys.value.length - 1, index + 1)
          : event.key === 'ArrowUp'
            ? Math.max(0, index - 1)
            : -1;
  const nextKey = visibleItemKeys.value[nextIndex];
  if (nextIndex >= 0 && nextKey) {
    event.preventDefault();
    focusItem(nextKey);
  }
}

function toggleGroup(name: string) {
  const next = new Set(openGroups.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  openGroups.value = next;
}

function configurationKey(category: string, configuration: string) {
  return `${category}\u0000${configuration}`;
}

function toggleConfiguration(category: string, configuration: string) {
  const key = configurationKey(category, configuration);
  const next = new Set(openConfigurations.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  openConfigurations.value = next;
}

function toggleAllGroups() {
  if (allGroupsExpanded.value) {
    openGroups.value = new Set();
    openConfigurations.value = new Set();
    return;
  }

  openGroups.value = new Set(props.groups.map((group) => group.name));
  openConfigurations.value = new Set(
    props.groups.flatMap((group) =>
      (group.configurations ?? []).map((configuration) =>
        configurationKey(group.name, configuration.name),
      ),
    ),
  );
}

function groupItemCount(group: EntityGroup) {
  return (
    group.items.length +
    (group.configurations ?? []).reduce(
      (sum, configuration) => sum + configuration.items.length,
      0,
    )
  );
}

function clampWidth(value: number) {
  return clampSourceListWidth(value, props.minWidth, props.maxWidth);
}

function persistWidth(next: number) {
  width.value = clampWidth(next);
  emit('resize', width.value);
  try {
    localStorage.setItem(props.storageKey, String(width.value));
  } catch {
    // Keep the in-memory width when browser storage is unavailable.
  }
}

function restoreWidth() {
  try {
    const stored = localStorage.getItem(props.storageKey);
    const parsed = stored === null ? Number.NaN : Number(stored);
    if (Number.isFinite(parsed)) {
      width.value = clampWidth(parsed);
      emit('resize', width.value);
      return;
    }
  } catch {
    // Fall through to the configured default width.
  }

  width.value = clampWidth(props.defaultWidth);
  emit('resize', width.value);
}

function onResizeKey(event: KeyboardEvent) {
  const next = sourceListWidthFromKey(
    event,
    width.value,
    props.minWidth,
    props.maxWidth,
  );
  if (next == null) return;

  event.preventDefault();
  persistWidth(next);
}

function startResize(event: PointerEvent) {
  if (event.button !== 0) return;

  event.preventDefault();
  const startX = event.clientX;
  const startWidth = width.value;
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture?.(event.pointerId);

  const onMove = (moveEvent: PointerEvent) => {
    width.value = clampWidth(startWidth + moveEvent.clientX - startX);
    emit('resize', width.value);
  };
  const finish = () => {
    persistWidth(width.value);
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', finish);
    target.removeEventListener('pointercancel', finish);
  };

  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);
}

function prepareDrag(event: DragEvent, value: string) {
  event.dataTransfer?.setData('text/plain', value);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onGroupDragStart(event: DragEvent, category: string) {
  if (!canSort.value) {
    event.preventDefault();
    return;
  }
  dragging.value = { kind: 'group', category };
  prepareDrag(event, category);
}

function onConfigurationDragStart(
  event: DragEvent,
  category: string,
  configuration: string,
) {
  if (!canSort.value) {
    event.preventDefault();
    return;
  }
  dragging.value = { kind: 'configuration', category, configuration };
  prepareDrag(event, configuration);
}

function onItemDragStart(
  event: DragEvent,
  category: string,
  configuration: string | null,
  item: string,
) {
  if (!canSort.value) {
    event.preventDefault();
    return;
  }
  dragging.value = { kind: 'item', category, configuration, item };
  prepareDrag(event, item);
}

function allowDrop(event: DragEvent) {
  if (!dragging.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function onGroupDrop(event: DragEvent, category: string) {
  event.preventDefault();
  const drag = dragging.value;
  if (!drag || drag.kind !== 'group' || drag.category === category) return;

  const oldIndex = props.groups.findIndex(
    (group) => group.name === drag.category,
  );
  const newIndex = props.groups.findIndex((group) => group.name === category);
  dragging.value = null;
  if (oldIndex < 0 || newIndex < 0) return;
  emit('reorderGroups', { oldIndex, newIndex });
}

function onConfigurationDrop(
  event: DragEvent,
  category: string,
  configuration: string,
) {
  event.preventDefault();
  event.stopPropagation();
  const drag = dragging.value;
  if (
    !drag ||
    drag.kind !== 'configuration' ||
    drag.category !== category ||
    drag.configuration === configuration
  ) {
    return;
  }

  const configurations =
    props.groups.find((group) => group.name === category)?.configurations ?? [];
  const oldIndex = configurations.findIndex(
    (entry) => entry.name === drag.configuration,
  );
  const newIndex = configurations.findIndex(
    (entry) => entry.name === configuration,
  );
  dragging.value = null;
  if (oldIndex < 0 || newIndex < 0) return;
  emit('reorderConfigurations', { category, oldIndex, newIndex });
}

function onItemDrop(
  event: DragEvent,
  category: string,
  configuration: string | null,
  item: string,
) {
  event.preventDefault();
  event.stopPropagation();
  const drag = dragging.value;
  if (
    !drag ||
    drag.kind !== 'item' ||
    drag.category !== category ||
    drag.configuration !== configuration ||
    drag.item === item
  ) {
    return;
  }

  const group = props.groups.find((entry) => entry.name === category);
  const items = configuration
    ? group?.configurations?.find((entry) => entry.name === configuration)
        ?.items
    : group?.items;
  const oldIndex = items?.indexOf(drag.item) ?? -1;
  const newIndex = items?.indexOf(item) ?? -1;
  dragging.value = null;
  if (oldIndex < 0 || newIndex < 0) return;
  emit('reorderItems', { category, configuration, oldIndex, newIndex });
}

onMounted(restoreWidth);
</script>

<template>
  <aside
    class="machine-source"
    aria-label="机型结构树"
    :style="{ width: `${width}px`, maxWidth: `${width}px` }"
  >
    <button
      class="machine-source__resizer"
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
    <div class="machine-source__search-row">
      <label class="machine-source__search">
        <Search :size="15" />
        <input
          v-model="query"
          type="search"
          aria-label="搜索分类、配置或机型"
          placeholder="搜索分类、配置或机型…"
        >
      </label>
      <AIconButton
        :icon="allGroupsExpanded ? ChevronsUp : ChevronsDown"
        :label="`${allGroupsExpanded ? '折叠' : '展开'}全部分类`"
        size="small"
        side="bottom"
        :disabled="groups.length === 0"
        @click="toggleAllGroups"
      />
    </div>
    <div v-if="editable" class="machine-source__actions">
      <button
        class="machine-source__action"
        type="button"
        @click="emit('createGroup')"
      >
        <Plus :size="14" />分类
      </button>
      <button
        v-if="allowConfigurations"
        class="machine-source__action"
        type="button"
        aria-label="新建配置"
        @click="emit('createConfiguration')"
      >
        <FolderPlus :size="14" />配置
      </button>
      <button
        class="machine-source__action machine-source__action--primary"
        type="button"
        @click="emit('createItem')"
      >
        <Plus :size="14" />机型
      </button>
    </div>
    <div ref="tree" class="machine-source__tree">
      <section
        v-for="group in visibleGroups"
        :key="group.name"
        class="machine-group"
        data-node-kind="group"
        :data-category="group.name"
        @dragover="allowDrop"
        @drop="onGroupDrop($event, group.name)"
      >
        <div class="machine-tree-row machine-tree-row--group">
          <button
            v-if="canSort"
            class="machine-tree-row__handle"
            type="button"
            tabindex="-1"
            :aria-label="`拖拽排序分类 ${group.name}`"
            draggable="true"
            @click.stop
            @dragstart="onGroupDragStart($event, group.name)"
            @dragend="dragging = null"
          >
            <GripVertical :size="14" :stroke-width="1.5" />
          </button>
          <button
            type="button"
            class="machine-tree-row__toggle"
            :aria-expanded="openGroups.has(group.name)"
            :aria-label="`${openGroups.has(group.name) ? '折叠' : '展开'}分类 ${group.name}`"
            :aria-keyshortcuts="editable ? 'F2 Delete' : undefined"
            @click="toggleGroup(group.name)"
            @keydown="onGroupKeydown($event, group.name)"
          >
            <ChevronDown v-if="openGroups.has(group.name)" :size="15" />
            <ChevronRight v-else :size="15" />
            <span :title="group.name">{{ group.name }}</span>
          </button>
          <span class="machine-tree-row__count">{{
            groupItemCount(group)
          }}</span>
          <span v-if="editable" class="machine-tree-row__tools">
            <button
              class="machine-tree-row__tool"
              type="button"
              tabindex="-1"
              :aria-label="`编辑分类 ${group.name}`"
              @click="emit('editGroup', group.name)"
            >
              <Edit3 :size="13" />
            </button>
            <button
              class="machine-tree-row__tool"
              type="button"
              tabindex="-1"
              :aria-label="`删除分类 ${group.name}`"
              @click="emit('deleteGroup', group.name)"
            >
              <Trash2 :size="13" />
            </button>
          </span>
        </div>

        <template v-if="openGroups.has(group.name) || query">
          <div
            v-for="configuration in group.configurations ?? []"
            :key="configuration.name"
            class="machine-configuration"
          >
            <div
              class="machine-tree-row machine-tree-row--configuration"
              data-node-kind="configuration"
              :data-category="group.name"
              :data-configuration="configuration.name"
              @dragover="allowDrop"
              @drop="
                onConfigurationDrop($event, group.name, configuration.name)
              "
            >
              <button
                v-if="canSort"
                class="machine-tree-row__handle"
                type="button"
                tabindex="-1"
                :aria-label="`拖拽排序配置 ${configuration.name}`"
                draggable="true"
                @click.stop
                @dragstart="
                  onConfigurationDragStart(
                    $event,
                    group.name,
                    configuration.name,
                  )
                "
                @dragend="dragging = null"
              >
                <GripVertical :size="14" :stroke-width="1.5" />
              </button>
              <button
                type="button"
                class="machine-tree-row__toggle"
                :aria-expanded="
                  openConfigurations.has(
                    configurationKey(group.name, configuration.name),
                  )
                "
                :aria-label="`${
                  openConfigurations.has(
                    configurationKey(group.name, configuration.name),
                  )
                    ? '折叠'
                    : '展开'
                }配置 ${configuration.name}`"
                :aria-keyshortcuts="editable ? 'F2 Delete' : undefined"
                @click="toggleConfiguration(group.name, configuration.name)"
                @keydown="
                  onConfigurationKeydown($event, group.name, configuration.name)
                "
              >
                <ChevronDown
                  v-if="
                    openConfigurations.has(
                      configurationKey(group.name, configuration.name),
                    )
                  "
                  :size="14"
                />
                <ChevronRight v-else :size="14" />
                <span :title="configuration.name">{{
                  configuration.name
                }}</span>
              </button>
              <span class="machine-tree-row__count">{{
                configuration.items.length
              }}</span>
              <span v-if="editable" class="machine-tree-row__tools">
                <button
                  class="machine-tree-row__tool"
                  type="button"
                  tabindex="-1"
                  :aria-label="`编辑配置 ${configuration.name}`"
                  @click="
                    emit('editConfiguration', {
                      category: group.name,
                      configuration: configuration.name,
                    })
                  "
                >
                  <Edit3 :size="13" />
                </button>
                <button
                  class="machine-tree-row__tool"
                  type="button"
                  tabindex="-1"
                  :aria-label="`删除配置 ${configuration.name}`"
                  @click="
                    emit('deleteConfiguration', {
                      category: group.name,
                      configuration: configuration.name,
                    })
                  "
                >
                  <Trash2 :size="13" />
                </button>
              </span>
            </div>
            <template
              v-if="
                openConfigurations.has(
                  configurationKey(group.name, configuration.name),
                ) || query
              "
            >
              <div
                v-for="item in configuration.items"
                :key="`${configuration.name}-${item}`"
                class="machine-tree-row machine-tree-row--item"
                :class="{
                  'is-selected': isSelected(
                    group.name,
                    configuration.name,
                    item,
                  ),
                }"
                data-node-kind="item"
                :data-category="group.name"
                :data-configuration="configuration.name"
                :data-item="item"
                @dragover="allowDrop"
                @drop="onItemDrop($event, group.name, configuration.name, item)"
              >
                <button
                  v-if="canSort"
                  class="machine-tree-row__handle"
                  type="button"
                  tabindex="-1"
                  :aria-label="`拖拽排序机型 ${item}`"
                  draggable="true"
                  @click.stop
                  @dragstart="
                    onItemDragStart(
                      $event,
                      group.name,
                      configuration.name,
                      item,
                    )
                  "
                  @dragend="dragging = null"
                >
                  <GripVertical :size="14" :stroke-width="1.5" />
                </button>
                <label
                  v-if="checkedItems"
                  class="machine-tree-row__check"
                  @click.stop
                >
                  <input
                    type="checkbox"
                    tabindex="-1"
                    :aria-label="`选择 ${item}`"
                    :checked="
                      checkedItems.includes(
                        itemKey(group.name, configuration.name, item),
                      )
                    "
                    @change="
                      emit('toggleCheck', {
                        category: group.name,
                        configuration: configuration.name,
                        item,
                        checked: ($event.target as HTMLInputElement).checked,
                      })
                    "
                  >
                </label>
                <button
                  class="machine-tree-row__select"
                  type="button"
                  :data-category="group.name"
                  :data-configuration="configuration.name"
                  :data-item="item"
                  :data-tree-key="itemKey(group.name, configuration.name, item)"
                  :tabindex="rowTabIndex(group.name, configuration.name, item)"
                  :aria-label="item"
                  :aria-current="
                    isSelected(group.name, configuration.name, item)
                      ? 'true'
                      : undefined
                  "
                  aria-keyshortcuts="Enter Space F2 Delete ArrowUp ArrowDown Alt+ArrowUp Alt+ArrowDown Home End"
                  @click="
                    focusedItemKey = itemKey(
                      group.name,
                      configuration.name,
                      item,
                    );
                    emit('select', {
                      category: group.name,
                      configuration: configuration.name,
                      item,
                    });
                  "
                  @keydown="
                    onItemKeydown($event, group.name, configuration.name, item)
                  "
                >
                  <span class="machine-tree-row__name" :title="item">{{
                    item
                  }}</span>
                </button>
                <span v-if="editable" class="machine-tree-row__tools">
                  <button
                    class="machine-tree-row__tool"
                    type="button"
                    tabindex="-1"
                    :aria-label="`编辑机型 ${item}`"
                    @click.stop="
                      emit('editItem', {
                        category: group.name,
                        configuration: configuration.name,
                        item,
                      })
                    "
                  >
                    <Edit3 :size="13" />
                  </button>
                  <button
                    class="machine-tree-row__tool"
                    type="button"
                    tabindex="-1"
                    :aria-label="`删除机型 ${item}`"
                    @click.stop="
                      emit('deleteItem', {
                        category: group.name,
                        configuration: configuration.name,
                        item,
                      })
                    "
                  >
                    <Trash2 :size="13" />
                  </button>
                </span>
              </div>
            </template>
          </div>

          <div
            v-for="item in group.items"
            :key="`direct-${item}`"
            class="machine-tree-row machine-tree-row--item machine-tree-row--direct"
            :class="{
              'is-selected': isSelected(group.name, null, item),
            }"
            data-node-kind="item"
            :data-category="group.name"
            data-configuration=""
            :data-item="item"
            @dragover="allowDrop"
            @drop="onItemDrop($event, group.name, null, item)"
          >
            <button
              v-if="canSort"
              class="machine-tree-row__handle"
              type="button"
              tabindex="-1"
              :aria-label="`拖拽排序机型 ${item}`"
              draggable="true"
              @click.stop
              @dragstart="onItemDragStart($event, group.name, null, item)"
              @dragend="dragging = null"
            >
              <GripVertical :size="14" :stroke-width="1.5" />
            </button>
            <label
              v-if="checkedItems"
              class="machine-tree-row__check"
              @click.stop
            >
              <input
                type="checkbox"
                tabindex="-1"
                :aria-label="`选择 ${item}`"
                :checked="
                  checkedItems.includes(itemKey(group.name, null, item))
                "
                @change="
                  emit('toggleCheck', {
                    category: group.name,
                    configuration: null,
                    item,
                    checked: ($event.target as HTMLInputElement).checked,
                  })
                "
              >
            </label>
            <button
              class="machine-tree-row__select"
              type="button"
              :data-category="group.name"
              data-configuration=""
              :data-item="item"
              :data-tree-key="itemKey(group.name, null, item)"
              :tabindex="rowTabIndex(group.name, null, item)"
              :aria-label="item"
              :aria-current="
                isSelected(group.name, null, item) ? 'true' : undefined
              "
              aria-keyshortcuts="Enter Space F2 Delete ArrowUp ArrowDown Alt+ArrowUp Alt+ArrowDown Home End"
              @click="
                focusedItemKey = itemKey(group.name, null, item);
                emit('select', {
                  category: group.name,
                  configuration: null,
                  item,
                });
              "
              @keydown="onItemKeydown($event, group.name, null, item)"
            >
              <span class="machine-tree-row__name" :title="item">{{ item }}</span>
            </button>
            <span v-if="editable" class="machine-tree-row__tools">
              <button
                class="machine-tree-row__tool"
                type="button"
                tabindex="-1"
                :aria-label="`编辑机型 ${item}`"
                @click.stop="
                  emit('editItem', {
                    category: group.name,
                    configuration: null,
                    item,
                  })
                "
              >
                <Edit3 :size="13" />
              </button>
              <button
                class="machine-tree-row__tool"
                type="button"
                tabindex="-1"
                :aria-label="`删除机型 ${item}`"
                @click.stop="
                  emit('deleteItem', {
                    category: group.name,
                    configuration: null,
                    item,
                  })
                "
              >
                <Trash2 :size="13" />
              </button>
            </span>
          </div>
        </template>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.machine-source {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-width: 0;
  height: 100%;
  padding: 10px 12px;
  border-right: 1px solid var(--separator);
  overflow: hidden;
  background: var(--bg-content);
}

.machine-source__resizer {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 3;
  width: var(--space-2);
  height: 100%;
  padding: 0;
  appearance: none;
  cursor: col-resize;
  background: transparent;
  border: 0;
}

.machine-source__resizer::before {
  position: absolute;
  inset: 0 calc(var(--space-2) * -1);
  content: '';
}

.machine-source__search-row {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  align-items: center;
}

.machine-source__search {
  flex: 1;
  min-width: 0;
  height: var(--control-height-md);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  background: var(--fill-3);
  color: var(--label-2);
  font: var(--text-caption);
  transition: background-color var(--dur-1) var(--ease-out), box-shadow var(--dur-1) var(--ease-out);
}

.machine-source__search:focus-within {
  background: var(--fill-2);
  box-shadow: var(--focus-ring);
}

.machine-source__search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  color: var(--label);
}

.machine-source__actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin: 8px 0 10px;
}

.machine-source__action {
  height: var(--control-height-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--separator);
  border-radius: var(--radius-sm);
  background: var(--fill-4);
  color: var(--label);
  font: var(--text-caption);
  cursor: pointer;
  transition:
    background-color var(--dur-1) var(--ease-out),
    border-color var(--dur-1) var(--ease-out),
    color var(--dur-1) var(--ease-out);
}

.machine-source__action:hover {
  background: var(--fill-3);
  border-color: var(--separator-opaque);
}

.machine-source__action--primary {
  color: var(--sys-blue);
  border-color: var(--sys-blue-fill-strong);
  background: var(--sys-blue-fill);
  font-weight: 500;
}

.machine-source__action--primary:hover {
  background: var(--sys-blue-fill-strong);
}

.machine-source__tree {
  flex: 1;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 2px;
  overflow: hidden auto;
}

.machine-tree-row {
  position: relative;
  min-height: 30px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--radius-sm);
  color: var(--label);
  font: var(--text-caption);
  transition: background-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
}

.machine-tree-row--group {
  font-weight: 600;
  padding: 0 4px;
}

.machine-tree-row--configuration {
  padding-left: 14px;
  padding-right: 4px;
  color: var(--label-2);
  font-weight: 500;
}

.machine-tree-row--item {
  padding: 3px 4px 3px 30px;
  cursor: pointer;
}

.machine-tree-row--direct {
  padding-left: 16px;
}

.machine-tree-row--item:hover,
.machine-tree-row--item.is-selected {
  background: var(--sys-blue-fill);
  color: var(--sys-blue);
}

.machine-tree-row__toggle {
  min-width: 0;
  flex: 1;
  display: flex;
  align-self: stretch;
  align-items: center;
  gap: 5px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.machine-tree-row__handle {
  width: 24px;
  height: 24px;
  display: grid;
  flex-shrink: 0;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--label-3);
  cursor: grab;
  opacity: 0;
  transition: opacity var(--dur-1) var(--ease-out);
}

.machine-tree-row__check {
  display: grid;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  place-items: center;
  cursor: pointer;
}

.machine-tree-row__check input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--sys-blue);
  cursor: pointer;
}

.machine-tree-row__select {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  align-self: stretch;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
}

.machine-tree-row__handle:active {
  cursor: grabbing;
}

.machine-tree-row:hover .machine-tree-row__handle,
.machine-tree-row:focus-within .machine-tree-row__handle {
  opacity: 1;
}

.machine-tree-row__toggle span,
.machine-tree-row__name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.machine-tree-row__count {
  padding: 0 6px;
  font: var(--text-caption);
  line-height: 16px;
  color: var(--label-placeholder);
  background: var(--fill-3);
  border-radius: var(--radius-pill);
}

.machine-tree-row__tools {
  position: absolute;
  top: 50%;
  right: var(--space-1);
  display: inline-flex;
  gap: 1px;
  pointer-events: none;
  background: var(--bg-content);
  border-radius: var(--radius-sm);
  box-shadow: calc(var(--space-2) * -2) 0 var(--space-2) var(--bg-content);
  opacity: 0;
  transform: translateY(-50%);
}

.machine-tree-row:hover .machine-tree-row__tools,
.machine-tree-row:focus-within .machine-tree-row__tools {
  pointer-events: auto;
  opacity: 1;
}

.machine-tree-row__tool {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--label-2);
  cursor: pointer;
  border-radius: var(--radius-xs);
  transition: background-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
}

.machine-tree-row__tool:hover {
  background: var(--fill-3);
  color: var(--label);
}

.machine-tree-row__tool:last-child:hover {
  background: var(--sys-red-fill);
  color: var(--sys-red);
}
</style>
