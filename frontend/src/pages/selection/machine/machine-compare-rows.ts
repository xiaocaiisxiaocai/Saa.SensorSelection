import type { MachineSectionRow } from '@/domain';

export interface MachineComparisonRowPair {
  key: string;
  left: MachineSectionRow | null;
  right: MachineSectionRow | null;
}

type RowIdentity = string | null;

function rowIdentity(row: MachineSectionRow, structure: boolean): RowIdentity {
  const role = row.role.trim();
  if (structure) return role || null;

  const name = row.name.trim();
  // Keep the two note fields distinct. A blank role or name can still be
  // paired when the other field identifies the note; an entirely blank pair
  // has no usable identity and must remain side-specific.
  if (!role && !name) return null;
  return `${role}\u0000${name}`;
}

function uniqueKey(base: string, usedKeys: Set<string>): string {
  if (!usedKeys.has(base)) {
    usedKeys.add(base);
    return base;
  }

  let occurrence = 2;
  let candidate = `${base}#${occurrence}`;
  while (usedKeys.has(candidate)) {
    occurrence += 1;
    candidate = `${base}#${occurrence}`;
  }
  usedKeys.add(candidate);
  return candidate;
}

function keyFor(
  left: MachineSectionRow | null,
  right: MachineSectionRow | null,
  usedKeys: Set<string>,
): string {
  const base =
    left && right
      ? `left:${left.id}|right:${right.id}`
      : left
        ? `left:${left.id}`
        : `right:${right!.id}`;
  return uniqueKey(base, usedKeys);
}

/**
 * Pair rows for the two sides of a machine comparison.
 *
 * Rows keep the left-side order, followed by unmatched right-side rows in
 * their original order. Matching consumes each right row at most once, so
 * duplicate identities pair by occurrence rather than being collapsed.
 */
export function pairMachineComparisonRows(
  left: readonly MachineSectionRow[],
  right: readonly MachineSectionRow[],
  structure: boolean,
): MachineComparisonRowPair[] {
  const rightBuckets = new Map<string, number[]>();
  right.forEach((row, index) => {
    const identity = rowIdentity(row, structure);
    if (identity === null) return;
    const bucket = rightBuckets.get(identity);
    if (bucket) bucket.push(index);
    else rightBuckets.set(identity, [index]);
  });

  const rightCursor = new Map<string, number>();
  const matchedRight = new Set<number>();
  const usedKeys = new Set<string>();
  const pairs: MachineComparisonRowPair[] = [];

  for (const leftRow of left) {
    const identity = rowIdentity(leftRow, structure);
    const bucket = identity === null ? undefined : rightBuckets.get(identity);
    const cursor = identity === null ? 0 : (rightCursor.get(identity) ?? 0);
    const rightIndex = bucket?.[cursor];

    if (rightIndex === undefined) {
      pairs.push({
        key: keyFor(leftRow, null, usedKeys),
        left: leftRow,
        right: null,
      });
      continue;
    }

    rightCursor.set(identity!, cursor + 1);
    matchedRight.add(rightIndex);
    pairs.push({
      key: keyFor(leftRow, right[rightIndex]!, usedKeys),
      left: leftRow,
      right: right[rightIndex]!,
    });
  }

  right.forEach((rightRow, index) => {
    if (matchedRight.has(index)) return;
    pairs.push({
      key: keyFor(null, rightRow, usedKeys),
      left: null,
      right: rightRow,
    });
  });

  return pairs;
}
