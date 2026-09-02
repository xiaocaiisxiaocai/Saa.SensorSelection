import { describe, expect, it } from 'vitest';

import { fitVisibleTokenCount } from './token-field-layout';

describe('fitVisibleTokenCount', () => {
  const overflowWidth = () => 28;

  it('keeps one long token whole instead of squeezing in another token', () => {
    expect(
      fitVisibleTokenCount({
        availableWidth: 200,
        tokenWidths: [120, 100, 80],
        overflowWidth,
        gap: 8,
        maxVisibleTokens: 3,
      }),
    ).toBe(1);
  });

  it('shows another token only when both full labels and the overflow fit', () => {
    expect(
      fitVisibleTokenCount({
        availableWidth: 164,
        tokenWidths: [60, 60, 80],
        overflowWidth,
        gap: 8,
        maxVisibleTokens: 3,
      }),
    ).toBe(2);
  });

  it('shows all capped tokens when every label fits in full', () => {
    expect(
      fitVisibleTokenCount({
        availableWidth: 196,
        tokenWidths: [60, 60, 60],
        overflowWidth,
        gap: 8,
        maxVisibleTokens: 3,
      }),
    ).toBe(3);
  });

  it('keeps the overflow count visible when no full token can coexist with it', () => {
    expect(
      fitVisibleTokenCount({
        availableWidth: 96,
        tokenWidths: [72, 72, 72],
        overflowWidth,
        gap: 8,
        maxVisibleTokens: 3,
      }),
    ).toBe(0);
  });
});
