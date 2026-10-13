import {
  entityTreeItemKey,
  type EntityGroup,
  type MachineNodeRef,
  type MachineTab,
} from '@/domain';
import {
  configurationKey,
  groupKey,
} from '@/pages/selection/entity/entity-tree-data';

/**
 * 机型选单节点与二级 Tab 的纯逻辑。选单节点的下一层只能二选一：
 * 有子选单（配置 / 机型）就没有二级 Tab，有二级 Tab 就不能再加子选单。
 */

export const sameNode = (left: MachineNodeRef, right: MachineNodeRef) =>
  left.category === right.category &&
  left.configuration === right.configuration &&
  left.item === right.item;

/** 节点显示名：机型名 / 配置名 / 分类名 */
export const nodeLabel = (node: MachineNodeRef) =>
  node.item ?? node.configuration ?? node.category;

/** 节点在目录树里的 key（和 EntityTree 的节点 key 一致） */
export function nodeTreeKey(node: MachineNodeRef): string {
  if (node.item) {
    return entityTreeItemKey({
      category: node.category,
      configuration: node.configuration,
      name: node.item,
    });
  }
  return node.configuration
    ? configurationKey(node.category, node.configuration)
    : groupKey(node.category);
}

/** 节点有没有子选单；节点不存在时为 null */
export function nodeHasChildren(
  groups: readonly EntityGroup[],
  node: MachineNodeRef,
): boolean | null {
  const group = groups.find((candidate) => candidate.name === node.category);
  if (!group) return null;
  const configuration = node.configuration
    ? group.configurations?.find((item) => item.name === node.configuration)
    : undefined;
  if (node.configuration && !configuration) return null;
  if (node.item) {
    const items = configuration ? configuration.items : group.items;
    return items.includes(node.item) ? false : null;
  }
  if (configuration) return configuration.items.length > 0;
  return group.items.length > 0 || (group.configurations?.length ?? 0) > 0;
}

/** Tab 下属于这个节点的二级 Tab */
export const pagesOf = (tab: MachineTab, node: MachineNodeRef) =>
  tab.pages.filter((page) => sameNode(page.node, node));

/** 已有二级 Tab 的分组 / 配置在目录树里的 key：它们不能再加子选单 */
export function lockedBranchKeys(tabs: readonly MachineTab[]): Set<string> {
  return new Set(
    tabs.flatMap((tab) =>
      tab.pages
        .filter((page) => !page.node.item)
        .map((page) => nodeTreeKey(page.node)),
    ),
  );
}

const text = (value: unknown) => String(value || '');

/**
 * 地址栏 ?category=&configuration=&item= 指向的节点：有 item 是机型，
 * 只有 configuration 是配置，只有 category 是分类。节点不存在时为 null。
 */
export function nodeFromQuery(
  groups: readonly EntityGroup[],
  query: Record<string, unknown>,
): MachineNodeRef | null {
  const category = text(query.category);
  if (!category) return null;
  const item = text(query.item) || null;
  let configuration = text(query.configuration) || null;
  // 旧链接只带 category + item：机型可能在某个配置下
  if (item && !configuration) {
    const group = groups.find((candidate) => candidate.name === category);
    if (group && !group.items.includes(item)) {
      configuration =
        group.configurations?.find((entry) => entry.items.includes(item))
          ?.name ?? null;
    }
  }
  const node: MachineNodeRef = { category, configuration, item };
  return nodeHasChildren(groups, node) === null ? null : node;
}
