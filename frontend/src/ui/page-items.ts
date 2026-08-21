export type PageItem = number | 'ellipsis';

export function pageItems(page: number, pageCount: number): PageItem[] {
  if (pageCount < 1) {
    return [];
  }

  const current = Math.min(Math.max(page, 1), pageCount);
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  let start = Math.max(2, current - 1);
  let end = Math.min(pageCount - 1, current + 1);
  if (current <= 2) {
    end = Math.min(pageCount - 1, 3);
  }
  if (current >= pageCount - 1) {
    start = Math.max(2, pageCount - 2);
  }

  const items: PageItem[] = [1];
  if (start > 2) {
    items.push('ellipsis');
  }
  for (let number = start; number <= end; number += 1) {
    items.push(number);
  }
  if (end < pageCount - 1) {
    items.push('ellipsis');
  }
  items.push(pageCount);
  return items;
}
