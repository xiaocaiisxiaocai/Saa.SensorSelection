import { entityTreeItemKey, type EntityGroup } from '@/domain';

/** 目录树节点：分组 → （机型才有的）配置 → 叶子 */
export type NodeKind = 'group' | 'configuration' | 'item';

export interface EntityNode {
  key: string;
  title: string;
  kind: NodeKind;
  category: string;
  configuration: string | null;
  item?: string;
  /** 分组 / 配置下的叶子总数 */
  count?: number;
  /** 分组 / 配置下有没有子节点（按存储算，不受搜索过滤影响） */
  hasChildren?: boolean;
  selectable: boolean;
  checkable: boolean;
  /** 显示勾选框但不能勾（下面没有可勾选的内容） */
  disableCheckbox?: boolean;
  isLeaf?: boolean;
  children?: EntityNode[];
}

/** 目录树的勾选状态：checkable 是能勾选的节点 key，其余节点的勾选框禁用 */
export interface TreeCheckState {
  checked: string[];
  halfChecked: string[];
  checkable: ReadonlySet<string>;
}

export interface ItemPayload {
  category: string;
  configuration: string | null;
  item: string;
}

export const groupKey = (category: string) => `group:${category}`;
export const configurationKey = (category: string, configuration: string) =>
  `configuration:${JSON.stringify([category, configuration])}`;

function itemNode(
  category: string,
  configuration: string | null,
  item: string,
): EntityNode {
  return {
    key: entityTreeItemKey({ category, configuration, name: item }),
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

/**
 * 把分组列表转成 a-tree 的 treeData。keyword（已小写）非空时只保留命中的节点：
 * 分组或配置名命中就带上它下面的全部叶子，否则只带命中的叶子。
 * selectableBranches 时，没有子节点的分组 / 配置也能选中（机型选单的末级节点）。
 */
export function buildEntityTree(
  groups: readonly EntityGroup[],
  keyword: string,
  selectableBranches = false,
): EntityNode[] {
  const matches = (text: string) =>
    !keyword || text.toLocaleLowerCase('zh-CN').includes(keyword);
  return groups.flatMap((group) => {
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
            hasChildren: configuration.items.length > 0,
            selectable: selectableBranches && configuration.items.length === 0,
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
        hasChildren:
          group.items.length > 0 || (group.configurations?.length ?? 0) > 0,
        selectable:
          selectableBranches &&
          group.items.length === 0 &&
          (group.configurations?.length ?? 0) === 0,
        checkable: false,
        children: [
          ...configurations,
          ...items.map((item) => itemNode(group.name, null, item)),
        ],
      },
    ];
  });
}

/** 所有带子节点的分支 key（用于全部展开） */
export function branchKeys(nodes: readonly EntityNode[]): string[] {
  return nodes.flatMap((node) =>
    node.children ? [node.key, ...branchKeys(node.children)] : [],
  );
}

/** 节点 key 的全部祖先分支 key（由外到内）；找不到节点时为空 */
export function ancestorKeys(
  nodes: readonly EntityNode[],
  key: string,
): string[] {
  for (const node of nodes) {
    if (node.key === key) return [];
    if (!node.children) continue;
    const path = ancestorKeys(node.children, key);
    if (path.length || node.children.some((child) => child.key === key)) {
      return [node.key, ...path];
    }
  }
  return [];
}

/** 按叶子名找节点 key（没有 selectedKey 时的退路） */
export function findItemKey(
  nodes: readonly EntityNode[],
  item: string,
): string | undefined {
  for (const node of nodes) {
    if (node.kind === 'item' && node.item === item) return node.key;
    const child = node.children && findItemKey(node.children, item);
    if (child) return child;
  }
  return undefined;
}

export function payloadOf(node: EntityNode): ItemPayload {
  return {
    category: node.category,
    configuration: node.configuration,
    item: node.item ?? '',
  };
}

export const nameOf = (node: EntityNode) =>
  node.kind === 'group'
    ? node.category
    : node.kind === 'configuration'
      ? (node.configuration ?? '')
      : (node.item ?? '');

/** 两个节点是否同级（同一父节点下的同类节点） */
export const sameParent = (a: EntityNode, b: EntityNode) =>
  a.kind === b.kind &&
  (a.kind === 'group' ||
    (a.category === b.category &&
      (a.kind === 'configuration' || a.configuration === b.configuration)));

/** 节点所在那一级的全部名称，顺序与存储一致 */
export function siblingsOf(
  groups: readonly EntityGroup[],
  node: EntityNode,
): string[] {
  const group = groups.find((entry) => entry.name === node.category);
  if (node.kind === 'group') return groups.map((entry) => entry.name);
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

/**
 * 把 a-tree 的 drop 事件换算成同级里的 oldIndex → newIndex。
 * dropPosition 是 antd 的绝对位置，减去目标节点自身下标得到「前 / 后」。
 */
export function dropMove(
  groups: readonly EntityGroup[],
  drag: EntityNode,
  target: EntityNode,
  targetPos: string,
  dropPosition: number,
): { oldIndex: number; newIndex: number } | null {
  if (!sameParent(drag, target)) return null;
  const siblings = siblingsOf(groups, drag);
  const oldIndex = siblings.indexOf(nameOf(drag));
  const targetIndex = siblings.indexOf(nameOf(target));
  if (oldIndex < 0 || targetIndex < 0) return null;
  const pos = targetPos.split('-');
  const relative = dropPosition - Number(pos[pos.length - 1]);
  let newIndex = relative < 0 ? targetIndex : targetIndex + 1;
  if (oldIndex < newIndex) newIndex -= 1;
  return newIndex === oldIndex ? null : { oldIndex, newIndex };
}
