import {
  createSensorCatalogDefaults,
  normalizeCrudItems,
  normalizeDictionaryItems,
  normalizeEntityGroups,
  normalizeMachineSectionRows,
  parsePersistedStore,
} from './normalize';
import {
  FEEDBACK_STATUS_OPTIONS,
  INITIAL_CRUD_DATA,
  LEGACY_DEMO_CRUD_DEFAULTS,
  MACHINE_SECTION_LEGACY_MAP,
  MACHINE_GROUPS,
  SENSOR_DATA,
} from './seed';
import type { PersistedStore } from './types';

const LEGACY_DEMO_CLEANUP_VERSION = 2;
const INITIAL_CRUD_DATA_VERSION = 3;
const ADDITIONAL_CRUD_DATA_VERSION = 4;
const FEEDBACK_STATUS_DICTIONARY_VERSION = 5;
const SENSOR_3D_CATALOG_VERSION = 6;
const MACHINE_HIERARCHY_VERSION = 7;
const USER_DEFINED_MACHINE_TABS_VERSION = 8;
const MACHINE_CATALOG_SPLIT_VERSION = 9;
const NUMBERED_FEEDBACK_STATUS_VERSION = 10;
const LEGACY_FEEDBACK_STATUS_OPTIONS = [
  '待处理',
  '处理中',
  '测试中',
  '已解决',
];

function mergeMachineHierarchy(source: unknown) {
  const current = normalizeEntityGroups(source, 'machine');
  const result = current.map((group) => ({
    ...group,
    items: [...group.items],
    ...(group.configurations
      ? {
          configurations: group.configurations.map((configuration) => ({
            name: configuration.name,
            items: [...configuration.items],
          })),
        }
      : {}),
  }));

  for (const seedGroup of MACHINE_GROUPS) {
    const target = result.find((group) => group.name === seedGroup.name);
    if (!target) {
      result.push({
        name: seedGroup.name,
        items: [...seedGroup.items],
        ...(seedGroup.configurations
          ? {
              configurations: seedGroup.configurations.map((configuration) => ({
                name: configuration.name,
                items: [...configuration.items],
              })),
            }
          : {}),
      });
      continue;
    }

    for (const item of seedGroup.items) {
      if (!target.items.includes(item)) target.items.push(item);
    }
    if (!seedGroup.configurations) continue;
    target.configurations ??= [];
    for (const seedConfiguration of seedGroup.configurations) {
      const configuration = target.configurations.find(
        (item) => item.name === seedConfiguration.name,
      );
      if (!configuration) {
        target.configurations.push({
          name: seedConfiguration.name,
          items: [...seedConfiguration.items],
        });
        continue;
      }
      for (const item of seedConfiguration.items) {
        if (!configuration.items.includes(item)) configuration.items.push(item);
      }
    }
  }
  return result;
}

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
  return (
    JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
  );
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
    const withoutProcessBinding = [...rows, ...normalized, ...derived].map(
      (row) => {
        if (!row || typeof row !== 'object') return row;
        const { processStepId, ...legacyRow } = row as Record<string, unknown>;
        return processStepId === null ? legacyRow : row;
      },
    );
    return [...rows, ...normalized, ...derived, ...withoutProcessBinding];
  }

  return normalizeCrudItems(listId, rows);
}

function withoutLegacyRows(rows: unknown[], demoRows: unknown[]): unknown[] {
  if (demoRows.length === 0) return rows;
  return rows.filter(
    (row) => !demoRows.some((demoRow) => sameRecord(row, demoRow)),
  );
}

function migrateFeedbackStatusDictionary(source: unknown[]) {
  const normalized = normalizeDictionaryItems(source);
  const canonicalNames = new Set(LEGACY_FEEDBACK_STATUS_OPTIONS);
  let nextId = Math.max(0, ...normalized.map((item) => item.id)) + 1;

  const canonical = LEGACY_FEEDBACK_STATUS_OPTIONS.map((name, index) => {
    const existing = normalized.find((item) => item.name === name);
    return {
      id: existing?.id ?? nextId++,
      name,
      sort: index + 1,
    };
  });
  const custom = normalized
    .filter((item) => !canonicalNames.has(item.name))
    .map((item, index) => ({
      ...item,
      sort: LEGACY_FEEDBACK_STATUS_OPTIONS.length + index + 1,
    }));

  return [...canonical, ...custom];
}

function feedbackStatusBase(value: unknown): string {
  const raw = String(value ?? '').trim();
  const aliases: Record<string, string> = {
    pending: '待处理',
    processing: '处理中',
    testing: '测试中',
    resolved: '已解决',
  };
  return aliases[raw.toLocaleLowerCase('en-US')] ||
    raw.replace(/^\d+\s*[.、_\-:：]?\s*/, '').trim();
}

