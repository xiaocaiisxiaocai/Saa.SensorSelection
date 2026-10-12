<script setup lang="ts">
import { computed, ref } from 'vue';

import type { EntityKind, MachineCatalogKind } from '@/domain';
import EntityConfigurationDialog from '@/pages/selection/entity/EntityConfigurationDialog.vue';
import EntityGroupDialog from '@/pages/selection/entity/EntityGroupDialog.vue';
import EntityItemDialog from '@/pages/selection/entity/EntityItemDialog.vue';
import {
  entityLabels,
  visibleEntityGroups,
} from '@/pages/selection/entity/entity-labels';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import type { ItemPayload } from '@/pages/selection/entity/entity-tree-data';

import EntityTree from './EntityTree.vue';

type ExternalDropTarget = {
  node: ItemPayload & { kind: 'configuration' | 'group' | 'item' };
  position: 'after' | 'before' | 'inside';
};

const props = defineProps<{
  kind: EntityKind;
  selected: string;
  /** 当前选中叶子所在的分组；客户目录里区域名会在不同客户下重复，需要它区分 */
  selectedCategory?: string;
  selectedKey?: string;
  checkedItems?: string[];
  machineType?: MachineCatalogKind;
  /** 不在目录树里显示的叶子（已放进机型 Tab 的机型） */
  hiddenItems?: readonly string[];
  /** 叶子可拖出树、树接收拖回来的叶子 */
  externalDrag?: boolean;
  /** 叶子「更多」菜单里额外的操作 */
  extraItemActions?: readonly { key: string; label: string }[];
}>();

const emit = defineEmits<{
  select: [
    payload: { category: string; configuration?: string | null; item: string },
  ];
  toggleCheck: [
    payload: {
      category?: string;
      configuration?: string | null;
      item: string;
      checked: boolean;
    },
  ];
  itemAction: [key: string, payload: ItemPayload];
  externalDrop: [name: string, target: ExternalDropTarget | null];
}>();

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

// 客户目录是「客户 → 区域」：分组是客户，叶子是区域
const labels = computed(() => entityLabels(props.kind));
const groupLabel = computed(() => labels.value.group);
const itemLabel = computed(() => labels.value.item);

const groupDialog = ref<InstanceType<typeof EntityGroupDialog>>();
const configurationDialog =
  ref<InstanceType<typeof EntityConfigurationDialog>>();
const itemDialog = ref<InstanceType<typeof EntityItemDialog>>();

const catalogGroups = computed(() =>
  visibleEntityGroups(
    store.entityGroups(props.kind),
    props.kind,
    props.machineType,
  ),
);
const hidden = computed(() => new Set(props.hiddenItems ?? []));
// 已放进 Tab 的机型不在树里显示（数据仍在分组里）
const treeGroups = computed(() =>
  hidden.value.size === 0
    ? catalogGroups.value
    : catalogGroups.value.map((group) => ({
        ...group,
        items: group.items.filter((item) => !hidden.value.has(item)),
        configurations: group.configurations?.map((configuration) => ({
          ...configuration,
          items: configuration.items.filter((item) => !hidden.value.has(item)),
        })),
      })),
);

/** 分组（或分组下某个配置）在存储里的完整叶子列表（含隐藏的） */
function storedSiblings(category: string, configuration: string | null) {
  const group = store
    .entityGroups(props.kind)
    .find((candidate) => candidate.name === category);
  return (
    (configuration
      ? group?.configurations?.find((item) => item.name === configuration)
          ?.items
      : group?.items) ?? []
  );
}

function isSelectedLeaf(category: string | undefined, item: string) {
  return (
    item === props.selected &&
    (props.selectedCategory === undefined ||
      category === props.selectedCategory)
  );
}

function onSelect(payload: {
  category: string;
  configuration: string | null;
  item: string;
}) {
  emit(
    'select',
    props.kind === 'machine'
      ? payload
      : { category: payload.category, item: payload.item },
  );
}

// 改名的正好是当前选中叶子所在的分组：跟着新名字继续选中，别跳回第一个
function onGroupRenamed(previous: string, name: string) {
  if (
    props.selectedCategory !== undefined &&
    previous === props.selectedCategory
  ) {
    emit('select', { category: name, item: props.selected });
  }
}

// 新建的叶子可能落在折叠着的分组里；改名当前选中项时也不能退回第一个
function onItemSaved(payload: {
  category: string;
  name: string;
  previous?: string;
  previousCategory?: string;
}) {
  if (
    !payload.previous ||
    isSelectedLeaf(payload.previousCategory, payload.previous)
  ) {
    emit('select', { category: payload.category, item: payload.name });
  }
}

async function removeConfiguration(payload: {
  category: string;
  configuration: string;
}) {
  const ok = await confirmDelete(
    '删除配置',
    `确认删除“${payload.configuration}”吗？请先清空其下全部机型。`,
  );
  if (!ok) return;
  notifyResult(
    store.deleteMachineConfiguration(payload.category, payload.configuration),
    '配置已删除',
    { 'not-empty': '请先清空该配置下的全部机型' },
  );
}

