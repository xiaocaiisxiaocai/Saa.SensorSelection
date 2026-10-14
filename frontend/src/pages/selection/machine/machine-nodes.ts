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

/** 目录树一个节点下（含自身）的末级节点和二级 Tab */
export interface TreeSelectionUnit {
  /** 末级节点（机型，或没有子节点的分类 / 配置）的 key */
  leaves: string[];
  /** 这些末级节点下全部二级 Tab 的 id */
  pageIds: number[];
}

export interface MachineTreeSelection {
  /** 目录树节点 key → 它下面的末级节点与二级 Tab；每个节点都能勾 */
  units: Map<string, TreeSelectionUnit>;
  /** 末级节点 key → 它的二级 Tab id（没有二级 Tab 时为空数组） */
  leafPages: Map<string, number[]>;
}

/**
 * 报告勾选的单位：每个末级节点都能勾。有二级 Tab 的末级节点勾的是它的二级 Tab，
 * 没有二级 Tab 的单独记一个勾（报告里是空的）。勾分支 = 勾它下面全部末级节点。
 */
export function machineTreeSelection(
  groups: readonly EntityGroup[],
  tabs: readonly MachineTab[],
): MachineTreeSelection {
  const leafAncestors = new Map<string, string[]>();
  for (const group of groups) {
    const groupNode = groupKey(group.name);
    const configurations = group.configurations ?? [];
    if (group.items.length === 0 && configurations.length === 0) {
      leafAncestors.set(groupNode, []);
    }
    for (const configuration of configurations) {
      const configurationNode = configurationKey(
        group.name,
        configuration.name,
      );
      if (configuration.items.length === 0) {
        leafAncestors.set(configurationNode, [groupNode]);
      }
      for (const item of configuration.items) {
        leafAncestors.set(
          nodeTreeKey({
            category: group.name,
            configuration: configuration.name,
            item,
          }),
          [groupNode, configurationNode],
        );
      }
    }
    for (const item of group.items) {
      leafAncestors.set(
        nodeTreeKey({ category: group.name, configuration: null, item }),
        [groupNode],
      );
    }
  }

  const leafPages = new Map<string, number[]>(
    [...leafAncestors.keys()].map((key) => [key, []]),
  );
  for (const tab of tabs) {
    for (const page of tab.pages) {
      leafPages.get(nodeTreeKey(page.node))?.push(page.id);
    }
  }

  const units = new Map<string, TreeSelectionUnit>();
  for (const [leaf, ancestors] of leafAncestors) {
    for (const key of [...ancestors, leaf]) {
      const unit = units.get(key) ?? { leaves: [], pageIds: [] };
      unit.leaves.push(leaf);
      unit.pageIds.push(...(leafPages.get(leaf) ?? []));
      units.set(key, unit);
    }
  }
  return { units, leafPages };
}

/** 末级节点的勾选程度：有二级 Tab 的看勾了几个，没有的看是否单独勾了 */
function leafCoverage(
  selection: MachineTreeSelection,
  leaf: string,
  checkedPages: ReadonlySet<number>,
  checkedLeaves: ReadonlySet<string>,
): 'all' | 'some' | 'none' {
  const pages = selection.leafPages.get(leaf) ?? [];
  if (pages.length === 0) return checkedLeaves.has(leaf) ? 'all' : 'none';
  const count = pages.filter((id) => checkedPages.has(id)).length;
  if (count === pages.length) return 'all';
  return count > 0 ? 'some' : 'none';
}

/** 已勾选的末级节点数（有二级 Tab 的勾了任意一个就算） */
export function selectedLeafCount(
  selection: MachineTreeSelection,
  checkedPages: ReadonlySet<number>,
  checkedLeaves: ReadonlySet<string>,
): number {
  return [...selection.leafPages.keys()].filter(
    (leaf) =>
      leafCoverage(selection, leaf, checkedPages, checkedLeaves) !== 'none',
  ).length;
}

/** 目录树的勾选 / 半选节点 */
export function treeCheckState(
  selection: MachineTreeSelection,
  checkedPages: ReadonlySet<number>,
  checkedLeaves: ReadonlySet<string>,
): { checked: string[]; halfChecked: string[] } {
  const state = { checked: [] as string[], halfChecked: [] as string[] };
  for (const [key, unit] of selection.units) {
    const coverage = unit.leaves.map((leaf) =>
      leafCoverage(selection, leaf, checkedPages, checkedLeaves),
    );
    if (coverage.every((value) => value === 'all')) state.checked.push(key);
    else if (coverage.some((value) => value !== 'none')) {
      state.halfChecked.push(key);
    }
  }
  return state;
}
