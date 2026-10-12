import {
  findEntityTreeItem,
  listEntityGroupItems,
  listEntityTreeItems,
  machineCatalogKind,
  type EntityGroup,
  type MachineCatalogKind,
  type MachineTab,
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

export interface MachineTabSelection {
  /** 当前显示的 Tab；当前目录还没有 Tab 时为 null */
  tab: MachineTab | null;
  /** Tab 下选中的机型；Tab 是空的时为空串 */
  machine: string;
  /** 选中的是还在目录树里（没放进 Tab）的机型 */
  treeMachine: string;
}

/**
 * 地址栏 ?tab=&item= 指向的 Tab 和机型：机型在某个 Tab 里就显示那个 Tab；
 * 机型还在目录树里就记为 treeMachine；否则按 ?tab= 或第一个 Tab，选它的第一个机型。
 */
export function resolveTabSelection(
  tabs: readonly MachineTab[],
  catalogMachines: ReadonlySet<string>,
  query: Query,
): MachineTabSelection {
  const item = text(query.item);
  const tabOfItem = item
    ? tabs.find((tab) => tab.machines.includes(item))
    : undefined;
  if (tabOfItem) return { tab: tabOfItem, machine: item, treeMachine: '' };
  if (item && catalogMachines.has(item)) {
    return { tab: null, machine: '', treeMachine: item };
  }
  const requested = text(query.tab);
  const tab =
    tabs.find((candidate) => String(candidate.id) === requested) ??
    tabs[0] ??
    null;
  return { tab, machine: tab?.machines[0] ?? '', treeMachine: '' };
}