async function removeGroup(name: string) {
  const ok = await confirmDelete(
    `删除${groupLabel.value}`,
    `确认删除“${name}”吗？请先清空其下全部${itemLabel.value}。`,
  );
  if (!ok) return;
  notifyResult(
    store.deleteEntityGroup(props.kind, name),
    `${groupLabel.value}已删除`,
    {
      'not-empty': `请先清空该${groupLabel.value}下的全部${itemLabel.value}`,
    },
  );
}

async function removeItem(payload: {
  group?: string;
  category?: string;
  configuration?: string | null;
  item: string;
}) {
  const ok = await confirmDelete(
    `删除${itemLabel.value}`,
    `确认删除“${payload.item}”吗？请先清空其下业务数据。`,
  );
  if (!ok) return;
  notifyResult(
    store.deleteEntityItem(
      props.kind,
      payload.item,
      payload.category || payload.group,
      payload.configuration,
    ),
    `${itemLabel.value}已删除`,
    {
      'in-use': `请先清空该${itemLabel.value}下的业务数据`,
      'not-empty': `请先清空该${itemLabel.value}下的业务数据`,
    },
  );
}

function onReorderGroups(payload: { oldIndex: number; newIndex: number }) {
  // 机型目录按类型过滤后展示，下标要换算回全部分组里的位置
  const all = store.entityGroups(props.kind);
  const oldName = treeGroups.value[payload.oldIndex]?.name;
  const newName = treeGroups.value[payload.newIndex]?.name;
  if (!oldName || !newName) return;
  const oldIndex = all.findIndex((group) => group.name === oldName);
  const newIndex = all.findIndex((group) => group.name === newName);
  if (oldIndex < 0 || newIndex < 0) return;
  notifyResult(store.reorderEntityGroups(props.kind, oldIndex, newIndex), '');
}

function onReorderConfigurations(payload: {
  category: string;
  oldIndex: number;
  newIndex: number;
}) {
  const configuration = treeGroups.value.find(
    (group) => group.name === payload.category,
  )?.configurations?.[payload.oldIndex];
  if (!configuration) return;

  notifyResult(
    store.saveMachineConfiguration(
      payload.category,
      { name: configuration.name, sort: payload.newIndex + 1 },
      configuration.name,
    ),
    '',
  );
}

function onReorderItems(payload: {
  category: string;
  configuration: string | null;
  oldIndex: number;
  newIndex: number;
}) {
  // 树里看到的是去掉隐藏机型后的列表，下标要换算回存储里的完整列表
  const visible = treeGroups.value.find(
    (group) => group.name === payload.category,
  );
  const visibleItems =
    (payload.configuration
      ? visible?.configurations?.find(
          (item) => item.name === payload.configuration,
        )?.items
      : visible?.items) ?? [];
  const full = storedSiblings(payload.category, payload.configuration);
  const oldIndex = full.indexOf(visibleItems[payload.oldIndex] ?? '');
  const newIndex = full.indexOf(visibleItems[payload.newIndex] ?? '');
  if (oldIndex < 0 || newIndex < 0) return;
  notifyResult(
    store.reorderEntityItems(
      props.kind,
      payload.category,
      oldIndex,
      newIndex,
      payload.configuration,
    ),
    '',
  );
}

defineExpose({
  /** 改名（机型 Tab 下的机型也用目录的编辑对话框） */
  editItem: (payload: ItemPayload) => itemDialog.value?.openEdit(payload),
  removeItem,
  storedSiblings,
});
</script>

<template>
  <div class="entity-source" :class="`entity-source--${kind}`">
    <EntityTree
      :groups="treeGroups"
      :selected="selected"
      :selected-key="selectedKey"
      :checked-items="checkedItems"
      :editable="writable"
      :sortable="writable"
      :allow-configurations="kind === 'machine' && machineType !== 'project'"
      :group-label="groupLabel"
      :item-label="itemLabel"
      :external-drag="externalDrag"
      :extra-item-actions="extraItemActions"
      @select="onSelect"
      @toggle-check="emit('toggleCheck', $event)"
      @create-group="groupDialog?.openCreate()"
      @edit-group="groupDialog?.openEdit($event)"
      @delete-group="removeGroup"
      @create-configuration="configurationDialog?.openCreate($event)"
      @edit-configuration="configurationDialog?.openEdit($event)"
      @delete-configuration="removeConfiguration"
      @create-item="itemDialog?.openCreate($event)"
      @edit-item="itemDialog?.openEdit($event)"
      @delete-item="removeItem"
      @reorder-groups="onReorderGroups"
      @reorder-configurations="onReorderConfigurations"
      @reorder-items="onReorderItems"
      @item-action="(key, payload) => emit('itemAction', key, payload)"
      @external-drop="(name, target) => emit('externalDrop', name, target)"
    />

    <EntityGroupDialog
      ref="groupDialog"
      :kind="kind"
      :machine-type="machineType"
      @renamed="onGroupRenamed"
    />
    <EntityConfigurationDialog
      v-if="kind === 'machine'"
      ref="configurationDialog"
      :machine-type="machineType"
    />
    <EntityItemDialog
      ref="itemDialog"
      :kind="kind"
      :machine-type="machineType"
      @saved="onItemSaved"
    />
  </div>
</template>
