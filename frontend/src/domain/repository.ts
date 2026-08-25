import {
  STORAGE_KEY,
  keyFor,
  machineSectionImagesKey,
  machineSectionRowsKey,
} from './keys';
import {
  detectControlledFileKind,
  formatLocalDate,
  nextAvailableId,
  normalizeControlledDocuments,
  normalizeCrudItems,
  normalizeDictionaryItems,
  normalizeEntityGroups,
  normalizeMachineSectionImages,
  normalizeMachineSectionRows,
  normalizeMachineSections,
  normalizeMachineRowImage,
  normalizeProcessSteps,
  normalizeSensorItems,
  normalizeSensorSops,
  parsePersistedStore,
  storedText,
  validateControlledUpload,
  validateMachineRowImage,
  createDefaultControlledDocuments,
  createSensorCatalogDefaults,
} from './normalize';
import { migrateSelectionSeedStore } from './seed-migration';
import {
  DICTIONARY_DEFINITIONS,
  ENTITY_KIND_DEFINITIONS,
  GENERAL_STRUCTURE_CATEGORY,
  GENERAL_STRUCTURE_SECTION_LABELS,
  MACHINE_SECTION_LEGACY_MAP,
  MACHINE_SECTION_SEED,
  SEED_VERSION,
  createDictionaryDefaults,
  createEntityGroupDefaults,
  createProcessStepDefaults,
} from './seed';
import type {
  ControlledFileAttachment,
  ControlledFileItem,
  CrudDefaults,
  CrudRecord,
  DeleteResult,
  DictionaryDefinition,
  DictionaryItem,
  EntityGroup,
  EntityKind,
  EntityTreeItem,
  FeedbackMeasureHistoryEntry,
  MachineRowImage,
  MachineSectionItem,
  MachineSectionRow,
  PersistedStore,
  ProcessStepItem,
  ReorderResult,
  SaveResult,
  SensorItem,
  SensorSopItem,
  SensorTypeDefinition,
  StorageLike,
} from './types';

function cloneStore(store: PersistedStore): PersistedStore {
  return parsePersistedStore(JSON.stringify(store));
}

function omitStoreKeys(store: PersistedStore, keys: string[]): PersistedStore {
  const removeSet = new Set(keys);
  const next = parsePersistedStore(null);
  for (const [key, value] of Object.entries(store)) {
    if (removeSet.has(key)) continue;
    next[key] = value;
  }
  return next;
}

function sameLocaleName(left: unknown, right: unknown): boolean {
  return (
    storedText(left).trim().toLocaleLowerCase('zh-CN') ===
    storedText(right).trim().toLocaleLowerCase('zh-CN')
  );
}

function entityKindDefinition(kind: string) {
  return ENTITY_KIND_DEFINITIONS.find((item) => item.kind === kind) || null;
}

