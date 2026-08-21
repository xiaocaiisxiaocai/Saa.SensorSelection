import { describe, expect, it } from 'vitest';

import { pageItems } from './page-items';

describe('pageItems', () => {
  it('returns sequential pages when the count is small', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('windows pages around the current page', () => {
    expect(pageItems(1, 10)).toEqual([1, 2, 3, 'ellipsis', 10]);
    expect(pageItems(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);
    expect(pageItems(10, 10)).toEqual([1, 'ellipsis', 8, 9, 10]);
  });
});
