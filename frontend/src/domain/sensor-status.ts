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

export const SENSOR_NEEDS_CURRENT = '请先新增该类型的现用型号';
export const SENSOR_DISABLED_MANUAL = '停用只能通过「替换」产生';
export const SENSOR_HAS_ALTERNATES =
  '该现用型号下还有备选，请先用「替换」处理';

type SensorStatusRef = {
  id: number;
  status: string;
  sensorType: string;
};

export function sensorTypeHasCurrent(
  items: readonly SensorStatusRef[],
  sensorType: string,
  exceptId?: number,
): boolean {
  return items.some(
    (item) =>
      item.id !== exceptId &&
      item.sensorType === sensorType &&
      isSensorStatus(item.status, 'current'),
  );
}

export function sensorTypeHasAlternate(
  items: readonly SensorStatusRef[],
  sensorType: string,
  exceptId?: number,
): boolean {
  return items.some(
    (item) =>
      item.id !== exceptId &&
      item.sensorType === sensorType &&
      isSensorStatus(item.status, 'alternate'),
  );
}

/** 这条现用是该类型剩下的唯一现用，且同类型还有备选。 */
export function sensorCurrentGuardsAlternates(
  items: readonly SensorStatusRef[],
  item: SensorStatusRef,
): boolean {
  return (
    isSensorStatus(item.status, 'current') &&
    sensorTypeHasAlternate(items, item.sensorType, item.id) &&
    !sensorTypeHasCurrent(items, item.sensorType, item.id)
  );
}
