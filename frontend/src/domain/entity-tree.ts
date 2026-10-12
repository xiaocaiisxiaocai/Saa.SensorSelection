import type {
  EntityGroup,
  EntityKind,
  EntityTreeItem,
  MachineCatalogKind,
} from './types';

/**
 * 叶子节点的业务数据名（数据键 `listId:数据名` 里的那一段）。
 * 客户目录是「客户 → 区域」，区域名在客户之间会重复（多个客户都有华东），
 * 所以客户数据按「客户/区域」存；机型名全局唯一，仍按机型名存。
 */
export function entityDataName(
  kind: EntityKind,
  category: string,
  name: string,
): string {
  return kind === 'customer' ? `${category}/${name}` : name;
}

export const PROJECT_MACHINE_CATEGORY = '专案机型';

export function machineCatalogKind(group: EntityGroup): MachineCatalogKind {
  return (
    group.machineType ??
    (group.name === PROJECT_MACHINE_CATEGORY ? 'project' : 'mechanism')
  );
}

export function filterMachineGroups(
  groups: EntityGroup[],
  kind: MachineCatalogKind,
): EntityGroup[] {
  return groups.filter((group) => machineCatalogKind(group) === kind);
}

export function entityTreeItemKey(item: EntityTreeItem): string {
  return JSON.stringify([item.category, item.configuration ?? '', item.name]);
}

export function listEntityGroupItems(group: EntityGroup): string[] {
  return [
    ...group.items,
    ...(group.configurations ?? []).flatMap(
      (configuration) => configuration.items,
    ),
  ];
}

export function listEntityTreeItems(groups: EntityGroup[]): EntityTreeItem[] {
  return groups.flatMap((group) => [
    ...group.items.map((name) => ({
      category: group.name,
      configuration: null,
      name,
    })),
    ...(group.configurations ?? []).flatMap((configuration) =>
      configuration.items.map((name) => ({
        category: group.name,
        configuration: configuration.name,
        name,
      })),
    ),
  ]);
}

export function findEntityTreeItem(
  groups: EntityGroup[],
  name: string,
): EntityTreeItem | null {
  return listEntityTreeItems(groups).find((item) => item.name === name) ?? null;
}
