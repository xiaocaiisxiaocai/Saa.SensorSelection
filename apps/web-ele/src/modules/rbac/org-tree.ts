import type { OrgUnitNode } from '../selection/api';

/** 组织树节点（在接口扁平结构上附加 children）。 */
export interface OrgTreeNode extends OrgUnitNode {
  children: OrgTreeNode[];
}

/** 把扁平组织列表构造成树（跳级自然支持：任意节点挂在任意父节点下）。 */
export function buildOrgTree(nodes: OrgUnitNode[]): OrgTreeNode[] {
  const byId = new Map<number, OrgTreeNode>();
  for (const node of nodes) {
    byId.set(node.id, { ...node, children: [] });
  }
  const roots: OrgTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId === null ? undefined : byId.get(node.parentId);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sort = (list: OrgTreeNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    for (const item of list) sort(item.children);
  };
  sort(roots);
  return roots;
}

/** ElCascader 选项（checkStrictly 允许选择任意层级节点）。 */
export function buildCascaderOptions(nodes: OrgUnitNode[]): Array<{
  children: Array<{ label: string; value: number }>;
  label: string;
  value: number;
}> {
  const toOptions = (
    tree: OrgTreeNode[],
  ): Array<{ children: never[]; label: string; value: number }> =>
    tree.map((node) => ({
      value: node.id,
      label: node.level ? `${node.name}（${node.level}）` : node.name,
      children: toOptions(node.children) as never[],
    }));
  return toOptions(buildOrgTree(nodes));
}
