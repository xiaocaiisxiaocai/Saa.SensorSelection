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

import type { TreeCheckState } from '@/pages/selection/entity/entity-tree-data';

import EntityTree from './EntityTree.vue';

const props = defineProps<{
  kind: EntityKind;
  selected: string;
  /** 当前选中叶子所在的分组；客户目录里区域名会在不同客户下重复，需要它区分 */
  selectedCategory?: string;
  selectedKey?: string;
  checkState?: TreeCheckState;
  machineType?: MachineCatalogKind;
  /** 机型：已有二级 Tab 的分组 / 配置 key，不能再加子节点 */
  lockedBranches?: ReadonlySet<string>;
}>();

const emit = defineEmits<{
  select: [
    payload: { category: string; configuration?: string | null; item: string },
  ];
  checkNode: [payload: { key: string; checked: boolean }];
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

const treeGroups = computed(() =>
  visibleEntityGroups(
    store.entityGroups(props.kind),
    props.kind,
    props.machineType,
  ),
);

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
    { 'not-empty': '请先清空该配置下的全部机型和二级 Tab' },
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
      'not-empty':
        props.kind === 'machine'
          ? `请先清空该${groupLabel.value}下的全部${itemLabel.value}和二级 Tab`
          : `请先清空该${groupLabel.value}下的全部${itemLabel.value}`,
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
      'not-empty':
        props.kind === 'machine'
          ? `请先清空该${itemLabel.value}在各个 Tab 下的记录`
          : `请先清空该${itemLabel.value}下的业务数据`,
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
  notifyResult(
    store.reorderEntityItems(
      props.kind,
      payload.category,
      payload.oldIndex,
      payload.newIndex,
      payload.configuration,
    ),
    '',
  );
}
</script>

<template>
  <div class="entity-source" :class="`entity-source--${kind}`">
    <EntityTree
      :groups="treeGroups"
      :selected="selected"
      :selected-key="selectedKey"
      :check-state="checkState"
      :editable="writable"
      :sortable="writable"
      :allow-configurations="kind === 'machine' && machineType !== 'project'"
      :group-label="groupLabel"
      :item-label="itemLabel"
      :selectable-branches="kind === 'machine'"
      :locked-branches="lockedBranches"
      @select="onSelect"
      @check-node="emit('checkNode', $event)"
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
