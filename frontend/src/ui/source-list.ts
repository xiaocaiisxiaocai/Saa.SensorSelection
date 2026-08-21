export const SOURCE_LIST_MIN_WIDTH = 160;
export const SOURCE_LIST_MAX_WIDTH = 320;
export const SOURCE_LIST_DEFAULT_WIDTH = 220;
export const MACHINE_SOURCE_LIST_MIN_WIDTH = 260;
export const MACHINE_SOURCE_LIST_MAX_WIDTH = 400;
export const MACHINE_SOURCE_LIST_DEFAULT_WIDTH = 260;

export interface SourceGroup {
  name: string;
  items: string[];
  count?: number;
}

export function clampSourceListWidth(
  value: number,
  min = SOURCE_LIST_MIN_WIDTH,
  max = SOURCE_LIST_MAX_WIDTH,
): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sourceListWidthFromKey(
  event: { key: string; shiftKey: boolean },
  current: number,
  min = SOURCE_LIST_MIN_WIDTH,
  max = SOURCE_LIST_MAX_WIDTH,
): number | null {
  const step = event.shiftKey ? 40 : 16;
  if (event.key === 'ArrowLeft') {
    return clampSourceListWidth(current - step, min, max);
  }
  if (event.key === 'ArrowRight') {
    return clampSourceListWidth(current + step, min, max);
  }
  if (event.key === 'Home') {
    return min;
  }
  if (event.key === 'End') {
    return max;
  }
  return null;
}

export function filterSourceGroups(
  groups: SourceGroup[],
  query: string,
): SourceGroup[] {
  const value = query.trim().toLocaleLowerCase('zh-CN');
  if (!value) {
    return groups;
  }

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.toLocaleLowerCase('zh-CN').includes(value) ||
          group.name.toLocaleLowerCase('zh-CN').includes(value),
      ),
    }))
    .filter(
      (group) =>
        group.items.length > 0 ||
        group.name.toLocaleLowerCase('zh-CN').includes(value),
    );
}

export function moveIndex<T>(list: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  ) {
    return list;
  }

  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) {
    return list;
  }

  next.splice(to, 0, item);
  return next;
}

export function findGroupName(
  groups: SourceGroup[],
  item: string,
): string | undefined {
  return groups.find((group) => group.items.includes(item))?.name;
}
