import type { OrgUnitNode } from '@/api';

export interface OrgTreeNode extends OrgUnitNode {
  children: OrgTreeNode[];
}

export function buildOrgTree(nodes: OrgUnitNode[]): OrgTreeNode[] {
  const byId = new Map<number, OrgTreeNode>();
  for (const node of nodes) {
    byId.set(node.id, { ...node, children: [] });
  }
  const roots: OrgTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId === null ? undefined : byId.get(node.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: OrgTreeNode[]) => {
    list.sort(
      (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
    );
    for (const item of list) sort(item.children);
  };
  sort(roots);
  return roots;
}

export interface OrgTreeSelectNode {
  title: string;
  value: number;
  key: number;
  children?: OrgTreeSelectNode[];
}

/** 组织树 → a-tree-select 的 tree-data。 */
export function toTreeSelectNodes(nodes: OrgUnitNode[]): OrgTreeSelectNode[] {
  const map = (tree: OrgTreeNode[]): OrgTreeSelectNode[] =>
    tree.map((node) => ({
      title: node.level ? `${node.name}（${node.level}）` : node.name,
      value: node.id,
      key: node.id,
      children: node.children.length ? map(node.children) : undefined,
    }));
  return map(buildOrgTree(nodes));
}

/** 组织层级必须逐级：顶层是事业部，事业部下是部门，部门下是课别 */
export const ORG_LEVELS = ['事业部', '部门', '课别'] as const;

/** 课别是最末一级：下面不能再有任何组织 */
export const ORG_LEAF_LEVEL = '课别';

export const ORG_LEAF_MESSAGE = '课别是最末一级，下面不能再新建组织';

export const ORG_PARENT_LEVEL_MISSING_MESSAGE =
  '上级组织没有设置层级，请先编辑上级组织';

export function canHaveOrgChildren(level: string | null | undefined): boolean {
  return level?.trim() !== ORG_LEAF_LEVEL;
}

/**
 * 按位置算出的层级：顶层是事业部，其余是上级的下一级。
 * 上级是课别或没有标准层级时为 null（后端会拒绝保存）。
 */
export function orgLevelUnder(
  parentLevel: string | null | undefined,
  isRoot: boolean,
): string | null {
  if (isRoot) return ORG_LEVELS[0];
  const index = ORG_LEVELS.findIndex((level) => level === parentLevel?.trim());
  return index >= 0 ? (ORG_LEVELS[index + 1] ?? null) : null;
}

/** 新建时的同级排序：排在同一上级下现有组织的最后 */
export function nextOrgSortOrder(
  nodes: readonly OrgUnitNode[],
  parentId: number | null,
): number {
  const siblings = nodes.filter((node) => node.parentId === parentId);
  return siblings.length
    ? Math.max(...siblings.map((node) => node.sortOrder)) + 1
    : 1;
}

export function flattenOrgTree(
  nodes: OrgTreeNode[],
  depth = 0,
): Array<{ depth: number; node: OrgTreeNode }> {
  return nodes.flatMap((node) => [
    { depth, node },
    ...flattenOrgTree(node.children, depth + 1),
  ]);
}
