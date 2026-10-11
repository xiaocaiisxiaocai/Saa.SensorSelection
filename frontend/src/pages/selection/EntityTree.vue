<script setup lang="ts">
import type { TreeProps } from 'ant-design-vue';
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Ellipsis,
  FolderPlus,
  Plus,
  Search,
} from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import { entityTreeItemKey, type EntityGroup } from '@/domain';

/**
 * 客户（区域 → 客户）与机型（分类 → 配置 → 机型）共用的左侧目录树，
 * 直接基于 a-tree：展开/选中/勾选/拖拽排序都是 antd 自带交互，
 * 节点的编辑删除放在每行的「更多」下拉菜单里。
 */
type NodeKind = 'group' | 'configuration' | 'item';

interface EntityNode {
  key: string;
  title: string;
  kind: NodeKind;
  category: string;
  configuration: string | null;
  item?: string;
  count?: number;
  selectable: boolean;
  checkable: boolean;
  isLeaf?: boolean;
  children?: EntityNode[];
}

type ItemPayload = {
  category: string;
  configuration: string | null;
  item: string;
};

const props = withDefaults(
  defineProps<{
    groups: EntityGroup[];
    selected: string;
    selectedKey?: string;
    checkedItems?: string[];
    editable?: boolean;
    sortable?: boolean;
    allowConfigurations?: boolean;
    groupLabel: string;
    itemLabel: string;
  }>(),
  {
    editable: false,
    sortable: false,
    allowConfigurations: false,
    selectedKey: undefined,
    checkedItems: undefined,
  },
);

const emit = defineEmits<{
  select: [payload: ItemPayload];
  toggleCheck: [payload: ItemPayload & { checked: boolean }];
  createGroup: [];
  editGroup: [name: string];
  deleteGroup: [name: string];
  createConfiguration: [category?: string];
  editConfiguration: [payload: { category: string; configuration: string }];
  deleteConfiguration: [payload: { category: string; configuration: string }];
  createItem: [payload?: { category: string; configuration: string | null }];
  editItem: [payload: ItemPayload];
  deleteItem: [payload: ItemPayload];
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
}>();

const query = ref('');
const keyword = computed(() => query.value.trim().toLocaleLowerCase('zh-CN'));
const canSort = computed(
  () => props.sortable && props.editable && keyword.value === '',
);

const groupKey = (category: string) => `group:${category}`;
const configurationKey = (category: string, configuration: string) =>
  `configuration:${JSON.stringify([category, configuration])}`;
const itemKey = (
  category: string,
  configuration: string | null,
  item: string,
) => entityTreeItemKey({ category, configuration, name: item });

const matches = (text: string) =>
  !keyword.value || text.toLocaleLowerCase('zh-CN').includes(keyword.value);

function itemNode(
  category: string,
  configuration: string | null,
  item: string,
): EntityNode {
  return {
    key: itemKey(category, configuration, item),
    title: item,
    kind: 'item',
    category,
    configuration,
    item,
    selectable: true,
    checkable: true,
    isLeaf: true,
  };
}

const treeData = computed<EntityNode[]>(() =>
  props.groups.flatMap((group) => {
    const groupHit = matches(group.name);
    const configurations = (group.configurations ?? []).flatMap(
      (configuration) => {
        const configurationHit = groupHit || matches(configuration.name);
        const items = configuration.items.filter(
          (item) => configurationHit || matches(item),
        );
        if (!configurationHit && items.length === 0) return [];
        return [
          {
            key: configurationKey(group.name, configuration.name),
            title: configuration.name,
            kind: 'configuration' as const,
            category: group.name,
            configuration: configuration.name,
            count: configuration.items.length,
            selectable: false,
            checkable: false,
            children: items.map((item) =>
              itemNode(group.name, configuration.name, item),
            ),
          },
        ];
      },
    );
    const items = group.items.filter((item) => groupHit || matches(item));
    if (!groupHit && configurations.length === 0 && items.length === 0) {
      return [];
    }
    return [
      {
        key: groupKey(group.name),
        title: group.name,
        kind: 'group' as const,
        category: group.name,
        configuration: null,
        count:
          group.items.length +
          (group.configurations ?? []).reduce(
            (sum, configuration) => sum + configuration.items.length,
            0,
          ),
        selectable: false,
        checkable: false,
        children: [
          ...configurations,
          ...items.map((item) => itemNode(group.name, null, item)),
        ],
      },
    ];
  }),
);

