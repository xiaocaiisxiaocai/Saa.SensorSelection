export type SensorStatusKind = 'current' | 'alternate' | 'disabled';

const STATUS_KIND_BY_LABEL: Record<string, SensorStatusKind> = {
  现用: 'current',
  备用: 'alternate',
  备选: 'alternate',
  停用: 'disabled',
};

function statusLabel(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/^\d+\s*(?:[-_.、:：]\s*)?/, '')
    .trim();
}

export function sensorStatusKind(value: unknown): SensorStatusKind | null {
  return STATUS_KIND_BY_LABEL[statusLabel(value)] ?? null;
}

export function isSensorStatus(
  value: unknown,
  expected: SensorStatusKind,
): boolean {
  return sensorStatusKind(value) === expected;
}

export function findSensorStatusName(
  names: readonly string[],
  expected: SensorStatusKind,
): string | undefined {
  return names.find((name) => isSensorStatus(name, expected));
}

export function sensorStatusRank(value: unknown): number {
  const kind = sensorStatusKind(value);
  if (kind === 'current') return 0;
  if (kind === 'alternate') return 1;
  if (kind === 'disabled') return 2;
  return 3;
}
