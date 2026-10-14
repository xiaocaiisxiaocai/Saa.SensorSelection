<script setup lang="ts">
import type { TreeProps } from 'ant-design-vue';
import {
  ChevronsDownUp,
  ChevronsUpDown,
  FolderPlus,
  Plus,
  Search,
} from 'lucide-vue-next';
import { computed, nextTick, ref, watch } from 'vue';

import type { EntityGroup } from '@/domain';
import type { TreeCheckState } from '@/pages/selection/entity/entity-tree-data';
import EntityTreeNode from '@/pages/selection/entity/EntityTreeNode.vue';
import {
  ancestorKeys,
  branchKeys,
  buildEntityTree,
  dropMove,
  findItemKey,
  findNode,
  payloadOf,
  sameParent,
  type EntityNode,
  type ItemPayload,
} from '@/pages/selection/entity/entity-tree-data';

/**
 * 客户（客户 → 区域）与机型（分类 → 配置 → 机型）共用的左侧目录树，
 * 直接基于 a-tree：展开/选中/勾选/拖拽排序都是 antd 自带交互，
 * 节点的编辑删除放在每行的「更多」下拉菜单里（EntityTreeNode）。
 */
const props = withDefaults(
  defineProps<{
    groups: EntityGroup[];
    selected: string;
    selectedKey?: string;
    /** 传入时每个节点都显示勾选框，只有 checkable 里的能勾；勾选状态由父组件计算 */
    checkState?: TreeCheckState;
    editable?: boolean;
    sortable?: boolean;
    allowConfigurations?: boolean;
    groupLabel: string;
    itemLabel: string;
    /** 没有子节点的分组 / 配置也能选中（机型选单的末级节点） */
    selectableBranches?: boolean;
    /**
     * 不能再加子节点的分组 / 配置的 key（机型：已有二级 Tab），
     * 它们「更多」菜单里的新建项禁用，原因写在菜单文字里
     */
    lockedBranches?: ReadonlySet<string>;
  }>(),
  {
    selectableBranches: false,
    lockedBranches: () => new Set<string>(),
    editable: false,
    sortable: false,
    allowConfigurations: false,
    selectedKey: undefined,
    checkState: undefined,
  },
);

