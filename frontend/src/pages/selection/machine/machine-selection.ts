import {
  findEntityTreeItem,
  listEntityGroupItems,
  listEntityTreeItems,
  machineCatalogKind,
  type EntityGroup,
  type MachineCatalogKind,
  type MachineTab,
  type MachineNodeRef,
  type MachineTabPage,
} from '@/domain';

import { pagesOf } from './machine-nodes';

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
  /** 选中节点在这个 Tab 下的二级 Tab；还没有时为 null */
  page: MachineTabPage | null;
}

/**
 * 选中节点下的 Tab 与二级 Tab：按 ?tab=（找不到用第一个 Tab）
 * 和 ?page=（找不到用这个节点在该 Tab 下的第一个二级 Tab）。
 */
export function resolveTabSelection(
  tabs: readonly MachineTab[],
  node: MachineNodeRef | null,
  query: Query,
): MachineTabSelection {
  const tab =
    tabs.find((candidate) => String(candidate.id) === text(query.tab)) ??
    tabs[0] ??
    null;
  const pages = tab && node ? pagesOf(tab, node) : [];
  const page =
    pages.find((candidate) => String(candidate.id) === text(query.page)) ??
    pages[0] ??
    null;
  return { tab, page };
}

/** 二级 Tab 所在的 Tab */
export function tabOfPage(
  tabs: readonly MachineTab[],
  pageId: number,
): MachineTab | null {
  return tabs.find((tab) => tab.pages.some((page) => page.id === pageId)) ?? null;
}
