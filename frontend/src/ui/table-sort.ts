import type { TableSortState } from './types';

const collator = new Intl.Collator('zh', { numeric: true, sensitivity: 'base' });

/**
 * 表格排序的唯一实现，`ATable` 与页面共用。
 *
 * 分页表格必须由页面在切片之前调用它排完整数据集：`ATable` 只拿得到当前页
 * 的那一小段，自己排只会把这一页内部重排，翻页后顺序对不上。页面排完再传
 * 进来时 `ATable` 会用同一个比较器再排一次，结果不变。
 */
export function sortRows<T>(rows: readonly T[], sort: TableSortState | null): T[] {
  if (!sort) return [...rows];
  const direction = sort.direction === 'ascending' ? 1 : -1;
  return [...rows].sort((a, b) => compareByKey(a, b, sort.key) * direction);
}

function compareByKey<T>(a: T, b: T, key: string): number {
  const left = (a as Record<string, unknown>)[key];
  const right = (b as Record<string, unknown>)[key];
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return collator.compare(String(left ?? ''), String(right ?? ''));
}

/**
 * 点击表头后的三态循环：升序 → 降序 → 取消排序（回到数据原始顺序）。
 */
export function nextSortState(
  current: TableSortState | null,
  key: string,
): TableSortState | null {
  if (current?.key !== key) return { key, direction: 'ascending' };
  if (current.direction === 'ascending') return { key, direction: 'descending' };
  return null;
}