const emit = defineEmits<{
  select: [payload: ItemPayload];
  checkNode: [payload: { key: string; checked: boolean }];
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

function withCheckable(
  nodes: EntityNode[],
  checkable: ReadonlySet<string>,
): EntityNode[] {
  // 不能勾的节点也显示（禁用的）勾选框，同一层的名称才对得齐
  return nodes.map((node) => ({
    ...node,
    checkable: true,
    disableCheckbox: !checkable.has(node.key),
    children: node.children && withCheckable(node.children, checkable),
  }));
}

const treeData = computed(() => {
  const nodes = buildEntityTree(
    props.groups,
    keyword.value,
    props.selectableBranches,
  );
  return props.checkState
    ? withCheckable(nodes, props.checkState.checkable)
    : nodes;
});

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

const selectedKeys = computed(() => {
  const key = props.selectedKey || findItemKey(treeData.value, props.selected);
  return key ? [key] : [];
});

// 选中节点变化（含首次进入、从搜索 / 地址栏跳转）时：展开它所在的分支，
// 并把它滚动到可见位置，免得选中项藏在收起的分组里或列表下方
const body = ref<HTMLElement>();
watch(
  () => selectedKeys.value[0],
  async (key) => {
    if (!key) return;
    const ancestors = ancestorKeys(treeData.value, key);
    const collapsed = ancestors.filter(
      (ancestor) => !expandedKeys.value.includes(ancestor),
    );
    if (collapsed.length)
      expandedKeys.value = [...expandedKeys.value, ...collapsed];
    await nextTick();
    body.value
      ?.querySelector('.ant-tree-treenode-selected')
      ?.scrollIntoView?.({ block: 'nearest' });
  },
  { immediate: true, flush: 'post' },
);

// 标题栏的「新建配置」默认放进当前选中节点所在的分类
function createConfigurationFromHeader() {
  const key = selectedKeys.value[0];
  emit(
    'createConfiguration',
    key ? findNode(treeData.value, key)?.category : undefined,
  );
}

const checkedKeys = computed(() => ({
  checked: props.checkState?.checked ?? [],
  halfChecked: props.checkState?.halfChecked ?? [],
}));

const nodeOf = (node: unknown) =>
  ((node as { dataRef?: EntityNode }).dataRef ?? node) as EntityNode;

const onSelect: TreeProps['onSelect'] = (_keys, info) => {
  const node = nodeOf(info.node);
  if (node.kind === 'item' || node.selectable) emit('select', payloadOf(node));
};

const onCheck: TreeProps['onCheck'] = (_keys, info) => {
  emit('checkNode', {
    key: nodeOf(info.node).key,
    checked: Boolean(info.checked),
  });
};

// 只允许同一父节点下的同级排序（拖到兄弟节点的前/后），不允许改挂父级。
const allowDrop: TreeProps['allowDrop'] = ({
  dragNode,
  dropNode,
  dropPosition,
}) => dropPosition !== 0 && sameParent(nodeOf(dragNode), nodeOf(dropNode));

const onDrop: TreeProps['onDrop'] = (info) => {
  const drag = nodeOf(info.dragNode);
  const move = dropMove(
    props.groups,
    drag,
    nodeOf(info.node),
    String(info.node.pos ?? ''),
    info.dropPosition,
  );
  if (!move) return;
  if (drag.kind === 'group') emit('reorderGroups', move);
  else if (drag.kind === 'configuration') {
    emit('reorderConfigurations', { category: drag.category, ...move });
  } else {
    emit('reorderItems', {
      category: drag.category,
      configuration: drag.configuration,
      ...move,
    });
  }
};

interface MenuAction {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

const LOCKED_SUFFIX = '（已有二级 Tab）';

/** 已有二级 Tab 的节点：新建子节点的菜单项禁用 */
function lockCreate(node: EntityNode, action: MenuAction): MenuAction {
  return props.lockedBranches.has(node.key)
    ? { ...action, label: action.label + LOCKED_SUFFIX, disabled: true }
    : action;
}

function actionsFor(node: EntityNode): MenuAction[] {
  if (node.kind === 'group') {
    return [
      ...(props.allowConfigurations
        ? [
            lockCreate(node, {
              key: 'create-configuration',
              label: '新建配置',
              run: () => emit('createConfiguration', node.category),
            }),
          ]
        : []),
      lockCreate(node, {
        key: 'create-item',
        label: `新建${props.itemLabel}`,
        run: () =>
          emit('createItem', { category: node.category, configuration: null }),
      }),
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
      lockCreate(node, {
        key: 'create-item',
        label: `新建${props.itemLabel}`,
        run: () =>
          emit('createItem', {
            category: node.category,
            configuration: node.configuration,
          }),
      }),
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

function runAction(node: EntityNode, key: string) {
  const action = actionsFor(node).find((candidate) => candidate.key === key);
  if (action && !action.disabled) action.run();
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
          <!-- 机型结构目录：标题栏只建分类和配置，机型从配置的「更多」菜单里建 -->
          <a-tooltip v-if="allowConfigurations" title="新建配置">
            <a-button
              type="text"
              size="small"
              aria-label="新建配置"
              @click="createConfigurationFromHeader"
            >
              <template #icon><Plus :size="14" /></template>
            </a-button>
          </a-tooltip>
          <a-tooltip v-else :title="`新建${itemLabel}`">
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

    <div ref="body" class="entity-tree__body">
      <a-tree
        v-if="treeData.length"
        block-node
        :tree-data="treeData"
        :expanded-keys="visibleExpandedKeys"
        :selected-keys="selectedKeys"
        :checkable="checkState !== undefined"
        check-strictly
        :checked-keys="checkedKeys"
        :draggable="canSort"
        :allow-drop="allowDrop"
        @expand="onExpand"
        @select="onSelect"
        @check="onCheck"
        @drop="onDrop"
      >
        <template #title="{ dataRef }">
          <EntityTreeNode
            :node="dataRef as EntityNode"
            :editable="editable"
            :actions="editable ? actionsFor(dataRef as EntityNode) : []"
            @toggle="toggleBranch((dataRef as EntityNode).key)"
            @action="runAction(dataRef as EntityNode, $event)"
          />
        </template>
      </a-tree>
      <a-empty
        v-else
        :description="query.trim() ? '没有匹配的结果' : `暂无${groupLabel}`"
      />
    </div>
  </a-card>
</template>

<style scoped src="./EntityTree.css"></style>
