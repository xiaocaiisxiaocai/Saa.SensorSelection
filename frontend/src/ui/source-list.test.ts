import { describe, expect, it } from 'vitest';

import {
  clampSourceListWidth,
  filterSourceGroups,
  MACHINE_SOURCE_LIST_DEFAULT_WIDTH,
  MACHINE_SOURCE_LIST_MAX_WIDTH,
  MACHINE_SOURCE_LIST_MIN_WIDTH,
  moveIndex,
  sourceListWidthFromKey,
  SOURCE_LIST_MAX_WIDTH,
  SOURCE_LIST_MIN_WIDTH,
} from './source-list';

const groups = [
  { name: '华东', items: ['景旺', '深南'] },
  { name: '华南', items: ['胜宏'] },
];

describe('source-list helpers', () => {
  it('uses a compact width range for the machine hierarchy', () => {
    expect(MACHINE_SOURCE_LIST_MIN_WIDTH).toBe(220);
    expect(MACHINE_SOURCE_LIST_DEFAULT_WIDTH).toBe(240);
    expect(MACHINE_SOURCE_LIST_MAX_WIDTH).toBe(320);
  });

  it('clamps sidebar width to 160–320', () => {
    expect(clampSourceListWidth(100)).toBe(SOURCE_LIST_MIN_WIDTH);
    expect(clampSourceListWidth(800)).toBe(SOURCE_LIST_MAX_WIDTH);
    expect(clampSourceListWidth(240.4)).toBe(240);
    expect(clampSourceListWidth(800, 160, 400)).toBe(400);
    expect(clampSourceListWidth(200, 260, 400)).toBe(260);
  });

  it('moves width from keyboard steps', () => {
    expect(sourceListWidthFromKey({ key: 'ArrowRight', shiftKey: false }, 220)).toBe(
      236,
    );
    expect(sourceListWidthFromKey({ key: 'ArrowLeft', shiftKey: true }, 220)).toBe(
      180,
    );
    expect(sourceListWidthFromKey({ key: 'Home', shiftKey: false }, 400)).toBe(
      160,
    );
    expect(sourceListWidthFromKey({ key: 'End', shiftKey: false }, 220)).toBe(320);
    expect(
      sourceListWidthFromKey({ key: 'End', shiftKey: false }, 220, 160, 400),
    ).toBe(400);
  });

  it('filters groups and items by query', () => {
    expect(filterSourceGroups(groups, '胜').map((group) => group.name)).toEqual([
      '华南',
    ]);
    expect(filterSourceGroups(groups, '华').map((group) => group.name)).toEqual([
      '华东',
      '华南',
    ]);
  });

  it('reorders a list in place without mutating the source', () => {
    const names = ['a', 'b', 'c'];
    expect(moveIndex(names, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(names).toEqual(['a', 'b', 'c']);
  });
});
