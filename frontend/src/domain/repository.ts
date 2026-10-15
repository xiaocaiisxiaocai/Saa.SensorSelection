import {
  STORAGE_KEY,
  keyFor,
  machineSectionImagesKey,
  machineSectionRowsKey,
} from './keys';
import {
  CONTROLLED_FILE_KINDS,
  PROCESS_INTRO_FILE_KINDS,
  detectControlledFileKind,
  formatLocalDate,
  isRecord,
  normalizeMachineNodeRef,
  isStoredFileSource,
  nextAvailableId,
  normalizeControlledDocuments,
  normalizeCrudItems,
  normalizeDictionaryItems,
  normalizeEntityGroups,
  normalizeMachineSectionImages,
  normalizeMachineSectionRows,
  normalizeMachineSections,
  normalizeMachineTabs,
  normalizeMachineRowImage,
  normalizeProcessSteps,
  normalizeSensorItems,
  normalizeSensor3dFiles,
  normalizeSensorSops,
  parsePersistedStore,
  storedText,
  validateControlledUpload,
  validateMachineRowImage,
  validateSensor3dUpload,
  createDefaultControlledDocuments,
  createSensorCatalogDefaults,
} from './normalize';
import { entityDataName, machineCatalogKind } from './entity-tree';
import { migrateSelectionSeedStore } from './seed-migration';
import { sanitizeExcelSheetName } from './sheet-name';
import {
  SENSOR_DISABLED_MANUAL,
  SENSOR_HAS_ALTERNATES,
  SENSOR_NEEDS_CURRENT,
  findSensorStatusName,
  isSensorStatus,
  sensorCurrentGuardsAlternates,
  sensorTypeHasCurrent,
} from './sensor-status';
import {
  DICTIONARY_DEFINITIONS,
  ENTITY_KIND_DEFINITIONS,
  GENERAL_STRUCTURE_CATEGORY,
  GENERAL_STRUCTURE_SECTION_LABELS,
  MACHINE_CONTENT_SECTION_ID,
  MACHINE_TAB_PAGE_OWNER,
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
  DictionaryRestoreResult,
  DictionaryRestoreSheet,
  ImportSkip,
  EntityGroup,
  EntityKind,
  EntityTreeItem,
  FeedbackMeasureHistoryEntry,
  MachineRowImage,
  MachineCatalogKind,
  MachineSectionItem,
  MachineSectionRow,
  MachineNodeRef,
  MachineTab,
  MachineTabPage,
  PersistedStore,
  ProcessStepItem,
  ReorderResult,
  SaveResult,
  SensorImportField,
  SensorImportRequest,
  SensorImportResult,
  SensorImportRow,
  SensorItem,
  Sensor3dFileItem,
  SensorSopFileItem,
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
  demoData = true,
}: {
  crudDefaults: CrudDefaults;
  sensorData: Record<string, SensorTypeDefinition>;
  storage?: StorageLike;
  /** 仅用于生成后端演示数据/测试夹具；生产页面必须关闭。 */
  demoData?: boolean;
}) {
  let store: PersistedStore;
  try {
    store = parsePersistedStore(storage?.getItem?.(STORAGE_KEY));
  } catch {
    store = parsePersistedStore(null);
  }
  if (demoData) {
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
  }

  // 只读批处理期间缓存被反复调用的归一化结果。构建搜索索引会对每个
  // 「制程 × 机型 × 分区」调用 getMachineSectionRows，而它每次都会重新归一化
  // 全部 Sensor、工序和字典；批处理内 store 不会被修改，结果可以安全复用。
  let readCache: Map<string, unknown> | null = null;

  function cachedRead<T>(key: string, read: () => T): T {
    if (!readCache) return read();
    if (!readCache.has(key)) readCache.set(key, read());
    return readCache.get(key) as T;
  }

  function batchRead<T>(run: () => T): T {
    if (readCache) return run();
    readCache = new Map();
    try {
      return run();
    } finally {
      readCache = null;
    }
  }

  // 事务内的 persist 只改内存，由最外层 transaction 统一提交一次。
  let transactionDepth = 0;

  function persist(snapshot: PersistedStore): boolean {
    if (transactionDepth > 0) return true;
    try {
      const result = storage?.setItem?.(STORAGE_KEY, JSON.stringify(store));
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

  // 把几个各自会 persist 的步骤合成一次原子写入：任何一步失败都回滚到事务
  // 开始前的状态，避免前一步已经提交、整体却向页面报告失败。
  function transaction<T extends { ok: boolean; reason?: string }>(
    run: () => T,
  ): T {
    if (transactionDepth > 0) return run();
    const snapshot = cloneStore(store);
    transactionDepth += 1;
    let result: T;
    try {
      result = run();
    } catch (error) {
      store = snapshot;
      throw error;
    } finally {
      transactionDepth -= 1;
    }
    if (!result.ok) {
      store = snapshot;
      return result;
    }
    if (!persist(snapshot)) return { ok: false, reason: 'storage' } as T;
    return result;
  }

  // 和 transaction 一样把多步写入合成一次提交；没有任何改动时恢复快照，
  // 避免空导入也写一笔操作日志。
  function commitIfChanged<T extends { ok: true }>(
    run: () => { changed: boolean; result: T },
  ): T | { ok: false; reason: 'storage' } {
    const snapshot = cloneStore(store);
    transactionDepth += 1;
    let outcome: { changed: boolean; result: T };
    try {
      outcome = run();
    } catch (error) {
      store = snapshot;
      throw error;
    } finally {
      transactionDepth -= 1;
    }
    if (!outcome.changed) {
      store = snapshot;
      return outcome.result;
    }
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return outcome.result;
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
        !previous ||
        previousMeasure !== nextMeasure ||
        previousDate !== nextDate;

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
    return cachedRead('sensors', readSensors);
  }

  function readSensors(): SensorItem[] {
    const key = keyFor('sensor-catalog', 'all');
    const typeNames = getDictionaryItems('sensor-type').map(
      (item) => item.name,
    );
    const statusNames = getDictionaryItems('sensor-status').map(
      (item) => item.name,
    );
    if (!Array.isArray(store[key])) {
      store[key] = demoData
        ? createSensorCatalogDefaults(sensorData).map((item) => ({
            ...item,
            status:
              findSensorStatusName(
                statusNames,
                isSensorStatus(item.status, 'current')
                  ? 'current'
                  : 'alternate',
              ) ?? item.status,
          }))
        : [];
    }
    store[key] = normalizeSensorItems(store[key], typeNames, statusNames);
    return store[key] as SensorItem[];
  }

  function listResolvedMachineSections(
    machineName: string,
  ): MachineSectionItem[] {
    return getExtraMachineSections(machineName);
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
      if (!sectionAllowsImage(sectionId, machineName)) continue;

      const rows = getMachineSectionRows(sectionId, machineName);
      if (callback(rows)) {
        store[key] = normalizeMachineSectionRows(rows, {
          allowImage: true,
          boardCharacteristicItems: getDictionaryItems('board-characteristic'),
          machineModelItems: getDictionaryItems('machine-model'),
          processStepItems: getProcessSteps(),
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
    const typeNames = getDictionaryItems('sensor-type').map(
      (item) => item.name,
    );
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

    const previous = editId
      ? items.find((item) => item.id === editId)
      : undefined;
    if (editId && !previous) return { ok: false, reason: 'stale' };
    // 先守住「备选必须还有现用」，再拒绝手选停用，最后才要求备选类型已有现用。
    if (
      previous &&
      sensorCurrentGuardsAlternates(items, previous) &&
      (!isSensorStatus(status, 'current') || sensorType !== previous.sensorType)
    ) {
      return {
        ok: false,
        reason: 'validation',
        message: SENSOR_HAS_ALTERNATES,
      };
    }
    if (
      isSensorStatus(status, 'disabled') &&
      !(previous && isSensorStatus(previous.status, 'disabled'))
    ) {
      return {
        ok: false,
        reason: 'validation',
        message: SENSOR_DISABLED_MANUAL,
      };
    }
    if (
      isSensorStatus(status, 'alternate') &&
      !sensorTypeHasCurrent(items, sensorType, previous?.id)
    ) {
      return { ok: false, reason: 'validation', message: SENSOR_NEEDS_CURRENT };
    }

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
    let model3dId: null | number = null;
    if (
      Object.hasOwn(payload, 'model3dId') &&
      payload.model3dId !== null &&
      payload.model3dId !== undefined
    ) {
      const requested = Number(payload.model3dId);
      if (
        Number.isSafeInteger(requested) &&
        requested > 0 &&
        getSensor3dFiles().some((item) => item.id === requested)
      ) {
        model3dId = requested;
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
          model3dId,
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
      if (!Object.hasOwn(payload, 'model3dId')) {
        normalized.model3dId = previous.model3dId ?? null;
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
    const typeNames = getDictionaryItems('sensor-type').map(
      (item) => item.name,
    );
    const statusNames = getDictionaryItems('sensor-status').map(
      (item) => item.name,
    );
    const currentStatus = findSensorStatusName(statusNames, 'current');
    const alternateStatus = findSensorStatusName(statusNames, 'alternate');
    const disabledStatus = findSensorStatusName(statusNames, 'disabled');
    if (!currentStatus || !alternateStatus || !disabledStatus) {
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
    if (
      !isSensorStatus(alternate.status, 'alternate') ||
      !isSensorStatus(current.status, 'current')
    ) {
      return { ok: false, reason: 'validation' };
    }

    const snapshot = cloneStore(store);
    const replacedAt = formatLocalDate(new Date());
    // 备选沿用现用已挂上的型录 / 3D；现用没挂的保留备选自己的。停用的现用保持原链接。
    const nextAlt = normalizeSensorItems(
      [
        {
          ...alternate,
          status: currentStatus,
          replacesId: curId,
          problemNote: note,
          replacedAt,
          sopId: current.sopId != null ? current.sopId : alternate.sopId,
          model3dId:
            current.model3dId != null ? current.model3dId : alternate.model3dId,
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
          status: disabledStatus,
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
    const current = items[index];
    if (current && sensorCurrentGuardsAlternates(items, current)) {
      return { ok: false, reason: 'not-empty', message: SENSOR_HAS_ALTERNATES };
    }
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

  function getSensorSopFiles(): SensorSopFileItem[] {
    const key = keyFor('sensor-sop-file', 'all');
    if (!Array.isArray(store[key])) {
      store[key] = [];
    }
    store[key] = normalizeSensorSops(store[key]);
    return store[key] as SensorSopFileItem[];
  }

  function saveSensorSopFile(
    payload: Partial<SensorSopFileItem>,
    editId?: number,
  ): SaveResult<SensorSopFileItem> {
    const items = getSensorSopFiles();
    const title = storedText(payload.title).trim().slice(0, 80);
    const fileName = storedText(payload.fileName).trim().slice(0, 200);
    const mimeType = storedText(payload.mimeType).trim().slice(0, 120);
    const dataUrl = storedText(payload.dataUrl);
    const size = Number(payload.size);
    const uploadedAt =
      storedText(payload.uploadedAt).trim() || formatLocalDate(new Date());

    if (!title || !fileName || !isStoredFileSource(dataUrl)) {
      return { ok: false, reason: 'validation' };
    }
    if (detectControlledFileKind(fileName, mimeType) !== 'pdf') {
      return { ok: false, reason: 'type' };
    }
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
    ])[0] as SensorSopFileItem | undefined;
    if (!item) return { ok: false, reason: 'validation' };

    if (editId) {
      const index = items.findIndex((row) => row.id === editId);
      if (index === -1) return { ok: false, reason: 'stale' };
      items.splice(index, 1, item);
    } else {
      items.push(item);
    }
    store[keyFor('sensor-sop-file', 'all')] = normalizeSensorSops(items);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item };
  }

  function deleteSensorSopFile(id: number): DeleteResult {
    const items = getSensorSopFiles();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };

    const snapshot = cloneStore(store);
    items.splice(index, 1);
    store[keyFor('sensor-sop-file', 'all')] = normalizeSensorSops(items);
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

    if (!title || !fileName || !isStoredFileSource(dataUrl)) {
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

  function getSensor3dFiles(): Sensor3dFileItem[] {
    const key = keyFor('sensor-3d', 'all');
    if (!Array.isArray(store[key])) {
      store[key] = [];
    }
    store[key] = normalizeSensor3dFiles(store[key]);
    return store[key] as Sensor3dFileItem[];
  }

  function saveSensor3dFile(
    payload: Partial<Sensor3dFileItem>,
    editId?: number,
  ): SaveResult<Sensor3dFileItem> {
    const items = getSensor3dFiles();
    const title = storedText(payload.title).trim().slice(0, 80);
    const fileName = storedText(payload.fileName).trim().slice(0, 200);
    const mimeType = storedText(payload.mimeType).trim().slice(0, 120);
    const dataUrl = storedText(payload.dataUrl);
    const size = Number(payload.size);
    const uploadedAt =
      storedText(payload.uploadedAt).trim() || formatLocalDate(new Date());

    if (!title || !fileName || !isStoredFileSource(dataUrl)) {
      return { ok: false, reason: 'validation' };
    }
    const check = validateSensor3dUpload(fileName, mimeType, size);
    if (!check.ok) return { ok: false, reason: check.reason };

    const snapshot = cloneStore(store);
    const item = normalizeSensor3dFiles([
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
    store[keyFor('sensor-3d', 'all')] = normalizeSensor3dFiles(items);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item };
  }

  function deleteSensor3dFile(id: number): DeleteResult {
    const items = getSensor3dFiles();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    if (getSensors().some((item) => item.model3dId === id)) {
      return { ok: false, reason: 'in-use' };
    }

    const snapshot = cloneStore(store);
    items.splice(index, 1);
    store[keyFor('sensor-3d', 'all')] = normalizeSensor3dFiles(items);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getProcessSteps(): ProcessStepItem[] {
    return cachedRead('process-steps', readProcessSteps);
  }

  function readProcessSteps(): ProcessStepItem[] {
    const key = keyFor('process-steps', 'all');
    if (!Array.isArray(store[key])) {
      store[key] = demoData ? createProcessStepDefaults() : [];
    }
    store[key] = normalizeProcessSteps(store[key]);
    if (demoData && store[key].length === 0) {
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
    forEachPersistedMachineStructureRows((rows) => {
      let changed = false;
      for (const row of rows) {
        if (row.processStepId !== id) continue;
        row.processStepId = null;
        changed = true;
      }
      return changed;
    });
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function generalStructureLabelsKey() {
    return keyFor('general-structure-labels', 'all');
  }

  function getGeneralStructureLabelMap(): Record<number, string> {
    const key = generalStructureLabelsKey();
    const map: Record<number, string> = demoData
      ? { ...GENERAL_STRUCTURE_SECTION_LABELS }
      : {};
    if (!Array.isArray(store[key])) {
      store[key] = demoData
        ? Object.entries(GENERAL_STRUCTURE_SECTION_LABELS).map(
            ([id, name]) => ({ id: Number(id), name }),
          )
        : [];
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
      store[key] = demoData
        ? MACHINE_SECTION_SEED.map((item) => ({ ...item }))
        : [];
    }
    store[key] = normalizeMachineSections(store[key], { allowNotes: true });
    if (demoData && store[key].length === 0) {
      store[key] = normalizeMachineSections(
        MACHINE_SECTION_SEED.map((item) => ({ ...item })),
        { allowNotes: true },
      );
    }

    if (!demoData) return store[key] as MachineSectionItem[];

    const mistakenNames: Record<number, string> = {
      1: '标准输送段',
      2: '六轴机械手',
      3: '台车系统',
    };
    // 读取路径只在内存里修正，不写后端：访客/只读用户也会走到这里，写入会被
    // 401/403 拒绝并把整个会话标成失效。修正结果随下一次真实保存一并同步。
    store[key] = (store[key] as MachineSectionItem[]).map((item) => {
      const seed = MACHINE_SECTION_SEED.find((entry) => entry.id === item.id);
      if (!seed || seed.kind !== 'structure') return item;
      if (item.name === mistakenNames[item.id] && item.name !== seed.name) {
        return { ...item, name: seed.name };
      }
      return item;
    });
    store[key] = normalizeMachineSections(store[key], { allowNotes: true });
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
    const saved = (
      store[keyFor('machine-global-sections', 'all')] as MachineSectionItem[]
    ).find((item) => item.name === name);
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
      for (const machineName of [
        ...group.items,
        ...(group.configurations ?? []).flatMap((item) => item.items),
      ]) {
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
      allowNotes: true,
    }).map((item) => ({ ...item, locked: undefined, scope: 'machine' }));
    return store[key] as MachineSectionItem[];
  }

  function nextExtraMachineSectionId(machineName: string): number {
    const used = new Set([
      ...getExtraMachineSections(machineName).map((item) => item.id),
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
      const kind = payload.kind === 'notes' ? 'notes' : 'structure';
      if (
        kind !== existing.kind &&
        (getMachineSectionRows(editId, machineName).length > 0 ||
          getMachineSectionImages(editId, machineName).length > 0)
      ) {
        return { ok: false, reason: 'not-empty' };
      }
      const normalized = normalizeMachineSections(
        [
          {
            id: editId,
            name,
            sort: Number.isFinite(sort) ? sort : existing.sort,
            kind,
            scope: 'machine',
          },
        ],
        { allowNotes: true },
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
            kind: payload.kind === 'notes' ? 'notes' : 'structure',
            scope: 'machine',
          },
        ],
        { allowNotes: true },
      )[0];
      if (!normalized) return { ok: false, reason: 'validation' };
      items.push({ ...normalized, scope: 'machine' });
    }

    const key = keyFor('machine-extra-sections', machineName);
    store[key] = normalizeMachineSections(items, { allowNotes: true }).map(
      (item) => ({
        ...item,
        locked: undefined,
        scope: 'machine' as const,
      }),
    );
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    const saved = (store[key] as MachineSectionItem[]).find(
      (item) => item.name === name,
    );
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
      normalizeMachineSections(items, { allowNotes: true }).map((item) => ({
        ...item,
        locked: undefined,
        scope: 'machine' as const,
      }));
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  // ── 机型 Tab ─────────────────────────────────────────────────────
  // Tab 是按目录共用的容器；二级 Tab（页）属于「选单节点 × Tab」。
  // 选单节点的下一层只能二选一：有子选单就不能有二级 Tab，有二级 Tab 就不能再加子选单。
  // 页内容按页 id 存在 machine-section-rows:{页 id}:MACHINE_TAB_PAGE_OWNER，
  // 读写走机型分区同一套函数（sectionId 传页 id、machineName 传所有者位）。

  const machineTabsKey = () => keyFor('machine-tabs', 'all');

  const pageRowsKey = (pageId: number) =>
    machineSectionRowsKey(pageId, MACHINE_TAB_PAGE_OWNER);
  const pageImagesKey = (pageId: number) =>
    machineSectionImagesKey(pageId, MACHINE_TAB_PAGE_OWNER);

  const sameNode = (left: MachineNodeRef, right: MachineNodeRef) =>
    left.category === right.category &&
    left.configuration === right.configuration &&
    left.item === right.item;

  /** 节点所在分组；节点不存在时为 null */
  function machineNodeGroup(node: MachineNodeRef): EntityGroup | null {
    const group = getEntityGroups('machine').find(
      (candidate) => candidate.name === node.category,
    );
    if (!group) return null;
    const configuration = node.configuration
      ? group.configurations?.find((item) => item.name === node.configuration)
      : null;
    if (node.configuration && !configuration) return null;
    if (node.item) {
      const items = configuration ? configuration.items : group.items;
      if (!items.includes(node.item)) return null;
    }
    return group;
  }

  /** 节点下面有没有子选单（配置或机型）；机型节点永远没有 */
  function machineNodeHasChildren(node: MachineNodeRef): boolean {
    if (node.item) return false;
    const group = machineNodeGroup(node);
    if (!group) return false;
    if (node.configuration) {
      return (
        (group.configurations?.find((item) => item.name === node.configuration)
          ?.items.length ?? 0) > 0
      );
    }
    return group.items.length > 0 || (group.configurations?.length ?? 0) > 0;
  }

  /** 节点在任一 Tab 下有没有二级 Tab；只读，Tab 列表还没建立时不写 store */
  function machineNodeHasPages(node: MachineNodeRef): boolean {
    if (!Array.isArray(store[machineTabsKey()])) return false;
    return getMachineTabs().some((tab) =>
      tab.pages.some((page) => sameNode(page.node, node)),
    );
  }

  /** 改名 / 移动选单节点时，让二级 Tab 跟着走 */
  function remapPageNodes(
    matches: (node: MachineNodeRef) => boolean,
    remap: (node: MachineNodeRef) => MachineNodeRef,
  ) {
    if (!Array.isArray(store[machineTabsKey()])) return;
    writeMachineTabs(
      getMachineTabs().map((tab) => ({
        ...tab,
        pages: tab.pages.map((page) =>
          matches(page.node) ? { ...page, node: remap(page.node) } : page,
        ),
      })),
    );
  }

  /**
   * 旧格式：Tab 里记的是机型名（machines），内容在机型的 1000 分区。
   * 读出时转成同名的二级 Tab，内容搬到页下面。
   * 只改内存，随下一次写入一并提交；转换结果是确定的，提交前重复读也一样。
   */
  function migrateLegacyTabMembers(source: unknown[]): unknown[] {
    if (
      !source.some(
        (tab) => isRecord(tab) && Array.isArray(tab.machines) && !tab.pages,
      )
    ) {
      return source;
    }
    let nextPageId =
      Math.max(
        0,
        ...source.flatMap((tab) =>
          isRecord(tab) && Array.isArray(tab.pages)
            ? tab.pages.map((page) => Number(isRecord(page) ? page.id : 0) || 0)
            : [],
        ),
      ) + 1;
    const removals: string[] = [];
    const migrated = source.map((tab) => {
      if (!isRecord(tab) || !Array.isArray(tab.machines) || tab.pages) {
        return tab;
      }
      const { machines, ...rest } = tab;
      const pages = (machines as unknown[]).map((machine) => {
        const name = storedText(machine).trim();
        const page = { id: nextPageId, name };
        nextPageId += 1;
        const rowsKey = machineSectionRowsKey(MACHINE_CONTENT_SECTION_ID, name);
        const imagesKey = machineSectionImagesKey(
          MACHINE_CONTENT_SECTION_ID,
          name,
        );
        if (Object.hasOwn(store, rowsKey)) {
          store[pageRowsKey(page.id)] = store[rowsKey];
          removals.push(rowsKey);
        }
        if (Object.hasOwn(store, imagesKey)) {
          store[pageImagesKey(page.id)] = store[imagesKey];
          removals.push(imagesKey);
        }
        return page;
      });
      return { ...rest, pages };
    });
    if (removals.length) store = omitStoreKeys(store, removals);
    return migrated;
  }

  /**
   * 还没归属节点的二级 Tab（旧数据）：挂到本目录里同名的机型节点上，
   * 成为该机型在这个 Tab 下的直属表格；找不到同名机型的留着不显示。
   */
  function assignLegacyPageNodes(tabs: MachineTab[]) {
    if (!tabs.some((tab) => tab.pages.some((page) => !page.node.category))) {
      return;
    }
    const groups = getEntityGroups('machine');
    for (const tab of tabs) {
      for (const page of tab.pages) {
        if (page.node.category) continue;
        for (const group of groups) {
          if (machineCatalogKind(group) !== tab.catalog) continue;
          if (group.items.includes(page.name)) {
            page.node = {
              category: group.name,
              configuration: null,
              item: page.name,
            };
            page.name = tab.name;
            page.direct = true;
            break;
          }
          const configuration = group.configurations?.find((item) =>
            item.items.includes(page.name),
          );
          if (configuration) {
            page.node = {
              category: group.name,
              configuration: configuration.name,
              item: page.name,
            };
            page.name = tab.name;
            page.direct = true;
            break;
          }
        }
      }
    }
  }

  function getMachineTabs(catalog?: MachineCatalogKind): MachineTab[] {
    const key = machineTabsKey();
    const source = Array.isArray(store[key]) ? store[key] : [];
    // 迁移可能换掉 store 对象，先算出结果再写回
    const tabs = normalizeMachineTabs(migrateLegacyTabMembers(source));
    assignLegacyPageNodes(tabs);
    store[key] = tabs;
    return catalog ? tabs.filter((tab) => tab.catalog === catalog) : tabs;
  }

  function findMachineTabPage(pageId: number) {
    for (const tab of getMachineTabs()) {
      const page = tab.pages.find((item) => item.id === pageId);
      if (page) return { tab, page };
    }
    return null;
  }

  function pageHasContent(pageId: number): boolean {
    return (
      getMachineSectionRows(pageId, MACHINE_TAB_PAGE_OWNER).length > 0 ||
      getMachineSectionImages(pageId, MACHINE_TAB_PAGE_OWNER).length > 0
    );
  }

  function machineHasContent(machineName: string): boolean {
    return (
      getMachineSectionRows(MACHINE_CONTENT_SECTION_ID, machineName).length >
        0 ||
      getMachineSectionImages(MACHINE_CONTENT_SECTION_ID, machineName).length >
        0
    );
  }

  function writeMachineTabs(tabs: MachineTab[]) {
    const normalized = normalizeMachineTabs(tabs);
    store[machineTabsKey()] = normalized;
    // 归一化会丢掉不再合法的页（如机型上的旧二级 Tab），它们的内容一并删掉
    const pageIds = new Set(
      normalized.flatMap((tab) => tab.pages.map((page) => page.id)),
    );
    const owner = `:${MACHINE_TAB_PAGE_OWNER}`;
    const orphans = Object.keys(store).filter((key) => {
      if (!key.endsWith(owner)) return false;
      const match = /^machine-section-(?:rows|images):(\d+):/.exec(key);
      return Boolean(match) && !pageIds.has(Number(match![1]));
    });
    if (orphans.length) store = omitStoreKeys(store, orphans);
  }

  function dropPageContent(pageIds: number[]) {
    store = omitStoreKeys(
      store,
      pageIds.flatMap((id) => [pageRowsKey(id), pageImagesKey(id)]),
    );
  }

  function saveMachineTab(
    catalog: MachineCatalogKind,
    payload: Partial<Pick<MachineTab, 'kind' | 'name' | 'sort'>>,
    editId?: number,
  ): SaveResult<MachineTab> {
    const tabs = getMachineTabs();
    const name = storedText(payload.name).trim().slice(0, 40);
    if (!name) return { ok: false, reason: 'validation' };
    if (
      tabs.some(
        (tab) =>
          tab.catalog === catalog &&
          tab.id !== editId &&
          sameLocaleName(tab.name, name),
      )
    ) {
      return { ok: false, reason: 'duplicate' };
    }
    const kind = payload.kind === 'notes' ? 'notes' : 'structure';
    const sort = Number(payload.sort);
    const snapshot = cloneStore(store);
    let saved: MachineTab;
    if (editId) {
      const existing = tabs.find((tab) => tab.id === editId);
      if (!existing) return { ok: false, reason: 'stale' };
      // 换类型会改变 Tab 下各页内容的格式，有内容时不允许
      if (
        kind !== existing.kind &&
        existing.pages.some((page) => pageHasContent(page.id))
      ) {
        return { ok: false, reason: 'not-empty' };
      }
      saved = {
        ...existing,
        name,
        kind,
        sort: Number.isFinite(sort) ? sort : existing.sort,
      };
      tabs.splice(tabs.indexOf(existing), 1, saved);
    } else {
      saved = {
        id: nextAvailableId(tabs),
        catalog,
        name,
        kind,
        sort: Number.isFinite(sort)
          ? sort
          : tabs.filter((tab) => tab.catalog === catalog).length + 1,
        pages: [],
      };
      tabs.push(saved);
    }
    writeMachineTabs(tabs);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: saved };
  }

  /** 删除 Tab：连同它下面所有节点的二级 Tab 和内容 */
  function deleteMachineTab(id: number): DeleteResult {
    const tabs = getMachineTabs();
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    const snapshot = cloneStore(store);
    const [removed] = tabs.splice(index, 1);
    writeMachineTabs(tabs);
    dropPageContent(removed!.pages.map((page) => page.id));
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  /**
   * 新建（传 node、不传 editId）或改名二级 Tab；新页排在最后。
   * 节点下已有子选单时不能新建（not-empty）；节点必须属于 Tab 所在的目录。
   */
  function saveMachineTabPage(
    tabId: number,
    payload: { name?: string; node?: MachineNodeRef },
    editId?: number,
  ): SaveResult<MachineTabPage> {
    const tabs = getMachineTabs();
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return { ok: false, reason: 'stale' };
    const name = storedText(payload.name).trim().slice(0, 40);
    if (!name) return { ok: false, reason: 'validation' };
    const existing = editId
      ? tab.pages.find((page) => page.id === editId)
      : undefined;
    if (editId && !existing) return { ok: false, reason: 'stale' };
    const node = existing?.node ?? normalizeMachineNodeRef(payload.node);
    if (!existing) {
      const group = machineNodeGroup(node);
      if (!node.category || !group) return { ok: false, reason: 'stale' };
      if (machineCatalogKind(group) !== tab.catalog) {
        return { ok: false, reason: 'validation' };
      }
      if (machineNodeHasChildren(node)) {
        return { ok: false, reason: 'not-empty' };
      }
      // 机型没有二级 Tab，内容在直属表格里（ensureMachineDirectPage）
      if (node.item) return { ok: false, reason: 'validation' };
    }
    if (existing?.direct) return { ok: false, reason: 'validation' };
    if (
      tab.pages.some(
        (page) =>
          page.id !== editId &&
          sameNode(page.node, node) &&
          sameLocaleName(page.name, name),
      )
    ) {
      return { ok: false, reason: 'duplicate' };
    }
    const snapshot = cloneStore(store);
    let saved: MachineTabPage;
    if (existing) {
      saved = { ...existing, name };
      tab.pages.splice(tab.pages.indexOf(existing), 1, saved);
    } else {
      saved = {
        id: nextAvailableId(tabs.flatMap((item) => item.pages)),
        name,
        node,
      };
      tab.pages.push(saved);
    }
    writeMachineTabs(tabs);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: saved };
  }

  /**
   * 机型在一级 Tab 下的直属表格：已有就返回，没有就新建（名称同一级 Tab）。
   * 第一次往表格里写内容前调用，浏览时不建。只有机型节点有直属表格。
   */
  function ensureMachineDirectPage(
    tabId: number,
    node: MachineNodeRef,
  ): SaveResult<MachineTabPage> {
    const tabs = getMachineTabs();
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return { ok: false, reason: 'stale' };
    const target = normalizeMachineNodeRef(node);
    if (!target.item) return { ok: false, reason: 'validation' };
    const group = machineNodeGroup(target);
    if (!group) return { ok: false, reason: 'stale' };
    if (machineCatalogKind(group) !== tab.catalog) {
      return { ok: false, reason: 'validation' };
    }
    const existing = tab.pages.find(
      (page) => page.direct && sameNode(page.node, target),
    );
    if (existing) return { ok: true, item: existing };
    const snapshot = cloneStore(store);
    const saved: MachineTabPage = {
      id: nextAvailableId(tabs.flatMap((item) => item.pages)),
      name: tab.name,
      node: target,
      direct: true,
    };
    tab.pages.push(saved);
    writeMachineTabs(tabs);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: saved };
  }

  /**
   * 机型在一级 Tab 下新增记录：直属表格还没有时先建，和记录在同一个事务里提交；
   * 记录不合法时整体回滚，不留下空表格。
   */
  function saveMachineDirectRow(
    tabId: number,
    node: MachineNodeRef,
    payload: Partial<MachineSectionRow> & Record<string, unknown>,
  ): SaveResult<MachineSectionRow> {
    return transaction(() => {
      const page = ensureMachineDirectPage(tabId, node);
      if (!page.ok) return page;
      return saveMachineSectionRow(
        page.item.id,
        MACHINE_TAB_PAGE_OWNER,
        payload,
      );
    });
  }

  /** 删除二级 Tab：连同它的内容 */
  function deleteMachineTabPage(tabId: number, pageId: number): DeleteResult {
    const tabs = getMachineTabs();
    const tab = tabs.find((item) => item.id === tabId);
    const index = tab?.pages.findIndex((page) => page.id === pageId) ?? -1;
    if (!tab || index === -1) return { ok: false, reason: 'stale' };
    const snapshot = cloneStore(store);
    tab.pages.splice(index, 1);
    writeMachineTabs(tabs);
    dropPageContent([pageId]);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  /** 在同一节点的二级 Tab 里左移（-1）/ 右移（1）；已在最左 / 最右时不能再移 */
  function moveMachineTabPage(
    tabId: number,
    pageId: number,
    offset: -1 | 1,
  ): DeleteResult {
    const tabs = getMachineTabs();
    const tab = tabs.find((item) => item.id === tabId);
    const page = tab?.pages.find((item) => item.id === pageId);
    if (!tab || !page) return { ok: false, reason: 'stale' };
    const siblings = tab.pages.filter((item) => sameNode(item.node, page.node));
    const neighbour = siblings[siblings.indexOf(page) + offset];
    if (!neighbour) return { ok: false, reason: 'validation' };
    const snapshot = cloneStore(store);
    const from = tab.pages.indexOf(page);
    const to = tab.pages.indexOf(neighbour);
    tab.pages[from] = neighbour;
    tab.pages[to] = page;
    writeMachineTabs(tabs);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function sectionAllowsImage(sectionId: number, machineName: string): boolean {
    const numericId = Number(sectionId);
    if (machineName === MACHINE_TAB_PAGE_OWNER) {
      return findMachineTabPage(numericId)?.tab.kind !== 'notes';
    }
    // 目录树里机型自己的内容是结构选型表
    if (numericId === MACHINE_CONTENT_SECTION_ID) return true;
    const localSection = getExtraMachineSections(machineName).find(
      (item) => item.id === numericId,
    );
    if (localSection) return localSection.kind === 'structure';
    const legacySection = getGlobalMachineSections().find(
      (item) => item.id === numericId,
    );
    return legacySection?.kind !== 'notes';
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
      allowImage: sectionAllowsImage(numericId, machineName),
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
    const allowImage = sectionAllowsImage(numericId, machineName);
    store[key] = normalizeMachineSectionRows(
      Array.isArray(store[key]) ? store[key] : [],
      {
        allowImage,
        boardCharacteristicItems: getDictionaryItems('board-characteristic'),
        machineModelItems: getDictionaryItems('machine-model'),
        processStepItems: getProcessSteps(),
        sensorItems: getSensors(),
      },
    );
    const rows = store[key] as MachineSectionRow[];
    if (allowImage) adoptSectionImages(numericId, machineName, rows);
    return rows;
  }

  /**
   * 旧的分区示意图（右侧示意图栏，最多 2 张）挂到记录上：第一张给全部记录
   * （相邻同图合并成一格），有第二张且不止一条记录时给最后一条。记录已经有
   * 示意图时不再覆盖。只改内存，随下一次写入提交；还没有记录时先留着。
   */
  function adoptSectionImages(
    sectionId: number,
    machineName: string,
    rows: MachineSectionRow[],
  ) {
    const imagesKey = machineSectionImagesKey(sectionId, machineName);
    const legacy = store[imagesKey];
    if (!Array.isArray(legacy) || legacy.length === 0 || rows.length === 0) {
      return;
    }
    const [first, second] = normalizeMachineSectionImages(legacy);
    if (first && !rows.some((row) => row.image)) {
      rows.forEach((row) => {
        row.image = first;
      });
      if (second && rows.length > 1) rows[rows.length - 1]!.image = second;
    }
    store[imagesKey] = [];
  }

  /** 一次给多条记录设（image）或清（null）示意图；「沿用上一笔的图」就是同一张图 */
  function saveMachineRowsImage(
    sectionId: number,
    machineName: string,
    rowIds: readonly number[],
    image: MachineRowImage | null,
  ): DeleteResult {
    const numericId = Number(sectionId);
    if (!sectionAllowsImage(numericId, machineName)) {
      return { ok: false, reason: 'validation' };
    }
    let normalized: MachineRowImage | null = null;
    if (image) {
      if (
        !validateMachineRowImage(image.fileName, image.mimeType, image.size).ok
      ) {
        return { ok: false, reason: 'validation' };
      }
      normalized = normalizeMachineRowImage(image);
      if (!normalized) return { ok: false, reason: 'validation' };
    }
    const rows = getMachineSectionRows(numericId, machineName);
    const targets = rowIds.map((id) => rows.find((row) => row.id === id));
    if (targets.length === 0 || targets.some((row) => !row)) {
      return { ok: false, reason: 'stale' };
    }
    const snapshot = cloneStore(store);
    for (const row of targets) {
      if (normalized) row!.image = normalized;
      else delete row!.image;
    }
    store[machineSectionRowsKey(numericId, machineName)] = rows;
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getMachineSectionImages(
    sectionId: number,
    machineName: string,
  ): MachineRowImage[] {
    const numericId = Number(sectionId);
    if (!sectionAllowsImage(numericId, machineName)) return [];
    const key = machineSectionImagesKey(numericId, machineName);
    if (!Object.hasOwn(store, key)) return [];
    store[key] = normalizeMachineSectionImages(store[key]);
    return store[key] as MachineRowImage[];
  }

  function saveMachineSectionImages(
    sectionId: number,
    machineName: string,
    images: MachineRowImage[],
  ): SaveResult<{ items: MachineRowImage[] }> {
    const numericId = Number(sectionId);
    if (!sectionAllowsImage(numericId, machineName)) {
      return { ok: false, reason: 'validation' };
    }
    const normalized = normalizeMachineSectionImages(images);
    if (normalized.length !== (Array.isArray(images) ? images.length : 0)) {
      return { ok: false, reason: 'validation' };
    }
    const currentCount = getMachineSectionImages(numericId, machineName).length;
    if (
      normalized.length > currentCount &&
      getMachineSectionRows(numericId, machineName).length === 0
    ) {
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
    const allowImage = sectionAllowsImage(numericId, machineName);
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
      const rawProcessStepId = payload.processStepId as unknown;
      const processStepId =
        rawProcessStepId === null ||
        rawProcessStepId === undefined ||
        rawProcessStepId === ''
          ? null
          : Number(rawProcessStepId);
      if (
        processStepId !== null &&
        (!Number.isSafeInteger(processStepId) || processStepId <= 0)
      ) {
        return { ok: false, reason: 'validation' };
      }
      if (
        processStepId !== null &&
        !getProcessSteps().some((item) => item.id === processStepId)
      ) {
        return { ok: false, reason: 'stale' };
      }
      const dictionaryBinding = (
        field: 'machineModelId' | 'boardCharacteristicId',
        code: 'machine-model' | 'board-characteristic',
      ) => {
        const rawValue = payload[field] as unknown;
        if (rawValue === null || rawValue === undefined || rawValue === '') {
          return { ok: true as const, value: null };
        }
        const value = Number(rawValue);
        if (!Number.isSafeInteger(value) || value <= 0) {
          return { ok: false as const, reason: 'validation' as const };
        }
        if (!getDictionaryItems(code).some((item) => item.id === value)) {
          return { ok: false as const, reason: 'stale' as const };
        }
        return { ok: true as const, value };
      };
      const machineModel = dictionaryBinding('machineModelId', 'machine-model');
      if (!machineModel.ok) return machineModel;
      const boardCharacteristic = dictionaryBinding(
        'boardCharacteristicId',
        'board-characteristic',
      );
      if (!boardCharacteristic.ok) return boardCharacteristic;
      nextPayload = {
        ...payload,
        machineModelId: machineModel.value,
        processStepId,
        boardCharacteristicId: boardCharacteristic.value,
        sensorIds,
      };
    } else {
      const name = storedText(payload.name).trim();
      if (!role || !name) return { ok: false, reason: 'validation' };
      nextPayload = {
        ...payload,
        machineModelId: null,
        processStepId: null,
        boardCharacteristicId: null,
      };
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
      machineModelId:
        allowImage && typeof nextPayload.machineModelId === 'number'
          ? nextPayload.machineModelId
          : null,
      processStepId:
        allowImage && typeof nextPayload.processStepId === 'number'
          ? nextPayload.processStepId
          : null,
      boardCharacteristicId:
        allowImage && typeof nextPayload.boardCharacteristicId === 'number'
          ? nextPayload.boardCharacteristicId
          : null,
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
      boardCharacteristicItems: getDictionaryItems('board-characteristic'),
      machineModelItems: getDictionaryItems('machine-model'),
      processStepItems: getProcessSteps(),
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
        boardCharacteristicItems: getDictionaryItems('board-characteristic'),
        machineModelItems: getDictionaryItems('machine-model'),
        processStepItems: getProcessSteps(),
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
        allowImage: sectionAllowsImage(numericId, machineName),
        boardCharacteristicItems: getDictionaryItems('board-characteristic'),
        machineModelItems: getDictionaryItems('machine-model'),
        processStepItems: getProcessSteps(),
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
        demoData && listId === 'customer-sop'
          ? createDefaultControlledDocuments()
          : [];
    }
    const allowedKinds =
      listId === 'process-intro'
        ? PROCESS_INTRO_FILE_KINDS
        : CONTROLLED_FILE_KINDS;
    store[key] = normalizeControlledDocuments(store[key], allowedKinds);
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
    const allowedKinds =
      listId === 'process-intro'
        ? PROCESS_INTRO_FILE_KINDS
        : CONTROLLED_FILE_KINDS;
    const kind = detectControlledFileKind(
      attachment.fileName,
      attachment.mimeType,
      allowedKinds,
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
      !isStoredFileSource(dataUrl) ||
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
    return cachedRead(`dict:${code}`, () => readDictionaryItems(code));
  }

  function readDictionaryItems(code: string): DictionaryItem[] {
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
          : demoData
            ? createDictionaryDefaults(code)
            : [];
    }

    store[key] = normalizeDictionaryItems(store[key]);
    if (demoData && store[key].length === 0) {
      store[key] = createDictionaryDefaults(code);
    }

    // 下面两处「停用」修正同样只改内存（原因见 getGlobalMachineSections）。
    if (code === 'sensor-status') {
      const statuses = store[key] as DictionaryItem[];
      const customDisabled = statuses.find(
        (item) => item.name !== '停用' && isSensorStatus(item.name, 'disabled'),
      );
      const plainDisabledIndex = statuses.findIndex(
        (item) => item.name === '停用',
      );
      const sensorCatalog = store[keyFor('sensor-catalog', 'all')];
      const plainDisabledInUse =
        Array.isArray(sensorCatalog) &&
        sensorCatalog.some(
          (item) =>
            item &&
            typeof item === 'object' &&
            (item as Record<string, unknown>).status === '停用',
        );
      if (customDisabled && plainDisabledIndex >= 0 && !plainDisabledInUse) {
        statuses.splice(plainDisabledIndex, 1);
      }
    }

    if (
      code === 'sensor-status' &&
      !(store[key] as DictionaryItem[]).some((item) =>
        isSensorStatus(item.name, 'disabled'),
      )
    ) {
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
    if (definition.machineRowField) {
      for (const [key, value] of Object.entries(store)) {
        if (!key.startsWith('machine-section-rows:') || !Array.isArray(value)) {
          continue;
        }
        store[key] = value.map((row) =>
          row &&
          typeof row === 'object' &&
          (row as Record<string, unknown>)[definition.machineRowField!] === id
            ? { ...row, [definition.machineRowField!]: null }
            : row,
        );
      }
    }
    store[dictionaryStorageKey(code)] = normalizeDictionaryItems(items);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getFeedbackTypes() {
    return getDictionaryItems('customer-feedback');
  }

  function saveFeedbackType(payload: Partial<DictionaryItem>, editId?: number) {
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
      store[key] = demoData ? createEntityGroupDefaults(kind) : [];
    }
    store[key] = normalizeEntityGroups(store[key], kind);
    if (demoData && store[key].length === 0) {
      store[key] = createEntityGroupDefaults(kind);
    }
    return store[key] as EntityGroup[];
  }

  function entityDataKeys(kind: EntityKind, entityName: string): string[] {
    const definition = entityKindDefinition(kind);
    if (!definition) return [];
    if (kind === 'machine') {
      const keys: string[] = [keyFor('machine-extra-sections', entityName)];
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
      if (machineHasContent(entityName)) return true;
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
      return;
    }
    for (const key of entityDataKeys(kind, entityName)) {
      store[key] = [];
    }
  }

  function findEntityLocation(
    groups: EntityGroup[],
    entityName: string,
    category?: string,
    configurationName?: string | null,
  ) {
    for (const group of groups) {
      if (category && group.name !== category) continue;
      if (configurationName) {
        const configuration = group.configurations?.find(
          (item) => item.name === configurationName,
        );
        const configurationIndex =
          configuration?.items.indexOf(entityName) ?? -1;
        if (configuration && configurationIndex !== -1) {
          return {
            group,
            items: configuration.items,
            index: configurationIndex,
            configuration,
          };
        }
        continue;
      }
      const index = group.items.indexOf(entityName);
      if (index !== -1)
        return { group, items: group.items, index, configuration: null };
      for (const configuration of group.configurations ?? []) {
        const configurationIndex = configuration.items.indexOf(entityName);
        if (configurationIndex !== -1) {
          return {
            group,
            items: configuration.items,
            index: configurationIndex,
            configuration,
          };
        }
      }
    }
    return null;
  }

  /**
   * 客户数据名用「客户/区域」拼接，客户名和区域名里不能再有 `/`；
   * 机型名不能和二级 Tab 内容的所有者位重名。
   */
  function validEntityName(kind: EntityKind, name: string) {
    if (kind === 'machine') return name !== MACHINE_TAB_PAGE_OWNER;
    return kind !== 'customer' || !name.includes('/');
  }

  function insertBySort(items: string[], item: string, sort?: number) {
    const requested = Number(sort);
    const index = Number.isInteger(requested)
      ? Math.max(0, Math.min(items.length, requested - 1))
      : items.length;
    items.splice(index, 0, item);
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
    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups, kind);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function reorderEntityItems(
    kind: EntityKind,
    groupName: string,
    oldIndex: number,
    newIndex: number,
    configurationName?: string | null,
  ): ReorderResult {
    if (!entityKindDefinition(kind)) return { ok: false, reason: 'validation' };
    const groups = getEntityGroups(kind);
    const group = groups.find((item) => item.name === groupName);
    if (!group) return { ok: false, reason: 'stale' };
    const items = configurationName
      ? group.configurations?.find((item) => item.name === configurationName)
          ?.items
      : group.items;
    if (!items) return { ok: false, reason: 'stale' };
    if (!validReorderIndex(oldIndex, newIndex, items.length)) {
      return { ok: false, reason: 'validation' };
    }
    if (oldIndex === newIndex) return { ok: true };

    const snapshot = cloneStore(store);
    const [moved] = items.splice(oldIndex, 1);
    if (moved === undefined) return { ok: false, reason: 'stale' };
    items.splice(newIndex, 0, moved);
    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups, kind);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function saveEntityGroup(
    kind: EntityKind,
    payload: {
      name: string;
      sort?: number;
      machineType?: MachineCatalogKind;
    },
    editName?: string,
  ): SaveResult<EntityGroup> {
    if (!entityKindDefinition(kind)) return { ok: false, reason: 'validation' };
    const groups = getEntityGroups(kind);
    const name = storedText(payload.name).trim().slice(0, 40);
    if (!name || !validEntityName(kind, name)) {
      return { ok: false, reason: 'validation' };
    }

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
      groups[index] = {
        name,
        items: [...existing.items],
        ...(kind === 'machine'
          ? {
              machineType:
                payload.machineType ?? existing.machineType ?? 'mechanism',
            }
          : {}),
        ...(existing.configurations
          ? {
              configurations: existing.configurations.map((configuration) => ({
                name: configuration.name,
                items: [...configuration.items],
              })),
            }
          : {}),
      };
      const [moved] = groups.splice(index, 1);
      if (!moved) return { ok: false, reason: 'stale' };
      const requested = Number(payload.sort);
      const targetIndex = Number.isInteger(requested)
        ? Math.max(0, Math.min(groups.length, requested - 1))
        : index;
      groups.splice(targetIndex, 0, moved);
      if (editName !== name && kind === 'machine') {
        remapPageNodes(
          (node) => node.category === editName,
          (node) => ({ ...node, category: name }),
        );
      }
      // 客户改名：其下每个区域的数据键（客户/区域）都要跟着改
      if (editName !== name && kind === 'customer') {
        for (const item of existing.items) {
          migrateEntityDataKeys(
            kind,
            entityDataName(kind, editName, item),
            entityDataName(kind, name, item),
          );
        }
      }
    } else {
      const requested = Number(payload.sort);
      const targetIndex = Number.isInteger(requested)
        ? Math.max(0, Math.min(groups.length, requested - 1))
        : groups.length;
      groups.splice(targetIndex, 0, {
        name,
        items: [],
        ...(kind === 'machine'
          ? { machineType: payload.machineType ?? 'mechanism' }
          : {}),
      });
    }

    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups, kind);
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
    if (
      (groups[index]?.items.length ?? 0) > 0 ||
      (groups[index]?.configurations?.length ?? 0) > 0 ||
      (kind === 'machine' &&
        machineNodeHasPages({
          category: name,
          configuration: null,
          item: null,
        }))
    ) {
      return { ok: false, reason: 'not-empty' };
    }

    const snapshot = cloneStore(store);
    groups.splice(index, 1);
    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups, kind);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function saveMachineConfiguration(
    category: string,
    payload: { name: string; sort?: number },
    editName?: string,
  ): SaveResult<{ category: string; name: string }> {
    const groups = getEntityGroups('machine');
    const group = groups.find((item) => item.name === category);
    const name = storedText(payload.name).trim().slice(0, 40);
    if (!group || !name) return { ok: false, reason: 'validation' };
    group.configurations ??= [];
    if (
      group.configurations.some(
        (item) => item.name !== editName && sameLocaleName(item.name, name),
      )
    ) {
      return { ok: false, reason: 'duplicate' };
    }

    const snapshot = cloneStore(store);
    if (editName) {
      const index = group.configurations.findIndex(
        (item) => item.name === editName,
      );
      if (index === -1) return { ok: false, reason: 'stale' };
      const existing = group.configurations[index];
      if (!existing) return { ok: false, reason: 'stale' };
      const [moved] = group.configurations.splice(index, 1);
      if (!moved) return { ok: false, reason: 'stale' };
      moved.name = name;
      if (editName !== name) {
        remapPageNodes(
          (node) =>
            node.category === category && node.configuration === editName,
          (node) => ({ ...node, configuration: name }),
        );
      }
      const requested = Number(payload.sort);
      const targetIndex = Number.isInteger(requested)
        ? Math.max(0, Math.min(group.configurations.length, requested - 1))
        : index;
      group.configurations.splice(targetIndex, 0, moved);
    } else {
      // 分组已有二级 Tab，下一层就不能再有子选单
      if (machineNodeHasPages({ category, configuration: null, item: null })) {
        return { ok: false, reason: 'not-empty' };
      }
      const requested = Number(payload.sort);
      const targetIndex = Number.isInteger(requested)
        ? Math.max(0, Math.min(group.configurations.length, requested - 1))
        : group.configurations.length;
      group.configurations.splice(targetIndex, 0, { name, items: [] });
    }

    store[entityGroupsKey('machine')] = normalizeEntityGroups(
      groups,
      'machine',
    );
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: { category, name } };
  }

  function deleteMachineConfiguration(
    category: string,
    name: string,
  ): DeleteResult {
    const groups = getEntityGroups('machine');
    const group = groups.find((item) => item.name === category);
    const index =
      group?.configurations?.findIndex((item) => item.name === name) ?? -1;
    if (!group || !group.configurations || index === -1) {
      return { ok: false, reason: 'stale' };
    }
    if (
      (group.configurations[index]?.items.length ?? 0) > 0 ||
      machineNodeHasPages({ category, configuration: name, item: null })
    ) {
      return { ok: false, reason: 'not-empty' };
    }
    const snapshot = cloneStore(store);
    group.configurations.splice(index, 1);
    store[entityGroupsKey('machine')] = normalizeEntityGroups(
      groups,
      'machine',
    );
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function saveEntityItem(
    ...args: Parameters<typeof saveEntityItemSteps>
  ): SaveResult<EntityTreeItem> {
    return transaction(() => saveEntityItemSteps(...args));
  }

  function saveEntityItemSteps(
    kind: EntityKind,
    payload: {
      category: string;
      configuration?: string | null;
      name: string;
      previousCategory?: string;
      previousConfiguration?: string | null;
      sort?: number;
    },
    editName?: string,
  ): SaveResult<EntityTreeItem> {
    const definition = entityKindDefinition(kind);
    if (!definition) return { ok: false, reason: 'validation' };

    const groups = getEntityGroups(kind);
    const name = storedText(payload.name).trim().slice(0, 40);
    const category = storedText(payload.category).trim().slice(0, 40);
    if (!name || !category || !validEntityName(kind, name)) {
      return { ok: false, reason: 'validation' };
    }
    // 区域名在客户之间会重复，编辑时必须指明原来所在的客户
    if (kind === 'customer' && editName && !payload.previousCategory) {
      return { ok: false, reason: 'validation' };
    }

    const targetGroup = groups.find((group) => group.name === category);
    if (!targetGroup) return { ok: false, reason: 'validation' };
    const configuration =
      kind === 'machine'
        ? storedText(payload.configuration).trim().slice(0, 40)
        : '';
    const targetItems = configuration
      ? targetGroup.configurations?.find((item) => item.name === configuration)
          ?.items
      : targetGroup.items;
    if (!targetItems) return { ok: false, reason: 'validation' };

    // 编辑时自己不算重复——但只有留在原分组里才是「自己」；
    // 移到另一个分组时，那里的同名条目就是真重复。
    const sourceCategory = payload.previousCategory ?? category;
    const duplicate = targetItems.some(
      (item) =>
        sameLocaleName(item, name) &&
        !(editName && item === editName && sourceCategory === category),
    );
    if (duplicate) return { ok: false, reason: 'duplicate' };

    const snapshot = cloneStore(store);
    const dataName = entityDataName(kind, category, name);
    const location = editName
      ? findEntityLocation(
          groups,
          editName,
          payload.previousCategory,
          payload.previousConfiguration,
        )
      : null;
    if (editName && !location) return { ok: false, reason: 'stale' };
    // 目标分组 / 配置已有二级 Tab，下一层就不能再有机型（留在原处改名不算）
    const parentNode = {
      category,
      configuration: configuration || null,
      item: null,
    };
    const sameParent =
      location !== null &&
      location.group.name === category &&
      (location.configuration?.name ?? null) === parentNode.configuration;
    if (kind === 'machine' && !sameParent && machineNodeHasPages(parentNode)) {
      return { ok: false, reason: 'not-empty' };
    }
    if (editName && location) {
      if (kind === 'machine') {
        const from = {
          category: location.group.name,
          configuration: location.configuration?.name ?? null,
          item: editName,
        };
        remapPageNodes(
          (node) => sameNode(node, from),
          () => ({ ...parentNode, item: name }),
        );
      }
      location.items.splice(location.index, 1);
      const previousDataName = entityDataName(
        kind,
        location.group.name,
        editName,
      );
      if (previousDataName !== dataName) {
        migrateEntityDataKeys(kind, previousDataName, dataName);
      }
      insertBySort(targetItems, name, payload.sort);
    } else {
      insertBySort(targetItems, name, payload.sort);
      initEmptyEntityData(kind, dataName);
    }

    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups, kind);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };

    if (kind === 'machine' && category === GENERAL_STRUCTURE_CATEGORY) {
      let synced = ensureGeneralStructureSection(name);
      if (editName && editName !== name) {
        synced = syncGeneralStructureItemRename(editName, name);
      }
      if (!synced.ok) return synced;
    }

    return {
      ok: true,
      item: { name, category, configuration: configuration || null },
    };
  }

  function deleteEntityItem(
    ...args: Parameters<typeof deleteEntityItemSteps>
  ): DeleteResult {
    return transaction(() => deleteEntityItemSteps(...args));
  }

  function deleteEntityItemSteps(
    kind: EntityKind,
    name: string,
    category?: string,
    configuration?: string | null,
  ): DeleteResult {
    if (!entityKindDefinition(kind)) return { ok: false, reason: 'validation' };
    // 区域名在客户之间会重复，删除时必须指明客户
    if (kind === 'customer' && !category) {
      return { ok: false, reason: 'validation' };
    }
    const groups = getEntityGroups(kind);
    const location = findEntityLocation(groups, name, category, configuration);
    if (!location) return { ok: false, reason: 'stale' };
    const dataName = entityDataName(kind, location.group.name, name);
    if (entityHasData(kind, dataName)) {
      return { ok: false, reason: 'not-empty' };
    }
    // 机型的直属表格有内容时不能删；空的直属表格随机型一起删掉
    const machineNode: MachineNodeRef = {
      category: location.group.name,
      configuration: location.configuration?.name ?? null,
      item: name,
    };
    const directPageIds =
      kind === 'machine' && Array.isArray(store[machineTabsKey()])
        ? getMachineTabs().flatMap((tab) =>
            tab.pages
              .filter((page) => sameNode(page.node, machineNode))
              .map((page) => page.id),
          )
        : [];
    if (directPageIds.some((id) => pageHasContent(id))) {
      return { ok: false, reason: 'not-empty' };
    }

    const locationCategory = location.group.name;
    const generalBinding =
      kind === 'machine' && locationCategory === GENERAL_STRUCTURE_CATEGORY
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
        for (const machineName of [
          ...group.items,
          ...(group.configurations ?? []).flatMap((item) => item.items),
        ]) {
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
    location.items.splice(location.index, 1);
    clearEntityDataKeys(kind, dataName);
    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups, kind);
    if (directPageIds.length) {
      const removed = new Set(directPageIds);
      writeMachineTabs(
        getMachineTabs().map((tab) => ({
          ...tab,
          pages: tab.pages.filter((page) => !removed.has(page.id)),
        })),
      );
    }
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

  function blankImportCell(value: unknown) {
    const text = storedText(value).trim();
    return text === '—' ? '' : text;
  }

  function rawImportFingerprint(
    values: Partial<Record<SensorImportField, string>>,
  ) {
    return Object.keys(values)
      .sort()
      .map(
        (key) =>
          `${key}\u0000${String(values[key as SensorImportField] ?? '')}`,
      )
      .join('\u0001');
  }

  function sensorImportFailure(result: SaveResult<SensorItem>) {
    if (result.ok) return '';
    if (result.message) return result.message;
    if (result.reason === 'duplicate') return '型号已存在';
    return '数据未通过校验';
  }

  function mergedSensorImport(
    values: Partial<Record<SensorImportField, string>>,
    existing: SensorItem | undefined,
    typeNames: string[],
    statusNames: string[],
  ): { payload: Partial<SensorItem> } | { reason: string } {
    const has = (field: SensorImportField) => Object.hasOwn(values, field);
    const read = (field: SensorImportField, fallback: string) =>
      has(field) ? blankImportCell(values[field]) : fallback;
    const model = blankImportCell(values.model);
    const status = read('status', existing?.status ?? '');
    const sensorType = read('sensorType', existing?.sensorType ?? '');
    if (!model) return { reason: '缺少型号' };
    if (!status) return { reason: '缺少状态' };
    if (!statusNames.includes(status)) return { reason: '状态不在数据字典中' };
    if (!sensorType) return { reason: '缺少感应器类型' };
    if (!typeNames.includes(sensorType)) {
      return { reason: '感应器类型不在数据字典中' };
    }
    return {
      payload: {
        brand: read('brand', existing?.brand ?? ''),
        feature: read('feature', existing?.feature ?? ''),
        model,
        partNumber: read('partNumber', existing?.partNumber ?? ''),
        scene: read('scene', existing?.scene ?? ''),
        sensorType,
        spec: read('spec', existing?.spec ?? ''),
        status,
      },
    };
  }

  function classifySensorImportRows(rows: SensorImportRow[]) {
    const skipped: ImportSkip[] = [];
    const firsts: SensorImportRow[] = [];
    const seen = new Map<string, string>();
    for (const row of rows) {
      const model = blankImportCell(row.values.model);
      if (!model) {
        skipped.push({ reason: '型号为空', rowNumber: row.rowNumber });
        continue;
      }
      const key = model.toLocaleLowerCase('zh-CN');
      const fingerprint = rawImportFingerprint(row.values);
      const previous = seen.get(key);
      if (previous !== undefined) {
        if (previous !== fingerprint) {
          skipped.push({ reason: '型号重复', rowNumber: row.rowNumber });
        }
        continue;
      }
      seen.set(key, fingerprint);
      firsts.push(row);
    }
    return { firsts, skipped };
  }

  function importSensors(input: SensorImportRequest): SensorImportResult {
    if (!input.hasModelColumn) {
      return {
        message: '缺少「型号」列，无法导入',
        ok: false,
        reason: 'validation',
      };
    }
    const classified = classifySensorImportRows(input.rows);
    if (classified.firsts.length === 0) {
      return {
        created: 0,
        ok: true,
        skipped: classified.skipped,
        updated: 0,
      };
    }
    return commitIfChanged(() => {
      // 型号全局唯一（saveSensor 的 duplicate 校验），是导入的匹配键
      const byModel = new Map<string, SensorItem[]>();
      for (const sensor of getSensors()) {
        const key = sensor.model.trim().toLocaleLowerCase('zh-CN');
        if (!key) continue;
        const list = byModel.get(key);
        if (list) list.push(sensor);
        else byModel.set(key, [sensor]);
      }
      const typeNames = getDictionaryItems('sensor-type').map(
        (item) => item.name,
      );
      const statusNames = getDictionaryItems('sensor-status').map(
        (item) => item.name,
      );
      const skipped = [...classified.skipped];
      const actions: {
        existing?: SensorItem;
        payload: Partial<SensorItem>;
        rowNumber: number;
      }[] = [];
      for (const row of classified.firsts) {
        const key = blankImportCell(row.values.model).toLocaleLowerCase(
          'zh-CN',
        );
        const matches = byModel.get(key) ?? [];
        if (matches.length > 1) {
          skipped.push({
            reason: '型号对应多条记录',
            rowNumber: row.rowNumber,
          });
          continue;
        }
        const merged = mergedSensorImport(
          row.values,
          matches[0],
          typeNames,
          statusNames,
        );
        if ('reason' in merged) {
          skipped.push({ reason: merged.reason, rowNumber: row.rowNumber });
          continue;
        }
        actions.push({
          existing: matches[0],
          payload: merged.payload,
          rowNumber: row.rowNumber,
        });
      }
      let created = 0;
      let updated = 0;
      for (const action of actions) {
        // 内容与现有记录完全相同的行不算更新，也不写入
        const existing = action.existing;
        if (
          existing &&
          Object.entries(action.payload).every(
            ([field, value]) => existing[field as keyof SensorItem] === value,
          )
        ) {
          continue;
        }
        const saved = saveSensor(action.payload, action.existing?.id);
        if (!saved.ok) {
          skipped.push({
            reason: sensorImportFailure(saved),
            rowNumber: action.rowNumber,
          });
          continue;
        }
        if (action.existing) updated += 1;
        else created += 1;
      }
      skipped.sort((left, right) => left.rowNumber - right.rowNumber);
      return {
        changed: created + updated > 0,
        result: { created, ok: true, skipped, updated },
      };
    });
  }

  function dictionaryItemReferenced(
    definition: DictionaryDefinition,
    item: DictionaryItem,
  ) {
    const field = definition.field || 'type';
    for (const listId of definition.listIds) {
      const prefix = `${listId}:`;
      for (const [key, value] of Object.entries(store)) {
        if (!key.startsWith(prefix) || !Array.isArray(value)) continue;
        if (
          value.some(
            (row) =>
              isRecord(row) &&
              (row as Record<string, unknown>)[field] === item.name,
          )
        ) {
          return true;
        }
      }
    }
    if (definition.catalog === 'sensor') {
      const sensors = store[keyFor('sensor-catalog', 'all')];
      if (
        Array.isArray(sensors) &&
        sensors.some(
          (row) =>
            isRecord(row) &&
            (row as Record<string, unknown>)[field] === item.name,
        )
      ) {
        return true;
      }
    }
    if (definition.catalog === 'process-step') {
      const steps = store[keyFor('process-steps', 'all')];
      if (
        Array.isArray(steps) &&
        steps.some(
          (row) =>
            isRecord(row) &&
            (row as Record<string, unknown>)[field] === item.name,
        )
      ) {
        return true;
      }
    }
    if (definition.machineRowField) {
      const rowField = definition.machineRowField;
      for (const [key, value] of Object.entries(store)) {
        if (!key.startsWith('machine-section-rows:') || !Array.isArray(value)) {
          continue;
        }
        if (
          value.some(
            (row) => isRecord(row) && row[rowField] === item.id,
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  function importSortValue(sortText: string, rowNumber: number) {
    const text = sortText.trim();
    if (/^-?\d+$/.test(text)) {
      const value = Number(text);
      if (Number.isSafeInteger(value)) return value;
    }
    return rowNumber;
  }

  function restoreDictionarySheet(
    definition: DictionaryDefinition,
    sheet: DictionaryRestoreSheet,
  ) {
    const skipped: { reason: string; rowNumber: number }[] = [];
    if (!sheet.hasNameColumn) {
      return {
        changed: false,
        code: definition.code,
        created: 0,
        deleted: 0,
        kept: 0,
        skipped,
        title: definition.title,
        unchangedReason: '缺少「字典项名称」列',
        updated: 0,
      };
    }

    const items = getDictionaryItems(definition.code).map((item) => ({
      ...item,
    }));
    const accepted: { key: string; name: string; sort: number }[] = [];
    const seen = new Set<string>();
    for (const row of sheet.rows) {
      const name = storedText(row.name).trim().slice(0, 40);
      const sortText = storedText(row.sort).trim();
      if (!name && !sortText) continue;
      if (!name) {
        skipped.push({ reason: '名称为空', rowNumber: row.rowNumber });
        continue;
      }
      const key = name.toLocaleLowerCase('zh-CN');
      if (seen.has(key)) {
        skipped.push({ reason: '名称重复', rowNumber: row.rowNumber });
        continue;
      }
      seen.add(key);
      accepted.push({
        key,
        name,
        sort: importSortValue(sortText, row.rowNumber),
      });
    }

    const used = new Set<number>();
    const next: DictionaryItem[] = [];
    const renames: { from: string; to: string }[] = [];
    let created = 0;
    let updated = 0;
    for (const row of accepted) {
      const existing = items.find(
        (item) =>
          !used.has(item.id) &&
          item.name.toLocaleLowerCase('zh-CN') === row.key,
      );
      if (existing) {
        used.add(existing.id);
        if (existing.name !== row.name) {
          renames.push({ from: existing.name, to: row.name });
        }
        if (existing.name !== row.name || existing.sort !== row.sort) {
          updated += 1;
        }
        next.push({ id: existing.id, name: row.name, sort: row.sort });
      } else {
        created += 1;
        next.push({
          id: nextAvailableId([...items, ...next]),
          name: row.name,
          sort: row.sort,
        });
      }
    }

    let deleted = 0;
    let kept = 0;
    const keptItems: DictionaryItem[] = [];
    for (const item of items) {
      if (used.has(item.id)) continue;
      if (dictionaryItemReferenced(definition, item)) {
        kept += 1;
        keptItems.push(item);
      } else {
        deleted += 1;
      }
    }

    if (
      definition.code === 'sensor-status' &&
      ![...next, ...keptItems].some((item) =>
        isSensorStatus(item.name, 'disabled'),
      )
    ) {
      const plain = items.find(
        (item) =>
          item.name === '停用' &&
          !used.has(item.id) &&
          !keptItems.some((keptItem) => keptItem.id === item.id),
      );
      if (plain) {
        deleted -= 1;
        kept += 1;
        keptItems.push(plain);
      } else {
        kept += 1;
        keptItems.push({
          id: nextAvailableId([...items, ...next, ...keptItems]),
          name: '停用',
          sort: 0,
        });
      }
    }

    let maxSort = next.reduce((max, item) => Math.max(max, item.sort), 0);
    for (const item of keptItems) {
      maxSort += 1;
      next.push({ ...item, sort: maxSort });
    }

    const base = {
      code: definition.code,
      skipped,
      title: definition.title,
    };
    if (next.length === 0) {
      return {
        ...base,
        changed: false,
        created: 0,
        deleted: 0,
        kept: 0,
        unchangedReason: '至少保留一个字典项',
        updated: 0,
      };
    }

    const normalized = normalizeDictionaryItems(next);
    const current = normalizeDictionaryItems(items);
    if (
      renames.length === 0 &&
      JSON.stringify(normalized) === JSON.stringify(current)
    ) {
      return {
        ...base,
        changed: false,
        created: 0,
        deleted: 0,
        kept: 0,
        updated: 0,
      };
    }

    store[dictionaryStorageKey(definition.code)] = normalized;
    for (const rename of renames) {
      renameDictionaryValue(definition, rename.from, rename.to);
    }
    return {
      ...base,
      changed: true,
      created,
      deleted,
      kept,
      updated,
    };
  }

  function restoreDictionaries(
    sheets: DictionaryRestoreSheet[],
  ): DictionaryRestoreResult {
    const usedCodes = new Set<string>();
    const unknownSheets: string[] = [];
    const matched: {
      definition: DictionaryDefinition;
      sheet: DictionaryRestoreSheet;
    }[] = [];
    for (const sheet of sheets) {
      const sheetName = sanitizeExcelSheetName(sheet.name);
      const definition = DICTIONARY_DEFINITIONS.find(
        (item) => sanitizeExcelSheetName(item.title) === sheetName,
      );
      if (!definition || usedCodes.has(definition.code)) {
        unknownSheets.push(sheet.name);
        continue;
      }
      usedCodes.add(definition.code);
      matched.push({ definition, sheet });
    }
    const missingSheets = DICTIONARY_DEFINITIONS.filter(
      (item) => !usedCodes.has(item.code),
    ).map((item) => item.title);

    return commitIfChanged(() => {
      let changed = false;
      const categories = matched.map(({ definition, sheet }) => {
        const restored = restoreDictionarySheet(definition, sheet);
        if (restored.changed) changed = true;
        return {
          code: restored.code,
          created: restored.created,
          deleted: restored.deleted,
          kept: restored.kept,
          skipped: restored.skipped,
          title: restored.title,
          ...(restored.unchangedReason
            ? { unchangedReason: restored.unchangedReason }
            : {}),
          updated: restored.updated,
        };
      });
      return {
        changed,
        result: { categories, missingSheets, ok: true, unknownSheets },
      };
    });
  }

  function replaceFromStorage(rawValue: null | string) {
    store = parsePersistedStore(rawValue);
  }

  function snapshotStore(): PersistedStore {
    return cloneStore(store);
  }

  return {
    batchRead,
    deleteControlledFile,
    deleteCrud,
    deleteDictionaryItem,
    deleteEntityGroup,
    deleteEntityItem,
    deleteExtraMachineSection,
    deleteFeedbackType,
    deleteGlobalMachineSection,
    deleteMachineSectionRow,
    deleteMachineTab,
    ensureMachineDirectPage,
    saveMachineDirectRow,
    deleteMachineTabPage,
    deleteProcessIntroFile,
    deleteProcessStep,
    deleteSensor,
    deleteSensor3dFile,
    deleteSensorSopFile,
    deleteSensorSop,
    deleteMachineConfiguration,
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
    getMachineTabs,
    getProcessIntroFiles,
    getProcessSteps,
    getSensors,
    getSensor3dFiles,
    getSensorSopFiles,
    getSensorSops,
    listResolvedMachineSections,
    moveMachineTabPage,
    replaceFromStorage,
    importSensors,
    restoreDictionaries,
    reorderEntityGroups,
    reorderEntityItems,
    saveControlledFile,
    saveCrud,
    saveDictionaryItem,
    saveEntityGroup,
    saveMachineConfiguration,
    saveEntityItem,
    saveExtraMachineSection,
    saveFeedbackType,
    saveGlobalMachineSection,
    saveMachineSectionRow,
    saveMachineSectionImages,
    saveMachineRowsImage,
    saveMachineTab,
    saveMachineTabPage,
    saveProcessIntroFile,
    saveProcessStep,
    replaceSensorCurrent,
    saveSensor,
    saveSensor3dFile,
    saveSensorSopFile,
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
    demoData: true,
  });
  repo.getEntityGroups('customer');
  repo.getEntityGroups('machine');
  for (const definition of DICTIONARY_DEFINITIONS) {
    repo.getDictionaryItems(definition.code);
  }
  repo.getProcessSteps();
  repo.getProcessIntroFiles();
  repo.getSensors();
  repo.getSensor3dFiles();
  repo.getSensorSopFiles();
  repo.getSensorSops();
  const next = repo.snapshotStore();
  const customerNames = repo
    .getEntityGroups('customer')
    .flatMap((group) =>
      group.items.map((region) =>
        entityDataName('customer', group.name, region),
      ),
    );
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