function branchKeys(nodes: EntityNode[]): string[] {
  return nodes.flatMap((node) =>
    node.children ? [node.key, ...branchKeys(node.children)] : [],
  );
}

// 默认全部展开；之后新增的分组/配置也自动展开，用户手动收起的保持收起。
const expandedKeys = ref<string[]>(branchKeys(treeData.value));
const seenBranches = new Set(expandedKeys.value);
watch(
  () => branchKeys(treeData.value),
  (keys) => {
    const fresh = keys.filter((key) => !seenBranches.has(key));
    fresh.forEach((key) => seenBranches.add(key));
    if (fresh.length) expandedKeys.value = [...expandedKeys.value, ...fresh];
  },
);
// 搜索时展开全部命中的分支，否则命中项可能藏在收起的分组里。
const visibleExpandedKeys = computed(() =>
  keyword.value ? branchKeys(treeData.value) : expandedKeys.value,
);
const allExpanded = computed(() =>
  branchKeys(treeData.value).every((key) => expandedKeys.value.includes(key)),
);

function onExpand(keys: (string | number)[]) {
  if (keyword.value) return;
  expandedKeys.value = keys.map(String);
}

function toggleAll() {
  expandedKeys.value = allExpanded.value ? [] : branchKeys(treeData.value);
}

function toggleBranch(key: string) {
  expandedKeys.value = expandedKeys.value.includes(key)
    ? expandedKeys.value.filter((candidate) => candidate !== key)
    : [...expandedKeys.value, key];
}

function findItemKey(nodes: EntityNode[]): string | undefined {
  for (const node of nodes) {
    if (node.kind === 'item' && node.item === props.selected) return node.key;
    const child = node.children && findItemKey(node.children);
    if (child) return child;
  }
  return undefined;
}

const selectedKeys = computed(() => {
  const key = props.selectedKey || findItemKey(treeData.value);
  return key ? [key] : [];
});

const checkedKeys = computed(() => ({
  checked: props.checkedItems ?? [],
  halfChecked: [],
}));

function payloadOf(node: EntityNode): ItemPayload {
  return {
    category: node.category,
    configuration: node.configuration,
    item: node.item ?? '',
  };
}

const nodeOf = (node: unknown) =>
  ((node as { dataRef?: EntityNode }).dataRef ?? node) as EntityNode;

const onSelect: TreeProps['onSelect'] = (_keys, info) => {
  const node = nodeOf(info.node);
  if (node.kind === 'item') emit('select', payloadOf(node));
};

const onCheck: TreeProps['onCheck'] = (_keys, info) => {
  const node = nodeOf(info.node);
  if (node.kind !== 'item') return;
  emit('toggleCheck', { ...payloadOf(node), checked: Boolean(info.checked) });
};

function siblingsOf(node: EntityNode): string[] {
  const group = props.groups.find((entry) => entry.name === node.category);
  if (node.kind === 'group') return props.groups.map((entry) => entry.name);
  if (node.kind === 'configuration') {
    return (group?.configurations ?? []).map((entry) => entry.name);
  }
  if (node.configuration) {
    return (
      group?.configurations?.find((entry) => entry.name === node.configuration)
        ?.items ?? []
    );
  }
  return group?.items ?? [];
}

const nameOf = (node: EntityNode) =>
  node.kind === 'group'
    ? node.category
    : node.kind === 'configuration'
      ? (node.configuration ?? '')
      : (node.item ?? '');

const sameParent = (a: EntityNode, b: EntityNode) =>
  a.kind === b.kind &&
  (a.kind === 'group' ||
    (a.category === b.category &&
      (a.kind === 'configuration' || a.configuration === b.configuration)));

// 只允许同一父节点下的同级排序（拖到兄弟节点的前/后），不允许改挂父级。
const allowDrop: TreeProps['allowDrop'] = ({
  dragNode,
  dropNode,
  dropPosition,
}) => dropPosition !== 0 && sameParent(nodeOf(dragNode), nodeOf(dropNode));

