import {
  FEEDBACK_STATUS_OPTIONS,
  MACHINE_ROW_IMAGE_RULES,
  createDictionaryDefaults,
} from './seed';
import type {
  ControlledFileAttachment,
  ControlledFileItem,
  CrudRecord,
  DictionaryItem,
  EntityGroup,
  EntityKind,
  FeedbackMeasureHistoryEntry,
  MachineRowImage,
  MachineProcessItem,
  MachineSectionItem,
  MachineSectionRow,
  PersistedStore,
  ProcessStepItem,
  SensorItem,
  Sensor3dFileItem,
  SensorSopItem,
  SensorTypeDefinition,
} from './types';
import { isSensorStatus } from './sensor-status';

export const CONTROLLED_FILE_RULES = {
  pdf: {
    accept: '.pdf,application/pdf',
    extensions: ['.pdf'],
    maxBytes: 8 * 1024 * 1024,
    mimeTypes: ['application/pdf'],
  },
  word: {
    accept:
      '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['.doc', '.docx'],
    maxBytes: 8 * 1024 * 1024,
    mimeTypes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  ppt: {
    accept:
      '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extensions: ['.ppt', '.pptx'],
    maxBytes: 8 * 1024 * 1024,
    mimeTypes: [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
} as const;

type FileKind = keyof typeof CONTROLLED_FILE_RULES;

export const CONTROLLED_FILE_KINDS = [
  'pdf',
  'word',
] as const satisfies readonly FileKind[];
export const PROCESS_INTRO_FILE_KINDS = [
  ...CONTROLLED_FILE_KINDS,
  'ppt',
] as const satisfies readonly FileKind[];

export const CONTROLLED_FILE_ACCEPT = [
  CONTROLLED_FILE_RULES.pdf.accept,
  CONTROLLED_FILE_RULES.word.accept,
].join(',');

export const SENSOR_3D_FILE_RULES = {
  accept: '.pdf,application/pdf',
  extensions: ['.pdf'],
  maxBytes: 8 * 1024 * 1024,
  mimeTypes: ['application/pdf'],
} as const;

function emptyStore(): PersistedStore {
  return Object.create(null) as PersistedStore;
}

export function storedText(value: unknown): string {
  return ['boolean', 'number', 'string'].includes(typeof value)
    ? String(value)
    : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asList(source: unknown): unknown[] {
  return Array.isArray(source) ? source : [];
}

const STORED_FILE_SOURCE =
  /^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/content$/i;

/** 上传前接受 data URL；持久化后接受后端返回的按需文件 URL。 */
export function isStoredFileSource(
  value: string,
  dataPrefix = 'data:',
): boolean {
  return value.startsWith(dataPrefix) || STORED_FILE_SOURCE.test(value);
}

function normalizeFeedbackMeasureHistory(
  item: Record<string, unknown>,
): FeedbackMeasureHistoryEntry[] {
  const latestMeasure = storedText(item.measure);
  const latestDate = storedText(item.date);
  const history = asList(item.measureHistory)
    .filter(isRecord)
    .map((entry) => ({
      measure: storedText(entry.measure),
      date: storedText(entry.date),
      status:
        entry.status === '已作废' ? ('已作废' as const) : ('现行' as const),
    }));

  let currentIndex = -1;
  history.forEach((entry, index) => {
    if (entry.status === '现行') currentIndex = index;
  });
  history.forEach((entry, index) => {
    entry.status = index === currentIndex ? '现行' : '已作废';
  });

  const current = currentIndex >= 0 ? history[currentIndex] : undefined;
  const hasLatestFields =
    Object.hasOwn(item, 'measure') || Object.hasOwn(item, 'date');
  const latestHasContent = Boolean(latestMeasure.trim() || latestDate.trim());
  if (
    current &&
    hasLatestFields &&
    (current.measure !== latestMeasure || current.date !== latestDate)
  ) {
    current.status = '已作废';
    if (latestHasContent) {
      history.push({
        measure: latestMeasure,
        date: latestDate,
        status: '现行',
      });
    }
  } else if (!current && latestHasContent) {
    history.push({
      measure: latestMeasure,
      date: latestDate,
      status: '现行',
    });
  }

  return history;
}

export function nextAvailableId(items: Array<{ id: number }>): number {
  const ids = new Set(items.map((item) => item.id));
  let id = 1;
  while (ids.has(id)) id += 1;
  return id;
}

function allocateId(
  rawId: unknown,
  usedIds: Set<number>,
  nextIdRef: { value: number },
): number {
  let id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) {
    while (usedIds.has(nextIdRef.value)) nextIdRef.value += 1;
    id = nextIdRef.value;
  }
  usedIds.add(id);
  nextIdRef.value = Math.max(nextIdRef.value, id + 1);
  return id;
}

function fileExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index === -1 ? '' : fileName.slice(index).toLowerCase();
}

export function parsePersistedStore(
  rawValue: null | string | undefined,
): PersistedStore {
  if (!rawValue) return emptyStore();
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return emptyStore();
    }
    const store = emptyStore();
    for (const [key, value] of Object.entries(parsed)) {
      if (
        key === '__proto__' ||
        key === 'prototype' ||
        key === 'constructor' ||
        !Array.isArray(value)
      ) {
        continue;
      }
      store[key] = value;
    }
    return store;
  } catch {
    return emptyStore();
  }
}