export function createSelectionRepository({
  storage,
  sensorData,
}: {
  crudDefaults: CrudDefaults;
  sensorData: Record<string, SensorTypeDefinition>;
  storage?: StorageLike;
}) {
  let store: PersistedStore;
  try {
    store = parsePersistedStore(storage?.getItem?.(STORAGE_KEY));
  } catch {
    store = parsePersistedStore(null);
  }
  const currentSeedVersion =
    Number(
      (store['meta:seed-version']?.[0] as { version?: unknown } | undefined)
        ?.version,
    ) || 0;
  store = migrateSelectionSeedStore(
    store,
    currentSeedVersion,
    SEED_VERSION,
  ).store;

  function persist(snapshot: PersistedStore): boolean {
    try {
      const result = storage?.setItem?.(
        STORAGE_KEY,
        JSON.stringify(store),
      );
      if (result === false) {
        store = snapshot;
        return false;
      }
      return true;
    } catch {
      store = snapshot;
      return false;
    }
  }

  function getCrud(listId: string, entityName: string): CrudRecord[] {
    const key = keyFor(listId, entityName);
    if (!Array.isArray(store[key])) {
      store[key] = [];
    }
    store[key] = normalizeCrudItems(listId, store[key]);
    return store[key] as CrudRecord[];
  }

  function dictionaryCodeForList(listId: string): string | null {
    return (
      DICTIONARY_DEFINITIONS.find(
        (item) =>
          item.listIds.includes(listId) && (item.field || 'type') === 'type',
      )?.code || null
    );
  }

  function saveCrud(
    listId: string,
    entityName: string,
    payload: Partial<CrudRecord> & Record<string, unknown>,
    editId?: number,
  ): SaveResult<CrudRecord> {
    const items = getCrud(listId, entityName);
    const snapshot = cloneStore(store);
    const isTimeline = listId === 'customer-feedback';
    const isCustomerReq = listId === 'customer-req';
    const isCustomerProc = listId === 'customer-proc';

    if (isCustomerProc) {
      if (
        !storedText(payload.role).trim() ||
        !storedText(payload.feature).trim()
      ) {
        return { ok: false, reason: 'validation' };
      }
    } else {
      let requiredValue: unknown;
      if (isTimeline) {
        requiredValue = payload.problem;
      } else if (isCustomerReq) {
        requiredValue = payload.content;
      } else {
        requiredValue = payload.name;
      }
      if (!storedText(requiredValue).trim()) {
        return { ok: false, reason: 'validation' };
      }
    }

    const dictionaryCode = dictionaryCodeForList(listId);
    if (dictionaryCode) {
      const typeName = storedText(payload.type).trim();
      const allowed = getDictionaryItems(dictionaryCode).some(
        (item) => item.name === typeName,
      );
      if (!typeName || !allowed) return { ok: false, reason: 'validation' };
    }

    if (listId === 'customer-feedback') {
      const statusName = storedText(payload.status).trim();
      const allowedStatus = getDictionaryItems('customer-feedback-status').some(
        (item) => item.name === statusName,
      );
      if (!statusName || !allowedStatus) {
        return { ok: false, reason: 'validation' };
      }
    }

    if (listId === 'customer-req') {
      const sourceName = storedText(payload.source).trim();
      const allowedSource = getDictionaryItems('customer-req-source').some(
        (item) => item.name === sourceName,
      );
      if (!sourceName || !allowedSource) {
        return { ok: false, reason: 'validation' };
      }
    }

    let normalizedPayload = payload;
    if (isTimeline) {
      const previous = editId
        ? items.find((item) => item.id === editId)
        : undefined;
      const nextMeasure = storedText(payload.measure);
      const nextDate = storedText(payload.date);
      let measureHistory: FeedbackMeasureHistoryEntry[] = [];

      if (previous && 'measureHistory' in previous) {
        measureHistory = previous.measureHistory.map((entry) => ({ ...entry }));
      }

      const previousMeasure =
        previous && 'measure' in previous ? previous.measure : '';
      const previousDate = previous && 'date' in previous ? previous.date : '';
      const changed =
        !previous || previousMeasure !== nextMeasure || previousDate !== nextDate;

      if (changed) {
        measureHistory = measureHistory.map((entry) => ({
          ...entry,
          status: '已作废',
        }));
        if (nextMeasure.trim() || nextDate.trim()) {
          measureHistory.push({
            measure: nextMeasure,
            date: nextDate,
            status: '现行',
          });
        }
      }

      normalizedPayload = { ...payload, measureHistory };
    }

    const normalized = normalizeCrudItems(listId, [
      { ...normalizedPayload, id: editId || nextAvailableId(items) },
    ])[0];
    if (!normalized) return { ok: false, reason: 'validation' };
    if (editId) {
      const index = items.findIndex((item) => item.id === editId);
      if (index === -1) return { ok: false, reason: 'stale' };
      items.splice(index, 1, normalized);
    } else {
      items.push(normalized);
    }
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: normalized };
  }

  function deleteCrud(
    listId: string,
    entityName: string,
    id: number,
  ): DeleteResult {
    const items = getCrud(listId, entityName);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    const snapshot = cloneStore(store);
    items.splice(index, 1);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getSensors(): SensorItem[] {
    const key = keyFor('sensor-catalog', 'all');
    if (!Array.isArray(store[key])) {
      store[key] = createSensorCatalogDefaults(sensorData);
    }
    const typeNames = getDictionaryItems('sensor-type').map((item) => item.name);
    const statusNames = getDictionaryItems('sensor-status').map(
      (item) => item.name,
    );
    store[key] = normalizeSensorItems(store[key], typeNames, statusNames);
    return store[key] as SensorItem[];
  }

  function listResolvedMachineSections(
    machineName: string,
  ): MachineSectionItem[] {
    const global = getGlobalMachineSections().map((item) => ({
      ...item,
      scope: 'global' as const,
    }));
    const extra = getExtraMachineSections(machineName).map((item) => ({
      ...item,
      kind: 'structure' as const,
      scope: 'machine' as const,
    }));
    return [...global, ...extra];
  }

  function forEachPersistedMachineStructureRows(
    callback: (rows: MachineSectionRow[]) => boolean,
  ) {
    const prefix = 'machine-section-rows:';
    for (const key of Object.keys(store)) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const separator = rest.indexOf(':');
      if (separator <= 0) continue;

      const sectionId = Number(rest.slice(0, separator));
      const machineName = rest.slice(separator + 1);
      if (!Number.isSafeInteger(sectionId) || !machineName) continue;
      if (!sectionAllowsImage(sectionId)) continue;

      const rows = getMachineSectionRows(sectionId, machineName);
      if (callback(rows)) {
        store[key] = normalizeMachineSectionRows(rows, {
          allowImage: true,
          sensorItems: getSensors(),
        });
      }
    }
  }

  function syncMachineSensorSnapshots() {
    const sensors = getSensors();
    const byId = new Map(sensors.map((sensor) => [sensor.id, sensor]));
    forEachPersistedMachineStructureRows((rows) => {
      let changed = false;
      for (const row of rows) {
        const records = (row.sensorIds || [])
          .map((id) => byId.get(id))
          .filter((sensor): sensor is SensorItem => Boolean(sensor));
        if (records.length === 0) continue;
        row.sensorType = [
          ...new Set(records.map((sensor) => sensor.sensorType)),
        ].join('、');
        row.spec = records
          .map((sensor) => sensor.spec || sensor.model)
          .filter(Boolean)
          .join('、');
        changed = true;
      }
      return changed;
    });
  }

  function saveSensor(
    payload: Partial<SensorItem> & Record<string, unknown>,
    editId?: number,
  ): SaveResult<SensorItem> {
    const items = getSensors();
    const model = storedText(payload.model).trim();
    const typeNames = getDictionaryItems('sensor-type').map((item) => item.name);
    const statusNames = getDictionaryItems('sensor-status').map(
      (item) => item.name,
    );
    const sensorType = storedText(payload.sensorType).trim();
    const status = storedText(payload.status).trim();
    if (
      !model ||
      !typeNames.includes(sensorType) ||
      !statusNames.includes(status)
    ) {
      return { ok: false, reason: 'validation' };
    }
    const duplicate = items.some(
      (item) =>
        item.id !== editId &&
        item.model.trim().toLocaleLowerCase('zh-CN') ===
          model.toLocaleLowerCase('zh-CN'),
    );
    if (duplicate) return { ok: false, reason: 'duplicate' };

    const snapshot = cloneStore(store);
    let sopId: null | number = null;
    if (
      Object.hasOwn(payload, 'sopId') &&
      payload.sopId !== null &&
      payload.sopId !== undefined
    ) {
      const requested = Number(payload.sopId);
      if (
        Number.isSafeInteger(requested) &&
        requested > 0 &&
        getSensorSops().some((item) => item.id === requested)
      ) {
        sopId = requested;
      }
    }
    const normalized = normalizeSensorItems(
      [
        {
          ...payload,
          id: editId || nextAvailableId(items),
          model,
          partNumber: Object.hasOwn(payload, 'partNumber')
            ? payload.partNumber
            : undefined,
          sensorType,
          status,
          sopId,
        },
      ],
      typeNames,
      statusNames,
    )[0];
    if (!normalized) return { ok: false, reason: 'validation' };
    if (editId) {
      const index = items.findIndex((item) => item.id === editId);
      if (index === -1) return { ok: false, reason: 'stale' };
      const previous = items[index];
      if (!previous) return { ok: false, reason: 'stale' };
      if (!Object.hasOwn(payload, 'sopId')) {
        normalized.sopId = previous.sopId ?? null;
      }
      if (!Object.hasOwn(payload, 'partNumber')) {
        normalized.partNumber = previous.partNumber || '';
      }
      if (!Object.hasOwn(payload, 'replacesId')) {
        normalized.replacesId = previous.replacesId ?? null;
      }
      if (!Object.hasOwn(payload, 'replacedById')) {
        normalized.replacedById = previous.replacedById ?? null;
      }
      if (!Object.hasOwn(payload, 'problemNote')) {
        normalized.problemNote = previous.problemNote || '';
      }
      if (!Object.hasOwn(payload, 'replacedAt')) {
        normalized.replacedAt = previous.replacedAt || '';
      }
      items.splice(index, 1, normalized);
    } else {
      items.push(normalized);
    }
    syncMachineSensorSnapshots();
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: normalized };
  }

  function replaceSensorCurrent(
    alternateId: number,
    currentId: number,
    problemNote: string,
  ): SaveResult<SensorItem> {
    const note = storedText(problemNote).trim();
    if (!note) return { ok: false, reason: 'validation' };

    const altId = Number(alternateId);
    const curId = Number(currentId);
    if (
      !Number.isSafeInteger(altId) ||
      altId <= 0 ||
      !Number.isSafeInteger(curId) ||
      curId <= 0 ||
      altId === curId
    ) {
      return { ok: false, reason: 'validation' };
    }

    const items = getSensors();
    const typeNames = getDictionaryItems('sensor-type').map((item) => item.name);
    const statusNames = getDictionaryItems('sensor-status').map(
      (item) => item.name,
    );
    if (
      !statusNames.includes('现用') ||
      !statusNames.includes('备选') ||
      !statusNames.includes('停用')
    ) {
      return { ok: false, reason: 'validation' };
    }

    const altIndex = items.findIndex((item) => item.id === altId);
    const curIndex = items.findIndex((item) => item.id === curId);
    if (altIndex === -1 || curIndex === -1) {
      return { ok: false, reason: 'stale' };
    }

    const alternate = items[altIndex];
    const current = items[curIndex];
    if (!alternate || !current) return { ok: false, reason: 'stale' };
    if (alternate.status !== '备选' || current.status !== '现用') {
      return { ok: false, reason: 'validation' };
    }

    const snapshot = cloneStore(store);
    const replacedAt = formatLocalDate(new Date());
    const nextAlt = normalizeSensorItems(
      [
        {
          ...alternate,
          status: '现用',
          replacesId: curId,
          problemNote: note,
          replacedAt,
        },
      ],
      typeNames,
      statusNames,
    )[0];
    if (!nextAlt) return { ok: false, reason: 'validation' };
    items[altIndex] = nextAlt;
    const curIndexAfter = items.findIndex((item) => item.id === curId);
    const nextCur = normalizeSensorItems(
      [
        {
          ...current,
          status: '停用',
          replacedById: altId,
          problemNote: note,
          replacedAt,
        },
      ],
      typeNames,
      statusNames,
    )[0];
    if (!nextCur) return { ok: false, reason: 'validation' };
    items[curIndexAfter] = nextCur;

    forEachPersistedMachineStructureRows((rows) => {
      let changed = false;
      for (const row of rows) {
        if (!row.sensorIds?.includes(curId)) continue;
        row.sensorIds = [
          ...new Set(row.sensorIds.map((id) => (id === curId ? altId : id))),
        ];
        changed = true;
      }
      return changed;
    });
    syncMachineSensorSnapshots();

    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: items[altIndex] as SensorItem };
  }

  function deleteSensor(id: number): DeleteResult {
    const items = getSensors();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    const snapshot = cloneStore(store);
    items.splice(index, 1);
    // 级联清理：从所有机型结构行的 sensorIds 中移除被删除的 Sensor 引用
    for (const key of Object.keys(store)) {
      if (key.startsWith('machine-section-rows:')) {
        const rows = store[key];
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (Array.isArray((row as MachineSectionRow).sensorIds)) {
              (row as MachineSectionRow).sensorIds = (
                row as MachineSectionRow
              ).sensorIds.filter((sid) => sid !== id);
            }
          }
        }
      }
    }
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getSensorSops(): SensorSopItem[] {
    const key = keyFor('sensor-sop', 'all');
    if (!Array.isArray(store[key])) {
      store[key] = [];
    }
    store[key] = normalizeSensorSops(store[key]);
    return store[key] as SensorSopItem[];
  }

  function saveSensorSop(
    payload: Partial<SensorSopItem>,
    editId?: number,
  ): SaveResult<SensorSopItem> {
    const items = getSensorSops();
    const title = storedText(payload.title).trim().slice(0, 80);
    const fileName = storedText(payload.fileName).trim().slice(0, 200);
    const mimeType = storedText(payload.mimeType).trim().slice(0, 120);
    const dataUrl = storedText(payload.dataUrl);
    const size = Number(payload.size);
    const uploadedAt =
      storedText(payload.uploadedAt).trim() || formatLocalDate(new Date());

    if (!title || !fileName || !dataUrl.startsWith('data:')) {
      return { ok: false, reason: 'validation' };
    }
    const kind = detectControlledFileKind(fileName, mimeType);
    if (kind !== 'pdf') return { ok: false, reason: 'type' };
    const check = validateControlledUpload('pdf', fileName, mimeType, size);
    if (!check.ok) return { ok: false, reason: check.reason };

    const snapshot = cloneStore(store);
    const item = normalizeSensorSops([
      {
        id: editId || nextAvailableId(items),
        title,
        fileName,
        mimeType: mimeType || 'application/pdf',
        dataUrl,
        size,
        uploadedAt,
      },
    ])[0];
    if (!item) return { ok: false, reason: 'validation' };

    if (editId) {
      const index = items.findIndex((row) => row.id === editId);
      if (index === -1) return { ok: false, reason: 'stale' };
      items.splice(index, 1, item);
    } else {
      items.push(item);
    }
    store[keyFor('sensor-sop', 'all')] = normalizeSensorSops(items);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item };
  }

  function deleteSensorSop(id: number): DeleteResult {
    const items = getSensorSops();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };

    const linked = getSensors().some((item) => item.sopId === id);
    if (linked) return { ok: false, reason: 'in-use' };

    const snapshot = cloneStore(store);
    items.splice(index, 1);
    store[keyFor('sensor-sop', 'all')] = normalizeSensorSops(items);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getProcessSteps(): ProcessStepItem[] {
    const key = keyFor('process-steps', 'all');
    if (!Array.isArray(store[key])) {
      store[key] = createProcessStepDefaults();
    }
    store[key] = normalizeProcessSteps(store[key]);
    if (store[key].length === 0) {
      store[key] = createProcessStepDefaults();
    }
    return store[key] as ProcessStepItem[];
  }

  function saveProcessStep(
    payload: Partial<ProcessStepItem>,
    editId?: number,
  ): SaveResult<ProcessStepItem> {
    const items = getProcessSteps();
    const name = storedText(payload.name).trim().slice(0, 40);
    const layer = storedText(payload.layer).trim();
    const layerNames = getDictionaryItems('process-layer').map(
      (item) => item.name,
    );
    if (!name || !layerNames.includes(layer)) {
      return { ok: false, reason: 'validation' };
    }
    const duplicate = items.some(
      (item) =>
        item.id !== editId &&
        item.name.toLocaleLowerCase('zh-CN') ===
          name.toLocaleLowerCase('zh-CN'),
    );
    if (duplicate) return { ok: false, reason: 'duplicate' };

    const snapshot = cloneStore(store);
    const normalized = normalizeProcessSteps([
      {
        id: editId || nextAvailableId(items),
        layer,
        name,
        role: storedText(payload.role),
        feature: storedText(payload.feature),
        note: storedText(payload.note),
      },
    ])[0];
    if (!normalized) return { ok: false, reason: 'validation' };
    if (editId) {
      const index = items.findIndex((item) => item.id === editId);
      if (index === -1) return { ok: false, reason: 'stale' };
      items.splice(index, 1, normalized);
    } else {
      items.push(normalized);
    }
    store[keyFor('process-steps', 'all')] = normalizeProcessSteps(items);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: normalized };
  }

  function deleteProcessStep(id: number): DeleteResult {
    const items = getProcessSteps();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    const snapshot = cloneStore(store);
    items.splice(index, 1);
    store[keyFor('process-steps', 'all')] = normalizeProcessSteps(items);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function generalStructureLabelsKey() {
    return keyFor('general-structure-labels', 'all');
  }

  function getGeneralStructureLabelMap(): Record<number, string> {
    const key = generalStructureLabelsKey();
    const map: Record<number, string> = { ...GENERAL_STRUCTURE_SECTION_LABELS };
    if (!Array.isArray(store[key])) {
      store[key] = Object.entries(GENERAL_STRUCTURE_SECTION_LABELS).map(
        ([id, name]) => ({ id: Number(id), name }),
      );
    }
    for (const row of store[key]) {
      if (!row || typeof row !== 'object') continue;
      const record = row as { id?: unknown; name?: unknown };
      const id = Number(record.id);
      const name = storedText(record.name).trim();
      if (!Number.isSafeInteger(id) || id <= 0 || !name) continue;
      map[id] = name;
    }
    return map;
  }

  function persistGeneralStructureLabel(
    sectionId: number,
    name: string,
  ): DeleteResult {
    const key = generalStructureLabelsKey();
    const list = Array.isArray(store[key]) ? [...store[key]] : [];
    const index = list.findIndex(
      (row) =>
        row &&
        typeof row === 'object' &&
        Number((row as { id?: unknown }).id) === sectionId,
    );
    const row = { id: sectionId, name };
    if (index === -1) list.push(row);
    else list.splice(index, 1, row);
    const snapshot = cloneStore(store);
    store[key] = list;
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getGlobalMachineSections(): MachineSectionItem[] {
    const key = keyFor('machine-global-sections', 'all');
    if (!Array.isArray(store[key])) {
      store[key] = MACHINE_SECTION_SEED.map((item) => ({ ...item }));
    }
    store[key] = normalizeMachineSections(store[key], { allowNotes: true });
    if (store[key].length === 0) {
      store[key] = normalizeMachineSections(
        MACHINE_SECTION_SEED.map((item) => ({ ...item })),
        { allowNotes: true },
      );
    }

    const mistakenNames: Record<number, string> = {
      1: '标准输送段',
      2: '六轴机械手',
      3: '台车系统',
    };
    let restored = false;
    store[key] = (store[key] as MachineSectionItem[]).map((item) => {
      const seed = MACHINE_SECTION_SEED.find((entry) => entry.id === item.id);
      if (!seed || seed.kind !== 'structure') return item;
      if (item.name === mistakenNames[item.id] && item.name !== seed.name) {
        restored = true;
        return { ...item, name: seed.name };
      }
      return item;
    });
    store[key] = normalizeMachineSections(store[key], { allowNotes: true });
    if (restored) {
      persist(cloneStore(store));
    }
    return store[key] as MachineSectionItem[];
  }

  function findGeneralStructureSection(itemName: string): {
    section: MachineSectionItem;
    via: 'label' | 'name';
  } | null {
    const labels = getGeneralStructureLabelMap();
    const byLabel = Object.entries(labels).find(
      ([, label]) => label === itemName,
    );
    if (byLabel) {
      const id = Number(byLabel[0]);
      const section = getGlobalMachineSections().find((item) => item.id === id);
      if (section) return { section, via: 'label' };
    }
    const section = getGlobalMachineSections().find(
      (item) => item.kind === 'structure' && item.name === itemName,
    );
    if (section) return { section, via: 'name' };
    return null;
  }

  function saveGlobalMachineSection(
    payload: Partial<MachineSectionItem>,
    editId?: number,
  ): SaveResult<MachineSectionItem> {
    const items = getGlobalMachineSections();
    const name = storedText(payload.name).trim().slice(0, 40);
    if (!name) return { ok: false, reason: 'validation' };

    const duplicate = items.some(
      (item) =>
        item.id !== editId &&
        item.name.toLocaleLowerCase('zh-CN') ===
          name.toLocaleLowerCase('zh-CN'),
    );
    if (duplicate) return { ok: false, reason: 'duplicate' };

    const snapshot = cloneStore(store);
    const sort = Number(payload.sort);

    if (editId) {
      const index = items.findIndex((item) => item.id === editId);
      if (index === -1) return { ok: false, reason: 'stale' };
      const existing = items[index];
      if (!existing) return { ok: false, reason: 'stale' };
      const kind = existing.kind === 'notes' ? 'notes' : 'structure';
      const normalized = normalizeMachineSections(
        [
          {
            id: editId,
            name,
            sort: Number.isFinite(sort) ? sort : existing.sort,
            kind,
            locked: kind === 'notes' ? true : existing.locked,
            scope: 'global',
          },
        ],
        { allowNotes: true },
      )[0];
      if (!normalized) return { ok: false, reason: 'validation' };
      items.splice(index, 1, normalized);
    } else {
      const normalized = normalizeMachineSections(
        [
          {
            id: nextAvailableId(items),
            name,
            sort: Number.isFinite(sort) ? sort : items.length + 1,
            kind: 'structure',
            scope: 'global',
          },
        ],
        { allowNotes: true },
      )[0];
      if (!normalized) return { ok: false, reason: 'validation' };
      items.push(normalized);
    }

    store[keyFor('machine-global-sections', 'all')] = normalizeMachineSections(
      items,
      { allowNotes: true },
    );
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    const saved = (store[keyFor('machine-global-sections', 'all')] as MachineSectionItem[]).find(
      (item) => item.name === name,
    );
    if (!saved) return { ok: false, reason: 'validation' };
    return { ok: true, item: saved };
  }

  function ensureGeneralStructureSection(
    itemName: string,
  ): SaveResult<MachineSectionItem> {
    const name = storedText(itemName).trim().slice(0, 40);
    if (!name) return { ok: false, reason: 'validation' };
    const found = findGeneralStructureSection(name);
    if (found) return { ok: true, item: found.section };
    return saveGlobalMachineSection({
      name,
      sort: getGlobalMachineSections().length + 1,
    });
  }

  function syncGeneralStructureItemRename(
    fromName: string,
    toName: string,
  ): SaveResult<MachineSectionItem> {
    const nextName = storedText(toName).trim().slice(0, 40);
    if (!nextName) return { ok: false, reason: 'validation' };
    const found = findGeneralStructureSection(fromName);
    if (!found) return ensureGeneralStructureSection(nextName);
    if (
      found.via === 'label' ||
      Object.hasOwn(GENERAL_STRUCTURE_SECTION_LABELS, found.section.id)
    ) {
      const labeled = persistGeneralStructureLabel(found.section.id, nextName);
      if (!labeled.ok) return labeled;
      return { ok: true, item: found.section };
    }
    return saveGlobalMachineSection(
      { name: nextName, sort: found.section.sort },
      found.section.id,
    );
  }

  function deleteGlobalMachineSection(id: number): DeleteResult {
    const items = getGlobalMachineSections();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    const target = items[index];
    if (!target) return { ok: false, reason: 'stale' };
    if (target.locked || target.kind === 'notes') {
      return { ok: false, reason: 'validation' };
    }

    for (const group of getEntityGroups('machine')) {
      for (const machineName of group.items) {
        if (
          getMachineSectionRows(id, machineName).length > 0 ||
          getMachineSectionImages(id, machineName).length > 0
        ) {
          return { ok: false, reason: 'not-empty' };
        }
      }
    }

    const snapshot = cloneStore(store);
    items.splice(index, 1);
    store[keyFor('machine-global-sections', 'all')] = normalizeMachineSections(
      items,
      { allowNotes: true },
    );
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getExtraMachineSections(machineName: string): MachineSectionItem[] {
    const key = keyFor('machine-extra-sections', machineName);
    if (!Array.isArray(store[key])) {
      store[key] = [];
    }
    store[key] = normalizeMachineSections(store[key], {
      allowNotes: false,
    }).map((item) => ({ ...item, kind: 'structure', scope: 'machine' }));
    return store[key] as MachineSectionItem[];
  }

  function nextExtraMachineSectionId(machineName: string): number {
    const used = new Set([
      ...getExtraMachineSections(machineName).map((item) => item.id),
      ...getGlobalMachineSections().map((item) => item.id),
    ]);
    let id = 1001;
    while (used.has(id)) id += 1;
    return id;
  }

  function saveExtraMachineSection(
    machineName: string,
    payload: Partial<MachineSectionItem>,
    editId?: number,
  ): SaveResult<MachineSectionItem> {
    const items = getExtraMachineSections(machineName);
    const name = storedText(payload.name).trim().slice(0, 40);
    if (!name) return { ok: false, reason: 'validation' };

    const resolvedNames = listResolvedMachineSections(machineName);
    const duplicate = resolvedNames.some(
      (item) =>
        item.id !== editId &&
        item.name.toLocaleLowerCase('zh-CN') ===
          name.toLocaleLowerCase('zh-CN'),
    );
    if (duplicate) return { ok: false, reason: 'duplicate' };

    const snapshot = cloneStore(store);
    const sort = Number(payload.sort);

    if (editId) {
      const index = items.findIndex((item) => item.id === editId);
      if (index === -1) return { ok: false, reason: 'stale' };
      const existing = items[index];
      if (!existing) return { ok: false, reason: 'stale' };
      const normalized = normalizeMachineSections(
        [
          {
            id: editId,
            name,
            sort: Number.isFinite(sort) ? sort : existing.sort,
            kind: 'structure',
            scope: 'machine',
          },
        ],
        { allowNotes: false },
      )[0];
      if (!normalized) return { ok: false, reason: 'validation' };
      items.splice(index, 1, { ...normalized, scope: 'machine' });
    } else {
      const normalized = normalizeMachineSections(
        [
          {
            id: nextExtraMachineSectionId(machineName),
            name,
            sort: Number.isFinite(sort) ? sort : items.length + 1,
            kind: 'structure',
            scope: 'machine',
          },
        ],
        { allowNotes: false },
      )[0];
      if (!normalized) return { ok: false, reason: 'validation' };
      items.push({ ...normalized, scope: 'machine' });
    }

    store[keyFor('machine-extra-sections', machineName)] =
      normalizeMachineSections(items, { allowNotes: false }).map((item) => ({
        ...item,
        kind: 'structure' as const,
        scope: 'machine' as const,
      }));
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    const saved = (
      store[keyFor('machine-extra-sections', machineName)] as MachineSectionItem[]
    ).find((item) => item.name === name);
    if (!saved) return { ok: false, reason: 'validation' };
    return { ok: true, item: saved };
  }

  function deleteExtraMachineSection(
    machineName: string,
    id: number,
  ): DeleteResult {
    const items = getExtraMachineSections(machineName);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    if (
      getMachineSectionRows(id, machineName).length > 0 ||
      getMachineSectionImages(id, machineName).length > 0
    ) {
      return { ok: false, reason: 'not-empty' };
    }

    const snapshot = cloneStore(store);
    items.splice(index, 1);
    store[keyFor('machine-extra-sections', machineName)] =
      normalizeMachineSections(items, { allowNotes: false }).map((item) => ({
        ...item,
        kind: 'structure' as const,
        scope: 'machine' as const,
      }));
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function sectionAllowsImage(sectionId: number): boolean {
    const numericId = Number(sectionId);
    const section = getGlobalMachineSections().find(
      (item) => item.id === numericId,
    );
    if (section) return section.kind !== 'notes';
    return true;
  }

  function migrateLegacyMachineRows(sectionId: number, machineName: string) {
    const numericId = Number(sectionId);
    const newKey = machineSectionRowsKey(numericId, machineName);
    if (Object.hasOwn(store, newKey)) return;

    const legacyListId = Object.entries(MACHINE_SECTION_LEGACY_MAP).find(
      ([, id]) => id === numericId,
    )?.[0];

    if (!legacyListId) {
      store[newKey] = [];
      return;
    }

    const legacyKey = keyFor(legacyListId, machineName);
    let legacyItems: unknown[];
    if (Array.isArray(store[legacyKey])) {
      legacyItems = store[legacyKey];
    } else {
      legacyItems = [];
    }

    store[newKey] = normalizeMachineSectionRows(legacyItems, {
      allowImage: sectionAllowsImage(numericId),
      sensorItems: getSensors(),
    });
  }

  function getMachineSectionRows(
    sectionId: number,
    machineName: string,
  ): MachineSectionRow[] {
    const numericId = Number(sectionId);
    migrateLegacyMachineRows(numericId, machineName);
    const key = machineSectionRowsKey(numericId, machineName);
    const allowImage = sectionAllowsImage(numericId);
    store[key] = normalizeMachineSectionRows(
      Array.isArray(store[key]) ? store[key] : [],
      { allowImage, sensorItems: getSensors() },
    );
    return store[key] as MachineSectionRow[];
  }

  function getMachineSectionImages(
    sectionId: number,
    machineName: string,
  ): MachineRowImage[] {
    const numericId = Number(sectionId);
    const key = machineSectionImagesKey(numericId, machineName);
    if (Object.hasOwn(store, key)) {
      store[key] = normalizeMachineSectionImages(store[key]);
    } else {
      const legacyImages = getMachineSectionRows(numericId, machineName)
        .map((row) => row.image)
        .filter((image): image is MachineRowImage => Boolean(image));
      store[key] = normalizeMachineSectionImages(legacyImages);
    }
    return store[key] as MachineRowImage[];
  }

  function saveMachineSectionImages(
    sectionId: number,
    machineName: string,
    images: MachineRowImage[],
  ): SaveResult<{ items: MachineRowImage[] }> {
    const numericId = Number(sectionId);
    const normalized = normalizeMachineSectionImages(images);
    if (normalized.length !== (Array.isArray(images) ? images.length : 0)) {
      return { ok: false, reason: 'validation' };
    }
    const snapshot = cloneStore(store);
    store[machineSectionImagesKey(numericId, machineName)] = normalized;
    return persist(snapshot)
      ? { ok: true, item: { items: normalized } }
      : { ok: false, reason: 'storage' };
  }

  function saveMachineSectionRow(
    sectionId: number,
    machineName: string,
    payload: Partial<MachineSectionRow> & Record<string, unknown>,
    editId?: number,
  ): SaveResult<MachineSectionRow> {
    const numericId = Number(sectionId);
    const items = getMachineSectionRows(numericId, machineName);
    const allowImage = sectionAllowsImage(numericId);
    const role = storedText(payload.role).trim();
    let nextPayload = payload;
    if (allowImage) {
      const sensorIds = Array.isArray(payload.sensorIds)
        ? [
            ...new Set(
              payload.sensorIds
                .map(Number)
                .filter((value) => Number.isSafeInteger(value) && value > 0),
            ),
          ]
        : [];
      if (!role || sensorIds.length === 0) {
        return { ok: false, reason: 'validation' };
      }
      nextPayload = { ...payload, sensorIds };
    } else {
      const name = storedText(payload.name).trim();
      if (!role || !name) return { ok: false, reason: 'validation' };
    }

    let image: MachineRowImage | null | undefined;
    if (allowImage && Object.hasOwn(payload, 'image')) {
      if (payload.image === null || payload.image === undefined) {
        image = null;
      } else {
        const validation = validateMachineRowImage(
          payload.image.fileName,
          payload.image.mimeType,
          payload.image.size,
        );
        if (!validation.ok) return { ok: false, reason: validation.reason };
        const normalizedImage = normalizeMachineRowImage(payload.image);
        if (!normalizedImage) return { ok: false, reason: 'validation' };
        image = normalizedImage;
      }
    }

    const snapshot = cloneStore(store);
    const base: MachineSectionRow = {
      id: editId || nextAvailableId(items),
      role,
      sensorIds: Array.isArray(nextPayload.sensorIds)
        ? nextPayload.sensorIds.map(Number)
        : [],
      sensorType: storedText(nextPayload.sensorType),
      spec: storedText(nextPayload.spec),
      purpose: storedText(nextPayload.purpose),
      name: storedText(nextPayload.name),
      desc: storedText(nextPayload.desc),
      note: storedText(nextPayload.note),
    };
    if (allowImage) {
      if (image !== undefined) {
        if (image) base.image = image;
      } else if (editId) {
        const existing = items.find((item) => item.id === editId);
        if (existing?.image) base.image = existing.image;
      }
    }

    const selectedSensors = getSensors().filter((sensor) =>
      base.sensorIds.includes(sensor.id),
    );
    if (allowImage && selectedSensors.length === 0) {
      return { ok: false, reason: 'stale' };
    }
    if (allowImage) {
      base.sensorIds = selectedSensors.map((sensor) => sensor.id);
      base.sensorType = selectedSensors
        .map((sensor) => sensor.sensorType)
        .join('、');
      base.spec = selectedSensors
        .map((sensor) => sensor.spec || sensor.model)
        .filter(Boolean)
        .join('、');
    }
    const normalized = normalizeMachineSectionRows([base], {
      allowImage,
      sensorItems: getSensors(),
    })[0];
    if (!normalized) return { ok: false, reason: 'validation' };

    if (editId) {
      const index = items.findIndex((item) => item.id === editId);
      if (index === -1) return { ok: false, reason: 'stale' };
      items.splice(index, 1, normalized);
    } else {
      items.push(normalized);
    }

    store[machineSectionRowsKey(numericId, machineName)] =
      normalizeMachineSectionRows(items, {
        allowImage,
        sensorItems: getSensors(),
      });
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: normalized };
  }

  function deleteMachineSectionRow(
    sectionId: number,
    machineName: string,
    id: number,
  ): DeleteResult {
    const numericId = Number(sectionId);
    const items = getMachineSectionRows(numericId, machineName);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    const snapshot = cloneStore(store);
    items.splice(index, 1);
    store[machineSectionRowsKey(numericId, machineName)] =
      normalizeMachineSectionRows(items, {
        allowImage: sectionAllowsImage(numericId),
        sensorItems: getSensors(),
      });
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getDocumentList(
    listId: string,
    entityName: string,
  ): ControlledFileItem[] {
    const key = keyFor(listId, entityName);
    if (!Array.isArray(store[key])) {
      store[key] =
        listId === 'customer-sop' ? createDefaultControlledDocuments() : [];
    }
    store[key] = normalizeControlledDocuments(store[key]);
    return store[key] as ControlledFileItem[];
  }

  function getControlledDocuments(entityName: string): ControlledFileItem[] {
    return getDocumentList('customer-sop', entityName);
  }

  function getProcessIntroFiles(): ControlledFileItem[] {
    return getDocumentList('process-intro', 'all');
  }

  function saveDocument(
    listId: string,
    entityName: string,
    attachment: ControlledFileAttachment,
  ): SaveResult<ControlledFileItem> {
    const kind = detectControlledFileKind(
      attachment.fileName,
      attachment.mimeType,
    );
    if (!kind) return { ok: false, reason: 'type' };

    const validation = validateControlledUpload(
      kind,
      attachment.fileName,
      attachment.mimeType,
      attachment.size,
    );
    if (!validation.ok) return { ok: false, reason: validation.reason };

    const fileName = storedText(attachment.fileName).slice(0, 200);
    const mimeType = storedText(attachment.mimeType).slice(0, 120);
    const dataUrl = storedText(attachment.dataUrl);
    const size = Number(attachment.size);
    const uploadedAt = storedText(attachment.uploadedAt);
    if (
      !fileName ||
      !dataUrl.startsWith('data:') ||
      !Number.isFinite(size) ||
      size <= 0
    ) {
      return { ok: false, reason: 'validation' };
    }

    const items = getDocumentList(listId, entityName);
    const snapshot = cloneStore(store);
    const item: ControlledFileItem = {
      id: nextAvailableId(items),
      kind,
      dataUrl,
      fileName,
      mimeType,
      size,
      uploadedAt,
    };
    items.push(item);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item };
  }

  function saveControlledFile(
    entityName: string,
    attachment: ControlledFileAttachment,
  ): SaveResult<ControlledFileItem> {
    return saveDocument('customer-sop', entityName, attachment);
  }

  function saveProcessIntroFile(
    attachment: ControlledFileAttachment,
  ): SaveResult<ControlledFileItem> {
    return saveDocument('process-intro', 'all', attachment);
  }

  function deleteDocument(
    listId: string,
    entityName: string,
    id: number,
  ): DeleteResult {
    const items = getDocumentList(listId, entityName);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };

    const snapshot = cloneStore(store);
    items.splice(index, 1);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function deleteControlledFile(entityName: string, id: number): DeleteResult {
    return deleteDocument('customer-sop', entityName, id);
  }

  function deleteProcessIntroFile(id: number): DeleteResult {
    return deleteDocument('process-intro', 'all', id);
  }

  function dictionaryStorageKey(code: string) {
    return keyFor('dict', code);
  }

  function getDictionaryItems(code: string): DictionaryItem[] {
    const definition = DICTIONARY_DEFINITIONS.find(
      (item) => item.code === code,
    );
    if (!definition) return [];

    const key = dictionaryStorageKey(code);
    const legacyKey =
      code === 'customer-feedback' ? keyFor('dict-feedback-type', 'all') : null;

    if (!Array.isArray(store[key])) {
      store[key] =
        legacyKey && Array.isArray(store[legacyKey])
          ? store[legacyKey]
          : createDictionaryDefaults(code);
    }

    store[key] = normalizeDictionaryItems(store[key]);
    if (store[key].length === 0) {
      store[key] = createDictionaryDefaults(code);
    }

    if (
      code === 'sensor-status' &&
      !(store[key] as DictionaryItem[]).some((item) => item.name === '停用')
    ) {
      const snapshot = cloneStore(store);
      store[key] = normalizeDictionaryItems([
        ...(store[key] as DictionaryItem[]),
        {
          id: nextAvailableId(store[key] as DictionaryItem[]),
          name: '停用',
          sort:
            Math.max(
              0,
              ...(store[key] as DictionaryItem[]).map(
                (item) => Number(item.sort) || 0,
              ),
            ) + 1,
        },
      ]);
      persist(snapshot);
    }

    return store[key] as DictionaryItem[];
  }

  function renameDictionaryValue(
    definition: DictionaryDefinition,
    fromName: string,
    toName: string,
  ) {
    const field = definition.field || 'type';
    for (const listId of definition.listIds) {
      const prefix = `${listId}:`;
      for (const [key, value] of Object.entries(store)) {
        if (!key.startsWith(prefix) || !Array.isArray(value)) continue;
        store[key] = normalizeCrudItems(
          listId,
          value.map((item) =>
            item &&
            typeof item === 'object' &&
            (item as Record<string, unknown>)[field] === fromName
              ? { ...item, [field]: toName }
              : item,
          ),
        );
      }
    }

    if (definition.catalog === 'sensor') {
      const key = keyFor('sensor-catalog', 'all');
      if (!Array.isArray(store[key])) return;
      const typeNames = getDictionaryItems('sensor-type').map(
        (item) => item.name,
      );
      const statusNames = getDictionaryItems('sensor-status').map(
        (item) => item.name,
      );
      store[key] = normalizeSensorItems(
        (store[key] as SensorItem[]).map((item) =>
          (item as unknown as Record<string, unknown>)[field] === fromName
            ? { ...item, [field]: toName }
            : item,
        ),
        typeNames,
        statusNames,
      );
    }

    if (definition.catalog === 'process-step') {
      const key = keyFor('process-steps', 'all');
      if (!Array.isArray(store[key])) return;
      store[key] = normalizeProcessSteps(
        (store[key] as ProcessStepItem[]).map((item) =>
          (item as unknown as Record<string, unknown>)[field] === fromName
            ? { ...item, [field]: toName }
            : item,
        ),
      );
    }
  }

  function saveDictionaryItem(
    code: string,
    payload: Partial<DictionaryItem>,
    editId?: number,
  ): SaveResult<DictionaryItem> {
    const definition = DICTIONARY_DEFINITIONS.find(
      (item) => item.code === code,
    );
    if (!definition) return { ok: false, reason: 'validation' };

    const items = getDictionaryItems(code);
    const name = storedText(payload.name).trim().slice(0, 40);
    if (!name) return { ok: false, reason: 'validation' };

    const duplicate = items.some(
      (item) =>
        item.id !== editId &&
        item.name.toLocaleLowerCase('zh-CN') ===
          name.toLocaleLowerCase('zh-CN'),
    );
    if (duplicate) return { ok: false, reason: 'duplicate' };

    const snapshot = cloneStore(store);
    const sort = Number(payload.sort);
    const normalized = normalizeDictionaryItems([
      {
        id: editId || nextAvailableId(items),
        name,
        sort: Number.isFinite(sort) ? sort : items.length + 1,
      },
    ])[0];
    if (!normalized) return { ok: false, reason: 'validation' };

    if (editId) {
      const index = items.findIndex((item) => item.id === editId);
      if (index === -1) return { ok: false, reason: 'stale' };
      const previousName = items[index]?.name;
      items.splice(index, 1, normalized);
      if (previousName && previousName !== normalized.name) {
        renameDictionaryValue(definition, previousName, normalized.name);
      }
    } else {
      items.push(normalized);
    }

    store[dictionaryStorageKey(code)] = normalizeDictionaryItems(items);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: normalized };
  }

  function deleteDictionaryItem(code: string, id: number): DeleteResult {
    const definition = DICTIONARY_DEFINITIONS.find(
      (item) => item.code === code,
    );
    if (!definition) return { ok: false, reason: 'validation' };

    const items = getDictionaryItems(code);
    if (items.length <= 1) return { ok: false, reason: 'validation' };
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };

    const snapshot = cloneStore(store);
    const [removed] = items.splice(index, 1);
    const fallback =
      items[0]?.name || createDictionaryDefaults(code)[0]?.name || '';
    if (removed) renameDictionaryValue(definition, removed.name, fallback);
    store[dictionaryStorageKey(code)] = normalizeDictionaryItems(items);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getFeedbackTypes() {
    return getDictionaryItems('customer-feedback');
  }

  function saveFeedbackType(
    payload: Partial<DictionaryItem>,
    editId?: number,
  ) {
    return saveDictionaryItem('customer-feedback', payload, editId);
  }

  function deleteFeedbackType(id: number) {
    return deleteDictionaryItem('customer-feedback', id);
  }

  function entityGroupsKey(kind: EntityKind) {
    return keyFor('entity-groups', kind);
  }

  function getEntityGroups(kind: EntityKind): EntityGroup[] {
    if (!entityKindDefinition(kind)) return [];
    const key = entityGroupsKey(kind);
    if (!Array.isArray(store[key])) {
      store[key] = createEntityGroupDefaults(kind);
    }
    store[key] = normalizeEntityGroups(store[key]);
    if (store[key].length === 0) {
      store[key] = createEntityGroupDefaults(kind);
    }
    return store[key] as EntityGroup[];
  }

  function entityDataKeys(kind: EntityKind, entityName: string): string[] {
    const definition = entityKindDefinition(kind);
    if (!definition) return [];
    if (kind === 'machine') {
      const keys = [keyFor('machine-extra-sections', entityName)];
      const sectionIds = new Set(
        listResolvedMachineSections(entityName).map((item) => item.id),
      );
      for (const sectionId of sectionIds) {
        keys.push(
          machineSectionRowsKey(sectionId, entityName),
          machineSectionImagesKey(sectionId, entityName),
        );
      }
      const rowSuffix = `:${entityName}`;
      for (const key of Object.keys(store)) {
        if (
          key.startsWith('machine-section-rows:') &&
          key.endsWith(rowSuffix) &&
          !keys.includes(key)
        ) {
          keys.push(key);
        }
      }
      for (const key of Object.keys(store)) {
        if (
          key.startsWith('machine-section-images:') &&
          key.endsWith(rowSuffix) &&
          !keys.includes(key)
        ) {
          keys.push(key);
        }
      }
      for (const listId of Object.keys(MACHINE_SECTION_LEGACY_MAP)) {
        keys.push(keyFor(listId, entityName));
      }
      return keys;
    }
    const keys = definition.listIds.map((listId) => keyFor(listId, entityName));
    if (definition.hasControlledFiles) {
      keys.push(keyFor('customer-sop', entityName));
    }
    return keys;
  }

  function entityHasData(kind: EntityKind, entityName: string): boolean {
    if (kind === 'machine') {
      if (getExtraMachineSections(entityName).length > 0) return true;
      return listResolvedMachineSections(entityName).some(
        (section) =>
          getMachineSectionRows(section.id, entityName).length > 0 ||
          getMachineSectionImages(section.id, entityName).length > 0,
      );
    }
    return entityDataKeys(kind, entityName).some(
      (key) => Array.isArray(store[key]) && store[key].length > 0,
    );
  }

  function migrateEntityDataKeys(
    kind: EntityKind,
    fromName: string,
    toName: string,
  ) {
    if (kind === 'machine') {
      const removals: string[] = [];
      const extraFrom = keyFor('machine-extra-sections', fromName);
      const extraTo = keyFor('machine-extra-sections', toName);
      if (Object.hasOwn(store, extraFrom)) {
        store[extraTo] = store[extraFrom];
        removals.push(extraFrom);
      }

      const fromSuffix = `:${fromName}`;
      for (const key of Object.keys(store)) {
        if (
          !key.startsWith('machine-section-rows:') ||
          !key.endsWith(fromSuffix)
        ) {
          continue;
        }
        const toKey = `${key.slice(0, -fromSuffix.length)}:${toName}`;
        store[toKey] = store[key];
        removals.push(key);
      }

      for (const key of Object.keys(store)) {
        if (
          !key.startsWith('machine-section-images:') ||
          !key.endsWith(fromSuffix)
        ) {
          continue;
        }
        const toKey = `${key.slice(0, -fromSuffix.length)}:${toName}`;
        store[toKey] = store[key];
        removals.push(key);
      }

      for (const listId of Object.keys(MACHINE_SECTION_LEGACY_MAP)) {
        const fromKey = keyFor(listId, fromName);
        if (!Object.hasOwn(store, fromKey)) continue;
        store[keyFor(listId, toName)] = store[fromKey];
        removals.push(fromKey);
      }

      if (removals.length > 0) store = omitStoreKeys(store, removals);
      return;
    }

    const removals: string[] = [];
    for (const fromKey of entityDataKeys(kind, fromName)) {
      const listId = fromKey.slice(0, fromKey.lastIndexOf(':'));
      const toKey = keyFor(listId, toName);
      if (!Object.hasOwn(store, fromKey)) continue;
      store[toKey] = store[fromKey];
      removals.push(fromKey);
    }
    if (removals.length > 0) store = omitStoreKeys(store, removals);
  }

  function clearEntityDataKeys(kind: EntityKind, entityName: string) {
    store = omitStoreKeys(store, entityDataKeys(kind, entityName));
  }

  function initEmptyEntityData(kind: EntityKind, entityName: string) {
    if (kind === 'machine') {
      store[keyFor('machine-extra-sections', entityName)] = [];
      for (const section of getGlobalMachineSections()) {
        store[machineSectionRowsKey(section.id, entityName)] = [];
      }
      return;
    }
    for (const key of entityDataKeys(kind, entityName)) {
      store[key] = [];
    }
  }

  function findEntityLocation(groups: EntityGroup[], entityName: string) {
    for (const group of groups) {
      const index = group.items.indexOf(entityName);
      if (index !== -1) return { group, index };
    }
    return null;
  }

  function validReorderIndex(
    oldIndex: number,
    newIndex: number,
    length: number,
  ) {
    return (
      Number.isInteger(oldIndex) &&
      Number.isInteger(newIndex) &&
      oldIndex >= 0 &&
      oldIndex < length &&
      newIndex >= 0 &&
      newIndex < length
    );
  }

  function reorderEntityGroups(
    kind: EntityKind,
    oldIndex: number,
    newIndex: number,
  ): ReorderResult {
    if (!entityKindDefinition(kind)) return { ok: false, reason: 'validation' };
    const groups = getEntityGroups(kind);
    if (!validReorderIndex(oldIndex, newIndex, groups.length)) {
      return { ok: false, reason: 'validation' };
    }
    if (oldIndex === newIndex) return { ok: true };

    const snapshot = cloneStore(store);
    const [moved] = groups.splice(oldIndex, 1);
    if (!moved) return { ok: false, reason: 'stale' };
    groups.splice(newIndex, 0, moved);
    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function reorderEntityItems(
    kind: EntityKind,
    groupName: string,
    oldIndex: number,
    newIndex: number,
  ): ReorderResult {
    if (!entityKindDefinition(kind)) return { ok: false, reason: 'validation' };
    const groups = getEntityGroups(kind);
    const group = groups.find((item) => item.name === groupName);
    if (!group) return { ok: false, reason: 'stale' };
    if (!validReorderIndex(oldIndex, newIndex, group.items.length)) {
      return { ok: false, reason: 'validation' };
    }
    if (oldIndex === newIndex) return { ok: true };

    const snapshot = cloneStore(store);
    const [moved] = group.items.splice(oldIndex, 1);
    if (moved === undefined) return { ok: false, reason: 'stale' };
    group.items.splice(newIndex, 0, moved);
    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function saveEntityGroup(
    kind: EntityKind,
    payload: { name: string },
    editName?: string,
  ): SaveResult<EntityGroup> {
    if (!entityKindDefinition(kind)) return { ok: false, reason: 'validation' };
    const groups = getEntityGroups(kind);
    const name = storedText(payload.name).trim().slice(0, 40);
    if (!name) return { ok: false, reason: 'validation' };

    const duplicate = groups.some(
      (group) => group.name !== editName && sameLocaleName(group.name, name),
    );
    if (duplicate) return { ok: false, reason: 'duplicate' };

    const snapshot = cloneStore(store);
    if (editName) {
      const index = groups.findIndex((group) => group.name === editName);
      if (index === -1) return { ok: false, reason: 'stale' };
      const existing = groups[index];
      if (!existing) return { ok: false, reason: 'stale' };
      groups[index] = { name, items: [...existing.items] };
    } else {
      groups.push({ name, items: [] });
    }

    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    const item = (store[entityGroupsKey(kind)] as EntityGroup[]).find(
      (group) => group.name === name,
    );
    if (!item) return { ok: false, reason: 'validation' };
    return { ok: true, item };
  }

  function deleteEntityGroup(kind: EntityKind, name: string): DeleteResult {
    if (!entityKindDefinition(kind)) return { ok: false, reason: 'validation' };
    const groups = getEntityGroups(kind);
    const index = groups.findIndex((group) => group.name === name);
    if (index === -1) return { ok: false, reason: 'stale' };
    if ((groups[index]?.items.length ?? 0) > 0) {
      return { ok: false, reason: 'not-empty' };
    }

    const snapshot = cloneStore(store);
    groups.splice(index, 1);
    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function saveEntityItem(
    kind: EntityKind,
    payload: { category: string; name: string },
    editName?: string,
  ): SaveResult<EntityTreeItem> {
    const definition = entityKindDefinition(kind);
    if (!definition) return { ok: false, reason: 'validation' };

    const groups = getEntityGroups(kind);
    const name = storedText(payload.name).trim().slice(0, 40);
    const category = storedText(payload.category).trim().slice(0, 40);
    if (!name || !category) return { ok: false, reason: 'validation' };

    const targetGroup = groups.find((group) => group.name === category);
    if (!targetGroup) return { ok: false, reason: 'validation' };

    const duplicate = groups.some((group) =>
      group.items.some(
        (item) => item !== editName && sameLocaleName(item, name),
      ),
    );
    if (duplicate) return { ok: false, reason: 'duplicate' };

    const snapshot = cloneStore(store);
    if (editName) {
      const location = findEntityLocation(groups, editName);
      if (!location) return { ok: false, reason: 'stale' };
      location.group.items.splice(location.index, 1);
      if (editName !== name) {
        migrateEntityDataKeys(kind, editName, name);
      }
      targetGroup.items.push(name);
    } else {
      targetGroup.items.push(name);
      initEmptyEntityData(kind, name);
    }

    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };

    if (kind === 'machine' && category === GENERAL_STRUCTURE_CATEGORY) {
      let synced = ensureGeneralStructureSection(name);
      if (editName && editName !== name) {
        synced = syncGeneralStructureItemRename(editName, name);
      }
      if (!synced.ok) return synced;
    }

    return { ok: true, item: { name, category } };
  }

  function deleteEntityItem(kind: EntityKind, name: string): DeleteResult {
    if (!entityKindDefinition(kind)) return { ok: false, reason: 'validation' };
    const groups = getEntityGroups(kind);
    const location = findEntityLocation(groups, name);
    if (!location) return { ok: false, reason: 'stale' };
    if (entityHasData(kind, name)) return { ok: false, reason: 'not-empty' };

    const category = location.group.name;
    const generalBinding =
      kind === 'machine' && category === GENERAL_STRUCTURE_CATEGORY
        ? findGeneralStructureSection(name)
        : null;
    if (
      generalBinding &&
      !Object.hasOwn(
        GENERAL_STRUCTURE_SECTION_LABELS,
        generalBinding.section.id,
      )
    ) {
      for (const group of groups) {
        for (const machineName of group.items) {
          if (machineName === name) continue;
          if (
            getMachineSectionRows(generalBinding.section.id, machineName)
              .length > 0
          ) {
            return { ok: false, reason: 'not-empty' };
          }
        }
      }
    }

    const snapshot = cloneStore(store);
    location.group.items.splice(location.index, 1);
    clearEntityDataKeys(kind, name);
    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };

    if (
      generalBinding &&
      !Object.hasOwn(
        GENERAL_STRUCTURE_SECTION_LABELS,
        generalBinding.section.id,
      )
    ) {
      const removed = deleteGlobalMachineSection(generalBinding.section.id);
      if (!removed.ok && removed.reason !== 'stale') return removed;
    }

    return { ok: true };
  }

  function replaceFromStorage(rawValue: null | string) {
    store = parsePersistedStore(rawValue);
  }

  function snapshotStore(): PersistedStore {
    return cloneStore(store);
  }

  return {
    deleteControlledFile,
    deleteCrud,
    deleteDictionaryItem,
    deleteEntityGroup,
    deleteEntityItem,
    deleteExtraMachineSection,
    deleteFeedbackType,
    deleteGlobalMachineSection,
    deleteMachineSectionRow,
    deleteProcessIntroFile,
    deleteProcessStep,
    deleteSensor,
    deleteSensorSop,
    ensureGeneralStructureSection,
    entityHasData,
    findGeneralStructureSection,
    getControlledDocuments,
    getCrud,
    getDictionaryItems,
    getEntityGroups,
    getExtraMachineSections,
    getFeedbackTypes,
    getGeneralStructureLabelMap,
    getGlobalMachineSections,
    getMachineSectionImages,
    getMachineSectionRows,
    getProcessIntroFiles,
    getProcessSteps,
    getSensors,
    getSensorSops,
    listResolvedMachineSections,
    replaceFromStorage,
    reorderEntityGroups,
    reorderEntityItems,
    saveControlledFile,
    saveCrud,
    saveDictionaryItem,
    saveEntityGroup,
    saveEntityItem,
    saveExtraMachineSection,
    saveFeedbackType,
    saveGlobalMachineSection,
    saveMachineSectionRow,
    saveMachineSectionImages,
    saveProcessIntroFile,
    saveProcessStep,
    replaceSensorCurrent,
    saveSensor,
    saveSensorSop,
    snapshotStore,
    syncGeneralStructureItemRename,
  };
}

export function buildDefaultStore({
  crudDefaults,
  sensorData,
}: {
  crudDefaults: CrudDefaults;
  sensorData: Record<string, SensorTypeDefinition>;
}): PersistedStore {
  const memory: { value: null | string } = { value: null };
  const fakeStorage: StorageLike = {
    getItem: () => memory.value,
    setItem: (_key, value) => {
      memory.value = value;
    },
  };
  const repo = createSelectionRepository({
    storage: fakeStorage,
    crudDefaults,
    sensorData,
  });
  repo.getEntityGroups('customer');
  repo.getEntityGroups('machine');
  for (const definition of DICTIONARY_DEFINITIONS) {
    repo.getDictionaryItems(definition.code);
  }
  repo.getProcessSteps();
  repo.getProcessIntroFiles();
  repo.getGlobalMachineSections();
  repo.getGeneralStructureLabelMap();
  repo.getSensors();
  repo.getSensorSops();
  const next = repo.snapshotStore();
  const customerNames = repo
    .getEntityGroups('customer')
    .flatMap((group) => group.items);
  for (const [listId, factory] of Object.entries(crudDefaults)) {
    if (!listId.startsWith('customer-')) continue;
    for (const entityName of customerNames) {
      const rows = factory(entityName);
      if (rows.length === 0) continue;
      next[keyFor(listId, entityName)] = rows;
    }
  }
  next['meta:seed-version'] = [{ version: SEED_VERSION }];
  return next;
}
