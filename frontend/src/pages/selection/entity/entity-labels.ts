import {
  filterMachineGroups,
  type EntityGroup,
  type EntityKind,
  type MachineCatalogKind,
} from '@/domain';

/**
 * 目录两级的叫法：客户目录是「客户 → 厂区」，机型目录是「分类 → 机型」。
 * search 是目录搜索框能搜的内容（客户目录还能按厂区的区域搜）。
 */
export function entityLabels(kind: EntityKind) {
  return kind === 'customer'
    ? { group: '客户', item: '厂区', search: '客户、厂区或区域' }
    : { group: '分类', item: '机型', search: '分类或机型' };
}

/** 客户资料按「客户/厂区」存，两级名称里都不能有「/」 */
export function entityNameError(
  kind: EntityKind,
  label: string,
  name: string,
  attempted: boolean,
) {
  if (!attempted) return undefined;
  if (!name.trim()) return `请输入${label}名称`;
  if (kind === 'customer' && name.includes('/')) {
    return `${label}名称不能包含“/”`;
  }
  return undefined;
}

/** 当前目录里可见的分组：机型目录按「结构 / 专案机型」过滤 */
export function visibleEntityGroups(
  groups: EntityGroup[],
  kind: EntityKind,
  machineType: MachineCatalogKind | undefined,
) {
  return kind === 'machine' && machineType
    ? filterMachineGroups(groups, machineType)
    : groups;
}