function migrateNumberedFeedbackStatuses(store: PersistedStore): boolean {
  const dictionaryKey = 'dict:customer-feedback-status';
  const current = Array.isArray(store[dictionaryKey])
    ? store[dictionaryKey]
    : [];
  const normalized = normalizeDictionaryItems(current);
  const canonicalByBase = new Map(
    FEEDBACK_STATUS_OPTIONS.map((name) => [feedbackStatusBase(name), name]),
  );
  let nextId = Math.max(0, ...normalized.map((item) => item.id)) + 1;
  const canonical = FEEDBACK_STATUS_OPTIONS.map((name, index) => {
    const base = feedbackStatusBase(name);
    const matches = normalized.filter(
      (item) => feedbackStatusBase(item.name) === base,
    );
    const existing =
      matches.find((item) => item.name === name) ||
      matches.find((item) => /^\s*\d+/.test(item.name)) ||
      matches[0];
    return {
      id: existing?.id ?? nextId++,
      name,
      sort: index + 1,
    };
  });
  const custom = normalized
    .filter((item) => !canonicalByBase.has(feedbackStatusBase(item.name)))
    .map((item, index) => ({
      ...item,
      sort: FEEDBACK_STATUS_OPTIONS.length + index + 1,
    }));
  const nextDictionary = [...canonical, ...custom];
  let changed = false;

  if (!sameRecord(current, nextDictionary)) {
    store[dictionaryKey] = nextDictionary;
    changed = true;
  }

  for (const [key, rows] of Object.entries(store)) {
    if (!key.startsWith('customer-feedback:')) continue;
    let rowsChanged = false;
    const nextRows = rows.map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
      const record = row as Record<string, unknown>;
      const canonicalName = canonicalByBase.get(feedbackStatusBase(record.status));
      if (!canonicalName || record.status === canonicalName) return row;
      rowsChanged = true;
      return { ...record, status: canonicalName };
    });
    if (!rowsChanged) continue;
    store[key] = nextRows;
    changed = true;
  }

  return changed;
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
      store[key] = [...existing, ...additions.map((item) => ({ ...item }))];
      changed = true;
    }
  }

  if (
    currentVersion < FEEDBACK_STATUS_DICTIONARY_VERSION &&
    targetVersion >= FEEDBACK_STATUS_DICTIONARY_VERSION
  ) {
    const key = 'dict:customer-feedback-status';
    const current = Array.isArray(store[key]) ? store[key] : [];
    const next = migrateFeedbackStatusDictionary(current);
    if (!sameRecord(current, next)) {
      store[key] = next;
      changed = true;
    }
  }

  if (
    currentVersion < SENSOR_3D_CATALOG_VERSION &&
    targetVersion >= SENSOR_3D_CATALOG_VERSION &&
    !Array.isArray(store['sensor-3d:all'])
  ) {
    store['sensor-3d:all'] = [];
    changed = true;
  }

  if (
    currentVersion < MACHINE_HIERARCHY_VERSION &&
    targetVersion >= MACHINE_HIERARCHY_VERSION
  ) {
    const current = store['entity-groups:machine'];
    const next = mergeMachineHierarchy(current);
    if (!sameRecord(current, next)) {
      store['entity-groups:machine'] = next;
      changed = true;
    }
  }

  if (
    currentVersion < USER_DEFINED_MACHINE_TABS_VERSION &&
    targetVersion >= USER_DEFINED_MACHINE_TABS_VERSION
  ) {
    for (const key of [
      'dict:machine-section',
      'machine-global-sections:all',
      'general-structure-labels:all',
    ]) {
      if (!Object.hasOwn(store, key)) continue;
      delete store[key];
      changed = true;
    }
  }

  if (
    currentVersion < MACHINE_CATALOG_SPLIT_VERSION &&
    targetVersion >= MACHINE_CATALOG_SPLIT_VERSION
  ) {
    const current = store['entity-groups:machine'];
    const next = normalizeEntityGroups(current, 'machine');
    if (!sameRecord(current, next)) {
      store['entity-groups:machine'] = next;
      changed = true;
    }
  }

  if (
    currentVersion < NUMBERED_FEEDBACK_STATUS_VERSION &&
    targetVersion >= NUMBERED_FEEDBACK_STATUS_VERSION &&
    migrateNumberedFeedbackStatuses(store)
  ) {
    changed = true;
  }

  return { changed, store };
}
