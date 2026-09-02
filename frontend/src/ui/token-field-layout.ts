interface FitVisibleTokenCountOptions {
  availableWidth: number;
  tokenWidths: number[];
  overflowWidth: (hiddenCount: number) => number;
  gap: number;
  maxVisibleTokens: number;
}

export function fitVisibleTokenCount({
  availableWidth,
  tokenWidths,
  overflowWidth,
  gap,
  maxVisibleTokens,
}: FitVisibleTokenCountOptions): number {
  const cap = Math.min(maxVisibleTokens, tokenWidths.length);
  if (cap === 0) return 0;
  if (availableWidth <= 0) return cap;

  for (let count = cap; count >= 0; count -= 1) {
    const hiddenCount = tokenWidths.length - count;
    const tokensWidth = tokenWidths
      .slice(0, count)
      .reduce((total, width) => total + width, 0);
    const tokenGaps = Math.max(0, count - 1) * gap;
    const overflow =
      hiddenCount > 0
        ? (count > 0 ? gap : 0) + overflowWidth(hiddenCount)
        : 0;

    if (tokensWidth + tokenGaps + overflow <= availableWidth) {
      return count;
    }
  }

  return 0;
}
