import {
  findEntityTreeItem,
  listEntityGroupItems,
  listEntityTreeItems,
  machineCatalogKind,
  type EntityGroup,
  type MachineCatalogKind,
} from '@/domain';

type Query = Record<string, unknown>;

const text = (value: unknown) => String(value || '');

/**
 * 地址栏里的目录：显式的 ?catalog= 优先；旧链接没有它时，按 category / item
 * 落在哪个分组里推断，都推断不出就是「结构」。
 */
export function machineCatalogFromQuery(
  groups: readonly EntityGroup[],
  query: Query,
): MachineCatalogKind {
  if (query.catalog === 'project') return 'project';
  if (query.catalog === 'mechanism') return 'mechanism';
  const category = text(query.category);
  const item = text(query.item);
  const legacyGroup = groups.find(
    (group) =>
      group.name === category || listEntityGroupItems(group).includes(item),
  );
  return legacyGroup ? machineCatalogKind(legacyGroup) : 'mechanism';
}

export interface MachineSelection {
  category: string;
  /** 机型配置；不在配置下时为空串 */
  configuration: string;
  item: string;
}

/**
 * 地址栏 ?category=&configuration=&item= 指向的机型；找不到（已删除、
 * 换了目录）时退回当前目录的第一个机型，目录为空时 item 为空串。
 */
export function resolveMachineSelection(
  catalogGroups: EntityGroup[],
  query: Query,
): MachineSelection {
  const requested = text(query.item);
  const requestedCategory = text(query.category);
  const requestedConfiguration = text(query.configuration);
  const found = listEntityTreeItems(catalogGroups).find(
    (item) =>
      item.name === requested &&
      (!requestedCategory || item.category === requestedCategory) &&
      (!requestedConfiguration ||
        (item.configuration ?? '') === requestedConfiguration),
  );
  if (found) {
    return {
      category: found.category,
      configuration: found.configuration ?? '',
      item: found.name,
    };
  }
  const first = findEntityTreeItem(
    catalogGroups,
    catalogGroups.flatMap((group) => listEntityGroupItems(group))[0] ?? '',
  );
  return {
    category: first?.category || catalogGroups[0]?.name || '',
    configuration: first?.configuration || '',
    item: first?.name || '',
  };
}