export function normalizeCrudItems(
  listId: string,
  sourceItems: unknown,
): CrudRecord[] {
  const usedIds = new Set<number>();
  const nextIdRef = { value: 1 };
  return asList(sourceItems)
    .filter(isRecord)
    .map((item) => {
      const id = allocateId(item.id, usedIds, nextIdRef);

      if (listId === 'customer-feedback') {
        const statusAliases: Record<string, string> = {
          pending: FEEDBACK_STATUS_OPTIONS[0] || '01 待处理',
          processing: FEEDBACK_STATUS_OPTIONS[1] || '02 处理中',
          testing: FEEDBACK_STATUS_OPTIONS[2] || '03 测试中',
          resolved: FEEDBACK_STATUS_OPTIONS[3] || '04 已解决',
        };
        const rawStatus = storedText(item.status).trim();
        const status =
          statusAliases[rawStatus] ||
          rawStatus ||
          createDictionaryDefaults('customer-feedback-status')[0]?.name ||
          '待处理';
        const type =
          storedText(item.type).trim() ||
          createDictionaryDefaults('customer-feedback')[0]?.name ||
          '';
        const measureHistory = normalizeFeedbackMeasureHistory(item);
        const currentMeasure = [...measureHistory]
          .reverse()
          .find((entry) => entry.status === '现行');
        return {
          id,
          type,
          machine: storedText(item.machine),
          problem: storedText(item.problem),
          measure: currentMeasure?.measure ?? '',
          date: currentMeasure?.date ?? '',
          status,
          measureHistory,
        };
      }

      if (listId === 'customer-req') {
        const type =
          storedText(item.type).trim() ||
          createDictionaryDefaults('customer-req')[0]?.name ||
          '';
        const source =
          storedText(item.source).trim() ||
          createDictionaryDefaults('customer-req-source')[0]?.name ||
          '';
        return {
          id,
          type,
          machine: storedText(item.machine),
          process: storedText(item.process),
          content: storedText(item.content),
          source,
          note: storedText(item.note),
        };
      }

      if (listId === 'customer-proc') {
        const type =
          storedText(item.type).trim() ||
          createDictionaryDefaults('customer-proc')[0]?.name ||
          '';
        return {
          id,
          type,
          role: storedText(item.role),
          feature: storedText(item.feature),
          sensorNote: storedText(item.sensorNote),
          note: storedText(item.note),
        };
      }

      return {
        id,
        type: storedText(item.type),
        name: storedText(item.name),
        desc: storedText(item.desc),
        note: storedText(item.note),
      };
    });
}

