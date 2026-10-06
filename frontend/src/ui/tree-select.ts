export interface TreeNode {
  id: string | number;
  label: string;
  hint?: string;
  disabled?: boolean;
  children?: TreeNode[];
}

export interface FlatTreeNode {
  id: string | number;
  label: string;
  hint?: string;
  disabled?: boolean;
  depth: number;
  hasChildren: boolean;
  parentIds: Array<string | number>;
}

export function flattenTree(
  nodes: TreeNode[],
  expanded: ReadonlySet<string>,
  parents: Array<string | number> = [],
): FlatTreeNode[] {
  const rows: FlatTreeNode[] = [];

  for (const node of nodes) {
    const children = node.children ?? [];
    const idKey = String(node.id);
    rows.push({
      id: node.id,
      label: node.label,
      hint: node.hint,
      disabled: node.disabled,
      depth: parents.length,
      hasChildren: children.length > 0,
      parentIds: parents,
    });

    if (children.length > 0 && expanded.has(idKey)) {
      rows.push(...flattenTree(children, expanded, [...parents, node.id]));
    }
  }

  return rows;
}

export function findTreeLabel(
  nodes: TreeNode[],
  id: string | number | null,
): string | undefined {
  if (id == null) {
    return undefined;
  }

  for (const node of nodes) {
    if (node.id === id) {
      return node.label;
    }

    const nested = findTreeLabel(node.children ?? [], id);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const value = query.trim().toLocaleLowerCase('zh-CN');
  if (!value) {
    return nodes;
  }

  const walk = (list: TreeNode[]): TreeNode[] =>
    list.flatMap((node) => {
      const children = walk(node.children ?? []);
      const matched = node.label.toLocaleLowerCase('zh-CN').includes(value);
      if (!matched && children.length === 0) {
        return [];
      }

      return [{ ...node, children }];
    });

  return walk(nodes);
}

export function collectExpandableIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];

  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      const children = node.children ?? [];
      if (children.length > 0) {
        ids.push(String(node.id));
        walk(children);
      }
    }
  };

  walk(nodes);
  return ids;
}

/**
 * 返回从根到目标节点之间的全部祖先 id（不含目标自身，按根 → 父排列）。
 * 找不到目标时返回空数组。打开下拉时据此展开祖先，让已选的深层节点可见。
 */
export function findTreeAncestorIds(
  nodes: TreeNode[],
  id: string | number | null,
): string[] {
  if (id == null) {
    return [];
  }

  const walk = (list: TreeNode[], parents: string[]): string[] | null => {
    for (const node of list) {
      if (node.id === id) {
        return parents;
      }

      const found = walk(node.children ?? [], [...parents, String(node.id)]);
      if (found) {
        return found;
      }
    }

    return null;
  };

  return walk(nodes, []) ?? [];
}
