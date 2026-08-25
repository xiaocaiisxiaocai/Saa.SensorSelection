import {
  createSensorCatalogDefaults,
  normalizeCrudItems,
  normalizeMachineSectionRows,
  parsePersistedStore,
} from './normalize';
import {
  INITIAL_CRUD_DATA,
  LEGACY_DEMO_CRUD_DEFAULTS,
  MACHINE_SECTION_LEGACY_MAP,
  SENSOR_DATA,
} from './seed';
import type { PersistedStore } from './types';

const LEGACY_DEMO_CLEANUP_VERSION = 2;
const INITIAL_CRUD_DATA_VERSION = 3;
const ADDITIONAL_CRUD_DATA_VERSION = 4;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function sameRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function legacyRows(listId: string, entityName: string): unknown[] {
  const factory = LEGACY_DEMO_CRUD_DEFAULTS[listId];
  if (!factory) return [];
  const rows = factory(entityName).map((item) => ({ ...item }));

  if (listId.startsWith('machine-')) {
    const sensorItems = createSensorCatalogDefaults(SENSOR_DATA);
    const normalized = normalizeMachineSectionRows(rows, {
      allowImage: listId !== 'machine-notes',
      sensorItems,
    });
    const byId = new Map(sensorItems.map((sensor) => [sensor.id, sensor]));
    const derived = normalized.map((row) => {
      const selected = row.sensorIds
        .map((id) => byId.get(id))
        .filter((sensor) => Boolean(sensor));
      if (selected.length === 0) return row;
      return {
        ...row,
        sensorType: [
          ...new Set(selected.map((sensor) => sensor?.sensorType || '')),
        ]
          .filter(Boolean)
          .join('、'),
        spec: selected
          .map((sensor) => sensor?.spec || sensor?.model || '')
          .filter(Boolean)
          .join('、'),
      };
    });
    return [...rows, ...normalized, ...derived];
  }

  return normalizeCrudItems(listId, rows);
}

function withoutLegacyRows(rows: unknown[], demoRows: unknown[]): unknown[] {
  if (demoRows.length === 0) return rows;
  return rows.filter(
    (row) => !demoRows.some((demoRow) => sameRecord(row, demoRow)),
  );
}

export function migrateSelectionSeedStore(
  source: PersistedStore,
  currentVersion: number,
  targetVersion: number,
): { changed: boolean; store: PersistedStore } {
  const store = parsePersistedStore(JSON.stringify(source));
  let changed = false;
  if (
    currentVersion < LEGACY_DEMO_CLEANUP_VERSION &&
    targetVersion >= LEGACY_DEMO_CLEANUP_VERSION
  ) {
    for (const [key, rows] of Object.entries(store)) {
      let listId = Object.keys(LEGACY_DEMO_CRUD_DEFAULTS).find((candidate) =>
        key.startsWith(`${candidate}:`),
      );
      let entityName = listId ? key.slice(listId.length + 1) : '';

      const machineRowsMatch = /^machine-section-rows:(\d+):(.+)$/.exec(key);
      if (machineRowsMatch) {
        const sectionId = Number(machineRowsMatch[1]);
        listId = Object.entries(MACHINE_SECTION_LEGACY_MAP).find(
          ([, mappedSectionId]) => mappedSectionId === sectionId,
        )?.[0];
        entityName = machineRowsMatch[2] || '';
      }

      if (!listId || !entityName) continue;
      const nextRows = withoutLegacyRows(rows, legacyRows(listId, entityName));
      if (nextRows.length === rows.length) continue;
      store[key] = nextRows;
      changed = true;
    }
  }

  if (
    currentVersion < INITIAL_CRUD_DATA_VERSION &&
    targetVersion >= INITIAL_CRUD_DATA_VERSION
  ) {
    for (const [key, rows] of Object.entries(INITIAL_CRUD_DATA)) {
      const existing = store[key];
      if (Array.isArray(existing) && existing.length > 0) continue;
      store[key] = rows.map((item) => ({ ...item }));
      changed = true;
    }
  }

  if (
    currentVersion < ADDITIONAL_CRUD_DATA_VERSION &&
    targetVersion >= ADDITIONAL_CRUD_DATA_VERSION
  ) {
    for (const [key, rows] of Object.entries(INITIAL_CRUD_DATA)) {
      const existing = Array.isArray(store[key]) ? store[key] : [];
      const additions = rows.filter(
        (row) => !existing.some((current) => sameRecord(current, row)),
      );
      if (additions.length === 0) continue;
      store[key] = [
        ...existing,
        ...additions.map((item) => ({ ...item })),
      ];
      changed = true;
    }
  }

  return { changed, store };
}