const draggable = (node: unknown) => canSort.value && Boolean(nodeOf(node));

const onDrop: TreeProps['onDrop'] = (info) => {
  const drag = nodeOf(info.dragNode);
  const target = nodeOf(info.node);
  if (!sameParent(drag, target)) return;
  const siblings = siblingsOf(drag);
  const oldIndex = siblings.indexOf(nameOf(drag));
  const targetIndex = siblings.indexOf(nameOf(target));
  if (oldIndex < 0 || targetIndex < 0) return;
  const pos = String(info.node.pos ?? '').split('-');
  const relative = info.dropPosition - Number(pos[pos.length - 1]);
  let newIndex = relative < 0 ? targetIndex : targetIndex + 1;
  if (oldIndex < newIndex) newIndex -= 1;
  if (newIndex === oldIndex) return;
  if (drag.kind === 'group') emit('reorderGroups', { oldIndex, newIndex });
  else if (drag.kind === 'configuration') {
    emit('reorderConfigurations', {
      category: drag.category,
      oldIndex,
      newIndex,
    });
  } else {
    emit('reorderItems', {
      category: drag.category,
      configuration: drag.configuration,
      oldIndex,
      newIndex,
    });
  }
};

interface MenuAction {
  key: string;
  label: string;
  danger?: boolean;
  run: () => void;
}

function actionsFor(node: EntityNode): MenuAction[] {
  if (node.kind === 'group') {
    return [
      ...(props.allowConfigurations
        ? [
            {
              key: 'create-configuration',
              label: '新建配置',
              run: () => emit('createConfiguration', node.category),
            },
          ]
        : []),
      {
        key: 'create-item',
        label: `新建${props.itemLabel}`,
        run: () =>
          emit('createItem', { category: node.category, configuration: null }),
      },
      {
        key: 'edit',
        label: `编辑${props.groupLabel}`,
        run: () => emit('editGroup', node.category),
      },
      {
        key: 'delete',
        label: `删除${props.groupLabel}`,
        danger: true,
        run: () => emit('deleteGroup', node.category),
      },
    ];
  }
  if (node.kind === 'configuration') {
    const payload = {
      category: node.category,
      configuration: node.configuration ?? '',
    };
    return [
      {
        key: 'create-item',
        label: `新建${props.itemLabel}`,
        run: () =>
          emit('createItem', {
            category: node.category,
            configuration: node.configuration,
          }),
      },
      {
        key: 'edit',
        label: '编辑配置',
        run: () => emit('editConfiguration', payload),
      },
      {
        key: 'delete',
        label: '删除配置',
        danger: true,
        run: () => emit('deleteConfiguration', payload),
      },
    ];
  }
  return [
    {
      key: 'edit',
      label: `编辑${props.itemLabel}`,
      run: () => emit('editItem', payloadOf(node)),
    },
    {
      key: 'delete',
      label: `删除${props.itemLabel}`,
      danger: true,
      run: () => emit('deleteItem', payloadOf(node)),
    },
  ];
}

function runAction(node: EntityNode, key: string | number) {
  actionsFor(node)
    .find((action) => action.key === key)
    ?.run();
}
</script>