function optionalPositiveId(value: unknown): null | number {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function normalizeSensorItems(
  sourceItems: unknown,
  allowedTypes: string[] = [],
  allowedStatuses: string[] = [],
): SensorItem[] {
  const typeNames = Array.isArray(allowedTypes)
    ? allowedTypes.filter(Boolean)
    : [];
  const statusNames = Array.isArray(allowedStatuses)
    ? allowedStatuses.filter(Boolean)
    : [];
  const defaultStatus = statusNames[0] || '现用';
  const usedIds = new Set<number>();
  const nextIdRef = { value: 1 };
  return asList(sourceItems)
    .filter(isRecord)
    .map((item) => {
      const id = allocateId(item.id, usedIds, nextIdRef);
      const rawStatus = storedText(item.status).trim();
      const status = statusNames.includes(rawStatus)
        ? rawStatus
        : defaultStatus;
      const rawType = storedText(item.sensorType).trim();
      return {
        id,
        status,
        partNumber: storedText(item.partNumber).trim(),
        sensorType: typeNames.includes(rawType) ? rawType : typeNames[0] || '',
        brand: storedText(item.brand),
        model: storedText(item.model),
        spec: storedText(item.spec),
        feature: storedText(item.feature),
        scene: storedText(item.scene),
        sopId: optionalPositiveId(item.sopId),
        model3dId: optionalPositiveId(item.model3dId),
        replacesId: optionalPositiveId(item.replacesId),
        replacedById: optionalPositiveId(item.replacedById),
        problemNote: storedText(item.problemNote).trim(),
        replacedAt: storedText(item.replacedAt).trim(),
      };
    });
}

export function createSensorCatalogDefaults(
  sensorData: Record<string, SensorTypeDefinition>,
): SensorItem[] {
  let id = 1;
  return Object.entries(sensorData).flatMap(([sensorType, definition]) =>
    definition.models.map((model, index) => ({
      id: id++,
      status: index === 0 ? '现用' : '备选',
      partNumber: '',
      sensorType,
      brand: model.brand,
      model: model.model,
      spec: model.spec,
      feature: [definition.desc, definition.notes].filter(Boolean).join('；'),
      scene: definition.scenes.join('、'),
      sopId: null,
      model3dId: null,
      replacesId: null,
      replacedById: null,
      problemNote: '',
      replacedAt: '',
    })),
  );
}

export function normalizeProcessSteps(sourceItems: unknown): ProcessStepItem[] {
  const usedIds = new Set<number>();
  const nextIdRef = { value: 1 };
  return asList(sourceItems)
    .filter(isRecord)
    .map((item) => {
      const id = allocateId(item.id, usedIds, nextIdRef);
      return {
        id,
        layer: storedText(item.layer).trim() || '内层',
        name: storedText(item.name).trim(),
        role: storedText(item.role),
        feature: storedText(item.feature),
        note: storedText(item.note),
      };
    })
    .filter((item) => item.name);
}

export function formatLocalDate(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatLocalDateTime(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const datePart = formatLocalDate(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${datePart} ${hours}:${minutes}:${seconds}`;
}

export function detectControlledFileKind(
  fileName: string,
  mimeType: string,
  allowedKinds: readonly FileKind[] = CONTROLLED_FILE_KINDS,
): FileKind | null {
  for (const kind of allowedKinds) {
    const rules = CONTROLLED_FILE_RULES[kind];
    const extension = fileExtension(fileName);
    const normalizedMime = storedText(mimeType).toLowerCase();
    const mimeAllowed =
      Boolean(normalizedMime) &&
      rules.mimeTypes.some((item) => normalizedMime.includes(item));
    const extensionAllowed = (rules.extensions as readonly string[]).includes(
      extension,
    );
    if (mimeAllowed || extensionAllowed) return kind;
  }
  return null;
}

export function normalizeSensorSops(sourceItems: unknown): SensorSopItem[] {
  const usedIds = new Set<number>();
  const nextIdRef = { value: 1 };
  return asList(sourceItems)
    .filter(isRecord)
    .map((item) => {
      const id = allocateId(item.id, usedIds, nextIdRef);
      const fileName = storedText(item.fileName).trim().slice(0, 200);
      const mimeType = storedText(item.mimeType).trim().slice(0, 120);
      const dataUrl = storedText(item.dataUrl);
      const size = Number(item.size);
      const title =
        storedText(item.title).trim().slice(0, 80) ||
        fileName.replace(/\.pdf$/i, '');
      if (
        !fileName ||
        !isStoredFileSource(dataUrl) ||
        !Number.isFinite(size) ||
        size <= 0
      ) {
        return null;
      }
      if (detectControlledFileKind(fileName, mimeType) !== 'pdf') return null;
      return {
        id,
        title,
        fileName,
        mimeType: mimeType || 'application/pdf',
        dataUrl,
        size,
        uploadedAt:
          storedText(item.uploadedAt).trim() || formatLocalDate(new Date()),
      };
    })
    .filter((item): item is SensorSopItem => Boolean(item));
}

export function validateSensor3dUpload(
  fileName: string,
  mimeType: string,
  size: number,
): { ok: false; reason: 'size' | 'type' } | { ok: true } {
  if (
    !Number.isFinite(size) ||
    size <= 0 ||
    size > SENSOR_3D_FILE_RULES.maxBytes
  ) {
    return { ok: false, reason: 'size' };
  }
  const extension = fileExtension(fileName);
  const normalizedMime = storedText(mimeType).toLowerCase();
  const extensionAllowed = (
    SENSOR_3D_FILE_RULES.extensions as readonly string[]
  ).includes(extension);
  const mimeAllowed = SENSOR_3D_FILE_RULES.mimeTypes.some(
    (item) => normalizedMime === item,
  );
  return extensionAllowed || mimeAllowed
    ? { ok: true }
    : { ok: false, reason: 'type' };
}

export function normalizeSensor3dFiles(
  sourceItems: unknown,
): Sensor3dFileItem[] {
  const usedIds = new Set<number>();
  const nextIdRef = { value: 1 };
  return asList(sourceItems)
    .filter(isRecord)
    .map((item) => {
      const id = allocateId(item.id, usedIds, nextIdRef);
      const fileName = storedText(item.fileName).trim().slice(0, 200);
      const mimeType = storedText(item.mimeType).trim().slice(0, 120);
      const dataUrl = storedText(item.dataUrl);
      const size = Number(item.size);
      const title =
        storedText(item.title).trim().slice(0, 80) ||
        fileName.replace(/\.pdf$/i, '');
      if (!fileName || !isStoredFileSource(dataUrl)) return null;
      if (!validateSensor3dUpload(fileName, mimeType, size).ok) return null;
      return {
        id,
        title,
        fileName,
        mimeType: mimeType || 'application/pdf',
        dataUrl,
        size,
        uploadedAt:
          storedText(item.uploadedAt).trim() || formatLocalDate(new Date()),
      };
    })
    .filter((item): item is Sensor3dFileItem => Boolean(item));
}

export function normalizeMachineSections(
  source: unknown,
  { allowNotes = true }: { allowNotes?: boolean } = {},
): MachineSectionItem[] {
  const usedIds = new Set<number>();
  const nextIdRef = { value: 1 };
  const normalized = asList(source)
    .filter(isRecord)
    .map((item, index) => {
      const id = allocateId(item.id, usedIds, nextIdRef);
      let kind: MachineSectionItem['kind'] =
        item.kind === 'notes' ? 'notes' : 'structure';
      if (!allowNotes) kind = 'structure';

      const name = storedText(item.name).trim().slice(0, 40);
      const sort = Number(item.sort);
      const scope = item.scope === 'machine' ? 'machine' : 'global';
      const result: MachineSectionItem = {
        id,
        name,
        sort: Number.isFinite(sort) ? sort : index + 1,
        kind,
        scope,
      };
      if (kind === 'notes' || item.locked) {
        result.locked = kind === 'notes' ? true : Boolean(item.locked);
      }
      return result;
    })
    .filter((item) => item.name)
    .filter((item) => allowNotes || item.kind !== 'notes');

  const unique: MachineSectionItem[] = [];
  const seen = new Set<string>();
  for (const item of normalized) {
    const key = item.name.toLocaleLowerCase('zh-CN');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  unique.sort((left, right) => left.sort - right.sort || left.id - right.id);
  return unique;
}

export function normalizeMachineProcesses(
  source: unknown,
): MachineProcessItem[] {
  const usedIds = new Set<number>();
  const nextIdRef = { value: 1 };
  const seenNames = new Set<string>();

  return asList(source)
    .filter(isRecord)
    .map((item, index) => {
      const id = allocateId(item.id, usedIds, nextIdRef);
      const name = storedText(item.name).trim().slice(0, 40);
      const sort = Number(item.sort);
      return {
        id,
        name,
        sort: Number.isFinite(sort) ? sort : index + 1,
        locked: item.locked === true || id === 1 ? true : undefined,
      } satisfies MachineProcessItem;
    })
    .filter((item) => item.name)
    .filter((item) => {
      const key = item.name.toLocaleLowerCase('zh-CN');
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    })
    .sort((left, right) => left.sort - right.sort || left.id - right.id);
}

export function validateMachineRowImage(
  fileName: string,
  mimeType: string,
  size: number,
): { ok: false; reason: 'size' | 'type' } | { ok: true } {
  const rules = MACHINE_ROW_IMAGE_RULES;
  if (!Number.isFinite(size) || size <= 0 || size > rules.maxBytes) {
    return { ok: false, reason: 'size' };
  }
  const extension = fileExtension(fileName);
  const normalizedMime = storedText(mimeType).toLowerCase();
  const mimeAllowed =
    !normalizedMime ||
    rules.mimeTypes.some((item) => normalizedMime.includes(item));
  const extensionAllowed = rules.extensions.includes(extension);
  if (!mimeAllowed && !extensionAllowed) {
    return { ok: false, reason: 'type' };
  }
  return { ok: true };
}

export function normalizeMachineRowImage(raw: unknown): MachineRowImage | null {
  if (!isRecord(raw)) return null;
  const fileName = storedText(raw.fileName).slice(0, 200);
  const mimeType = storedText(raw.mimeType).toLowerCase().slice(0, 120);
  const dataUrl = storedText(raw.dataUrl);
  const size = Number(raw.size);
  if (
    !fileName ||
    !isStoredFileSource(dataUrl, 'data:image/') ||
    !Number.isFinite(size) ||
    size <= 0 ||
    size > MACHINE_ROW_IMAGE_RULES.maxBytes
  ) {
    return null;
  }
  const validation = validateMachineRowImage(fileName, mimeType, size);
  if (!validation.ok) return null;
  return { dataUrl, fileName, mimeType, size };
}

export function normalizeMachineSectionImages(
  source: unknown,
): MachineRowImage[] {
  const seen = new Set<string>();
  return asList(source)
    .map((item) => normalizeMachineRowImage(item))
    .filter((item): item is MachineRowImage => {
      if (!item || seen.has(item.dataUrl)) return false;
      seen.add(item.dataUrl);
      return true;
    })
    .slice(0, 2);
}

function normalizeSensorIds(
  item: Record<string, unknown>,
  sensorItems: SensorItem[] = [],
): number[] {
  const requested = Array.isArray(item.sensorIds)
    ? item.sensorIds
        .map(Number)
        .filter((value) => Number.isSafeInteger(value) && value > 0)
    : [];
  const unique = [...new Set(requested)];
  if (unique.length > 0 || sensorItems.length === 0) return unique;

  const type = storedText(item.sensorType).trim();
  const spec = storedText(item.spec).trim().toLocaleLowerCase('zh-CN');
  const typeMatches = (sensor: SensorItem) => {
    const sensorType = storedText(sensor.sensorType).trim();
    return (
      !type ||
      sensorType === type ||
      sensorType.replace(/传感器$/u, '') === type.replace(/传感器$/u, '')
    );
  };
  const specMatches = (sensor: SensorItem) => {
    if (!spec) return false;
    const values = [sensor.model, sensor.spec, sensor.partNumber]
      .map((value) => storedText(value).trim().toLocaleLowerCase('zh-CN'))
      .filter(Boolean);
    return values.some(
      (value) => value === spec || spec.includes(value) || value.includes(spec),
    );
  };
  const exact = sensorItems.filter(
    (sensor) => typeMatches(sensor) && specMatches(sensor),
  );
  if (exact.length > 0) return exact.map((sensor) => sensor.id);
  const sameTypeCurrent = sensorItems.find(
    (sensor) => typeMatches(sensor) && isSensorStatus(sensor.status, 'current'),
  );
  return sameTypeCurrent ? [sameTypeCurrent.id] : [];
}

export function normalizeMachineSectionRows(
  source: unknown,
  {
    allowImage,
    sensorItems = [],
  }: { allowImage?: boolean; sensorItems?: SensorItem[] } = {},
): MachineSectionRow[] {
  const usedIds = new Set<number>();
  const nextIdRef = { value: 1 };
  return asList(source)
    .filter(isRecord)
    .map((item) => {
      const id = allocateId(item.id, usedIds, nextIdRef);
      const processStepId = Number(item.processStepId);
      const row: MachineSectionRow = {
        id,
        role: storedText(item.role),
        processStepId:
          allowImage &&
          Number.isSafeInteger(processStepId) &&
          processStepId > 0
            ? processStepId
            : null,
        sensorIds: normalizeSensorIds(item, sensorItems),
        sensorType: storedText(item.sensorType),
        spec: storedText(item.spec),
        purpose: storedText(item.purpose),
        name: storedText(item.name),
        desc: storedText(item.desc),
        note: storedText(item.note),
      };
      if (allowImage) {
        const image = normalizeMachineRowImage(item.image);
        if (image) row.image = image;
      }
      return row;
    })
    .filter((item) =>
      allowImage
        ? item.role.trim() &&
          (item.sensorIds.length > 0 || item.sensorType.trim())
        : item.role.trim() && item.name.trim(),
    );
}

function normalizeFileAttachment(
  raw: unknown,
): ControlledFileAttachment | null {
  if (!isRecord(raw)) return null;
  const fileName = storedText(raw.fileName).slice(0, 200);
  const mimeType = storedText(raw.mimeType).slice(0, 120);
  const dataUrl = storedText(raw.dataUrl);
  const size = Number(raw.size);
  const uploadedAt = storedText(raw.uploadedAt);
  if (
    !fileName ||
    !isStoredFileSource(dataUrl) ||
    !Number.isFinite(size) ||
    size <= 0
  ) {
    return null;
  }
  return { dataUrl, fileName, mimeType, size, uploadedAt };
}

function normalizeControlledFileItem(
  raw: unknown,
  usedIds: Set<number>,
  nextIdRef: { value: number },
  allowedKinds: readonly FileKind[],
): ControlledFileItem | null {
  if (!isRecord(raw)) return null;
  const attachment = normalizeFileAttachment(raw);
  if (!attachment) return null;

  const storedKind =
    typeof raw.kind === 'string' && allowedKinds.includes(raw.kind as FileKind)
      ? (raw.kind as FileKind)
      : null;
  const kind =
    storedKind ||
    detectControlledFileKind(
      attachment.fileName,
      attachment.mimeType,
      allowedKinds,
    );
  if (!kind) return null;

  const id = allocateId(raw.id, usedIds, nextIdRef);
  return { id, kind, ...attachment };
}

export function createDefaultControlledDocuments(): ControlledFileItem[] {
  return [];
}

export function normalizeControlledDocuments(
  sourceItems: unknown,
  allowedKinds: readonly FileKind[] = CONTROLLED_FILE_KINDS,
): ControlledFileItem[] {
  if (!Array.isArray(sourceItems)) return [];

  const usedIds = new Set<number>();
  const nextIdRef = { value: 1 };
  const items: ControlledFileItem[] = [];
  const isLegacySlot = sourceItems.some(
    (item) =>
      isRecord(item) &&
      Object.hasOwn(item, 'label') &&
      (Object.hasOwn(item, 'pdf') || Object.hasOwn(item, 'word')),
  );

  if (isLegacySlot) {
    for (const slot of sourceItems) {
      if (!isRecord(slot)) continue;
      for (const kind of ['pdf', 'word'] as const) {
        const raw = slot[kind];
        if (!raw) continue;
        const normalized = normalizeControlledFileItem(
          { ...(isRecord(raw) ? raw : {}), kind },
          usedIds,
          nextIdRef,
          allowedKinds,
        );
        if (normalized) items.push(normalized);
      }
    }
    return items;
  }

  for (const raw of sourceItems) {
    const normalized = normalizeControlledFileItem(
      raw,
      usedIds,
      nextIdRef,
      allowedKinds,
    );
    if (normalized) items.push(normalized);
  }
  return items;
}

export function validateControlledUpload(
  kind: string,
  fileName: string,
  mimeType: string,
  size: number,
): { ok: false; reason: 'size' | 'type' | 'validation' } | { ok: true } {
  const rules = CONTROLLED_FILE_RULES[kind as FileKind];
  if (!rules) return { ok: false, reason: 'validation' };
  if (!Number.isFinite(size) || size <= 0 || size > rules.maxBytes) {
    return { ok: false, reason: 'size' };
  }
  const extension = fileExtension(fileName);
  const normalizedMime = storedText(mimeType).toLowerCase();
  const mimeAllowed =
    Boolean(normalizedMime) &&
    rules.mimeTypes.some((item) => normalizedMime.includes(item));
  const extensionAllowed = (rules.extensions as readonly string[]).includes(
    extension,
  );
  if (!mimeAllowed && !extensionAllowed) {
    return { ok: false, reason: 'type' };
  }
  return { ok: true };
}

export function normalizeDictionaryItems(
  sourceItems: unknown,
): DictionaryItem[] {
  const usedIds = new Set<number>();
  const nextIdRef = { value: 1 };
  const normalized = asList(sourceItems)
    .filter(isRecord)
    .map((item, index) => {
      const id = allocateId(item.id, usedIds, nextIdRef);
      const name = storedText(item.name).trim().slice(0, 40);
      const sort = Number(item.sort);
      return {
        id,
        name,
        sort: Number.isFinite(sort) ? sort : index + 1,
      };
    })
    .filter((item) => item.name);

  const unique: DictionaryItem[] = [];
  const seen = new Set<string>();
  for (const item of normalized) {
    const key = item.name.toLocaleLowerCase('zh-CN');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  unique.sort((left, right) => left.sort - right.sort || left.id - right.id);
  return unique;
}

export function normalizeEntityGroups(
  sourceGroups: unknown,
  kind?: EntityKind,
): EntityGroup[] {
  const usedGroupNames = new Set<string>();
  const usedItemNames = new Set<string>();
  return asList(sourceGroups)
    .filter(isRecord)
    .map((group) => {
      const name = storedText(group.name).trim().slice(0, 40);
      if (!name) return null;
      const nameKey = name.toLocaleLowerCase('zh-CN');
      if (usedGroupNames.has(nameKey)) return null;
      usedGroupNames.add(nameKey);

      const items: string[] = [];
      for (const rawItem of asList(group.items)) {
        const item = storedText(rawItem).trim().slice(0, 40);
        if (!item) continue;
        const itemKey = item.toLocaleLowerCase('zh-CN');
        if (usedItemNames.has(itemKey)) continue;
        usedItemNames.add(itemKey);
        items.push(item);
      }

      const usedConfigurationNames = new Set<string>();
      const configurations = asList(group.configurations)
        .filter(isRecord)
        .map((rawConfiguration) => {
          const configurationName = storedText(rawConfiguration.name)
            .trim()
            .slice(0, 40);
          if (!configurationName) return null;
          const configurationKey = configurationName.toLocaleLowerCase('zh-CN');
          if (usedConfigurationNames.has(configurationKey)) return null;
          usedConfigurationNames.add(configurationKey);

          const configurationItems: string[] = [];
          const usedConfigurationItemNames = new Set<string>();
          for (const rawItem of asList(rawConfiguration.items)) {
            const item = storedText(rawItem).trim().slice(0, 40);
            if (!item) continue;
            const itemKey = item.toLocaleLowerCase('zh-CN');
            if (usedConfigurationItemNames.has(itemKey)) continue;
            usedConfigurationItemNames.add(itemKey);
            configurationItems.push(item);
          }
          return { name: configurationName, items: configurationItems };
        })
        .filter((item): item is { name: string; items: string[] } =>
          Boolean(item),
        );

      const machineType =
        kind === 'machine'
          ? group.machineType === 'project' || group.machineType === 'mechanism'
            ? group.machineType
            : name === '专案机型'
              ? 'project'
              : 'mechanism'
          : undefined;
      return {
        name,
        items,
        ...(configurations.length > 0 ? { configurations } : {}),
        ...(machineType ? { machineType } : {}),
      };
    })
    .filter((group): group is EntityGroup => Boolean(group));
}

export function normalizeFeedbackTypes(sourceItems: unknown): DictionaryItem[] {
  return normalizeDictionaryItems(sourceItems);
}
