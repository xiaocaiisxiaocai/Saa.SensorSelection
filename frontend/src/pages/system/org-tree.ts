import type { OrgUnitNode } from '@/api';
import type { TreeNode } from '@/ui';

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
    list.sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
    for (const item of list) sort(item.children);
  };
  sort(roots);
  return roots;
}

export function toTreeSelectNodes(nodes: OrgUnitNode[]): TreeNode[] {
  const map = (tree: OrgTreeNode[]): TreeNode[] =>
    tree.map((node) => ({
      id: node.id,
      label: node.level ? `${node.name}（${node.level}）` : node.name,
      children: node.children.length ? map(node.children) : undefined,
    }));
  return map(buildOrgTree(nodes));
}

export const ORG_LEVELS = ['事业部', '部门', '课别'] as const;

const ORG_LEVEL_RANK: Record<string, number> = {
  事业部: 3,
  部门: 2,
  课别: 1,
};

export const ORG_LEVEL_INVERTED_MESSAGE =
  '层级不能倒挂（事业部 > 部门 > 课别，允许跳级）';

export function canPlaceOrgLevel(
  parentLevel: string | null | undefined,
  childLevel: string | null | undefined,
): boolean {
  const parent = parentLevel ? ORG_LEVEL_RANK[parentLevel] : undefined;
  const child = childLevel ? ORG_LEVEL_RANK[childLevel] : undefined;
  if (parent == null || child == null) return true;
  return parent >= child;
}

export function allowedOrgLevels(
  parentLevel: string | null | undefined,
  descendantLevels: readonly (string | null | undefined)[] = [],
): string[] {
  return ORG_LEVELS.filter(
    (level) =>
      canPlaceOrgLevel(parentLevel, level) &&
      descendantLevels.every((descendant) => canPlaceOrgLevel(level, descendant)),
  );
}

export function collectDescendantLevels(
  nodes: OrgUnitNode[],
  id: number,
): string[] {
  const tree = buildOrgTree(nodes);
  const find = (list: OrgTreeNode[]): OrgTreeNode | undefined => {
    for (const node of list) {
      if (node.id === id) return node;
      const nested = find(node.children);
      if (nested) return nested;
    }
    return undefined;
  };
  const root = find(tree);
  if (!root) return [];
  const levels: string[] = [];
  const walk = (items: OrgTreeNode[]) => {
    for (const item of items) {
      if (item.level) levels.push(item.level);
      walk(item.children);
    }
  };
  walk(root.children);
  return levels;
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