<template>
  <a-card
    class="entity-tree"
    size="small"
    :title="`${groupLabel} / ${itemLabel}`"
    :body-style="{ padding: 0 }"
  >
    <template #extra>
      <a-space :size="0">
        <a-tooltip :title="allExpanded ? '全部收起' : '全部展开'">
          <a-button
            type="text"
            size="small"
            :aria-label="allExpanded ? '全部收起' : '全部展开'"
            @click="toggleAll"
          >
            <template #icon>
              <ChevronsDownUp v-if="allExpanded" :size="14" />
              <ChevronsUpDown v-else :size="14" />
            </template>
          </a-button>
        </a-tooltip>
        <template v-if="editable">
          <a-tooltip :title="`新建${groupLabel}`">
            <a-button
              type="text"
              size="small"
              :aria-label="`新建${groupLabel}`"
              @click="emit('createGroup')"
            >
              <template #icon><FolderPlus :size="14" /></template>
            </a-button>
          </a-tooltip>
          <a-tooltip :title="`新建${itemLabel}`">
            <a-button
              type="text"
              size="small"
              :aria-label="`新建${itemLabel}`"
              @click="emit('createItem')"
            >
              <template #icon><Plus :size="14" /></template>
            </a-button>
          </a-tooltip>
        </template>
      </a-space>
    </template>

    <div class="entity-tree__search">
      <a-input
        v-model:value="query"
        :placeholder="`搜索${groupLabel}或${itemLabel}…`"
        :aria-label="`搜索${groupLabel}或${itemLabel}`"
        allow-clear
      >
        <template #prefix><Search :size="14" /></template>
      </a-input>
    </div>

    <div class="entity-tree__body">
      <a-tree
        v-if="treeData.length"
        block-node
        :tree-data="treeData"
        :expanded-keys="visibleExpandedKeys"
        :selected-keys="selectedKeys"
        :checkable="checkedItems !== undefined"
        check-strictly
        :checked-keys="checkedKeys"
        :draggable="canSort ? draggable : false"
        :allow-drop="allowDrop"
        @expand="onExpand"
        @select="onSelect"
        @check="onCheck"
        @drop="onDrop"
      >
        <template #title="{ dataRef }">
          <div
            class="entity-tree__node"
            :data-node-kind="(dataRef as EntityNode).kind"
            :data-category="(dataRef as EntityNode).category"
            :data-configuration="
              (dataRef as EntityNode).configuration ?? undefined
            "
            :data-item="(dataRef as EntityNode).item"
            @click="
              (dataRef as EntityNode).kind !== 'item' &&
                toggleBranch((dataRef as EntityNode).key)
            "
          >
            <span
              class="entity-tree__label"
              :class="{ 'entity-tree__label--group': (dataRef as EntityNode).kind === 'group' }"
              :title="(dataRef as EntityNode).title"
            >
              {{ (dataRef as EntityNode).title }}
            </span>
            <a-typography-text
              v-if="(dataRef as EntityNode).count !== undefined"
              type="secondary"
              class="entity-tree__count"
            >
              {{ (dataRef as EntityNode).count }}
            </a-typography-text>
            <a-dropdown v-if="editable" :trigger="['click']">
              <a-button
                class="entity-tree__more"
                type="text"
                size="small"
                :aria-label="`${(dataRef as EntityNode).title} 的更多操作`"
                @click.stop
              >
                <template #icon><Ellipsis :size="14" /></template>
              </a-button>
              <template #overlay>
                <a-menu
                  @click="
                    ({ key }: { key: string | number }) =>
                      runAction(dataRef as EntityNode, key)
                  "
                >
                  <a-menu-item
                    v-for="action in actionsFor(dataRef as EntityNode)"
                    :key="action.key"
                    :danger="action.danger"
                  >
                    {{ action.label }}
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>
        </template>
      </a-tree>
      <a-empty
        v-else
        :description="query.trim() ? '没有匹配的结果' : `暂无${groupLabel}`"
      />
    </div>
  </a-card>
</template>

<style scoped>
.entity-tree {
  display: flex;
  flex-direction: column;
  width: var(--source-list-width);
  height: 100%;
  min-height: 0;
}

.entity-tree :deep(.ant-card-body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.entity-tree__search {
  padding: var(--space-3);
}

.entity-tree__body {
  flex: 1;
  min-height: 0;
  padding: 0 var(--space-2) var(--space-3);
  overflow: auto;
}

.entity-tree__node {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
}

/* 用 CSS 截断而不是 a-typography 的 ellipsis：后者会把 DOM 里的文字
   直接截短，读屏和页内查找都拿不到完整名称。 */
.entity-tree__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-tree__label--group {
  font-weight: 600;
}

.entity-tree__count {
  flex-shrink: 0;
  font: var(--font-sm);
}

/* 「更多」按钮只在悬停/聚焦行时出现，避免每行都挂一个图标 */
.entity-tree__more {
  flex-shrink: 0;
  opacity: 0;
}

.entity-tree__more:focus-visible,
.entity-tree__more.ant-dropdown-open,
.entity-tree__node:hover .entity-tree__more {
  opacity: 1;
}

@media (hover: none) {
  .entity-tree__more {
    opacity: 1;
  }
}
</style>
