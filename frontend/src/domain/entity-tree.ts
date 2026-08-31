import type {
  EntityGroup,
  EntityTreeItem,
  MachineCatalogKind,
} from './types';

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
