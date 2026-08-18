import {
  createEntityGroupDefaults,
  createProcessStepDefaults,
  DICTIONARY_DEFINITIONS,
  ENTITY_KIND_DEFINITIONS,
  GENERAL_STRUCTURE_CATEGORY,
  GENERAL_STRUCTURE_SECTION_LABELS,
  MACHINE_ROW_IMAGE_RULES,
  MACHINE_SECTION_LEGACY_MAP,
  MACHINE_SECTION_SEED,
  SEED_VERSION,
} from './data.js';

export const STORAGE_KEY = 'symtek_crud_store';

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
};

export const CONTROLLED_FILE_ACCEPT = [
  CONTROLLED_FILE_RULES.pdf.accept,
  CONTROLLED_FILE_RULES.word.accept,
].join(',');

function emptyStore() {
  return Object.create(null);
}

function storedText(value) {
  return ['boolean', 'number', 'string'].includes(typeof value)
    ? String(value)
    : '';
}

function nextAvailableId(items) {
  const ids = new Set(items.map((item) => item.id));
  let id = 1;
  while (ids.has(id)) id += 1;
  return id;
}

function cloneStore(store) {
  return parsePersistedStore(JSON.stringify(store));
}

function omitStoreKeys(store, keys) {
  const removeSet = new Set(keys);
  const next = emptyStore();
  for (const [key, value] of Object.entries(store)) {
    if (removeSet.has(key)) continue;
    next[key] = value;
  }
  return next;
}

export function parsePersistedStore(rawValue) {
  if (!rawValue) return emptyStore();
  try {
    const parsed = JSON.parse(rawValue);
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

export function normalizeCrudItems(listId, sourceItems) {
  const usedIds = new Set();
  let nextId = 1;
  return (Array.isArray(sourceItems) ? sourceItems : [])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      let id = Number(item.id);
      if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) {
        while (usedIds.has(nextId)) nextId += 1;
        id = nextId;
      }
      usedIds.add(id);
      nextId = Math.max(nextId, id + 1);

      if (listId === 'customer-feedback') {
        const statusAliases = {
          pending: '待处理',
          processing: '处理中',
          resolved: '已解决',
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
        return {
          id,
          type,
          machine: storedText(item.machine),
          problem: storedText(item.problem),
          measure: storedText(item.measure),
          date: storedText(item.date),
          status,
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

export function normalizeSensorItems(
  sourceItems,
  allowedTypes = [],
  allowedStatuses = [],
) {
  const typeNames = Array.isArray(allowedTypes)
    ? allowedTypes.filter(Boolean)
    : [];
  const statusNames = Array.isArray(allowedStatuses)
    ? allowedStatuses.filter(Boolean)
    : [];
  const defaultStatus = statusNames[0] || '现用';
  const usedIds = new Set();
  let nextId = 1;
  return (Array.isArray(sourceItems) ? sourceItems : [])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      let id = Number(item.id);
      if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) {
        while (usedIds.has(nextId)) nextId += 1;
        id = nextId;
      }
      usedIds.add(id);
      nextId = Math.max(nextId, id + 1);
      const rawStatus = storedText(item.status).trim();
      const status = statusNames.includes(rawStatus)
        ? rawStatus
        : defaultStatus;
      const rawType = storedText(item.sensorType).trim();
      const sopId = Number(item.sopId);
      const replacesId = Number(item.replacesId);
      const replacedById = Number(item.replacedById);
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
        sopId: Number.isSafeInteger(sopId) && sopId > 0 ? sopId : null,
        replacesId:
          Number.isSafeInteger(replacesId) && replacesId > 0
            ? replacesId
            : null,
        replacedById:
          Number.isSafeInteger(replacedById) && replacedById > 0
            ? replacedById
            : null,
        problemNote: storedText(item.problemNote).trim(),
        replacedAt: storedText(item.replacedAt).trim(),
      };
    });
}

export function createSensorCatalogDefaults(sensorData) {
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
      replacesId: null,
      replacedById: null,
      problemNote: '',
      replacedAt: '',
    })),
  );
}

export function normalizeProcessSteps(sourceItems) {
  const usedIds = new Set();
  let nextId = 1;
  return (Array.isArray(sourceItems) ? sourceItems : [])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      let id = Number(item.id);
      if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) {
        while (usedIds.has(nextId)) nextId += 1;
        id = nextId;
      }
      usedIds.add(id);
      nextId = Math.max(nextId, id + 1);
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

export function normalizeSensorSops(sourceItems) {
  const usedIds = new Set();
  let nextId = 1;
  return (Array.isArray(sourceItems) ? sourceItems : [])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      let id = Number(item.id);
      if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) {
        while (usedIds.has(nextId)) nextId += 1;
        id = nextId;
      }
      usedIds.add(id);
      nextId = Math.max(nextId, id + 1);
      const fileName = storedText(item.fileName).trim().slice(0, 200);
      const mimeType = storedText(item.mimeType).trim().slice(0, 120);
      const dataUrl = storedText(item.dataUrl);
      const size = Number(item.size);
      const title =
        storedText(item.title).trim().slice(0, 80) ||
        fileName.replace(/\.pdf$/i, '');
      if (
        !fileName ||
        !dataUrl.startsWith('data:') ||
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
    .filter(Boolean);
}

export function normalizeMachineSections(source, { allowNotes = true } = {}) {
  const usedIds = new Set();
  let nextId = 1;
  const normalized = (Array.isArray(source) ? source : [])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => {
      let id = Number(item.id);
      if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) {
        while (usedIds.has(nextId)) nextId += 1;
        id = nextId;
      }
      usedIds.add(id);
      nextId = Math.max(nextId, id + 1);

      let kind = item.kind === 'notes' ? 'notes' : 'structure';
      if (!allowNotes) kind = 'structure';

      const name = storedText(item.name).trim().slice(0, 40);
      const sort = Number(item.sort);
      const scope = item.scope === 'machine' ? 'machine' : 'global';
      const result = {
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

  const unique = [];
  const seen = new Set();
  for (const item of normalized) {
    const key = item.name.toLocaleLowerCase('zh-CN');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  unique.sort((left, right) => left.sort - right.sort || left.id - right.id);
  return unique;
}

export function validateMachineRowImage(fileName, mimeType, size) {
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

export function normalizeMachineRowImage(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const fileName = storedText(raw.fileName).slice(0, 200);
  const mimeType = storedText(raw.mimeType).toLowerCase().slice(0, 120);
  const dataUrl = storedText(raw.dataUrl);
  const size = Number(raw.size);
  if (
    !fileName ||
    !dataUrl.startsWith('data:image/') ||
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

export function normalizeMachineSectionRows(source, { allowImage } = {}) {
  const usedIds = new Set();
  let nextId = 1;
  return (Array.isArray(source) ? source : [])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      let id = Number(item.id);
      if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) {
        while (usedIds.has(nextId)) nextId += 1;
        id = nextId;
      }
      usedIds.add(id);
      nextId = Math.max(nextId, id + 1);

      const row = {
        id,
        role: storedText(item.role),
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
        ? item.role.trim() && item.sensorType.trim()
        : item.role.trim() && item.name.trim(),
    );
}

export function formatLocalDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatLocalDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const datePart = formatLocalDate(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${datePart} ${hours}:${minutes}:${seconds}`;
}

function fileExtension(fileName) {
  const index = fileName.lastIndexOf('.');
  return index === -1 ? '' : fileName.slice(index).toLowerCase();
}

function normalizeFileAttachment(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const fileName = storedText(raw.fileName).slice(0, 200);
  const mimeType = storedText(raw.mimeType).slice(0, 120);
  const dataUrl = storedText(raw.dataUrl);
  const size = Number(raw.size);
  const uploadedAt = storedText(raw.uploadedAt);
  if (
    !fileName ||
    !dataUrl.startsWith('data:') ||
    !Number.isFinite(size) ||
    size <= 0
  ) {
    return null;
  }
  return { dataUrl, fileName, mimeType, size, uploadedAt };
}

export function detectControlledFileKind(fileName, mimeType) {
  for (const kind of ['pdf', 'word']) {
    const rules = CONTROLLED_FILE_RULES[kind];
    const extension = fileExtension(fileName);
    const normalizedMime = storedText(mimeType).toLowerCase();
    const mimeAllowed =
      !normalizedMime ||
      rules.mimeTypes.some((item) => normalizedMime.includes(item));
    const extensionAllowed = rules.extensions.includes(extension);
    if (mimeAllowed || extensionAllowed) return kind;
  }
  return null;
}

function normalizeControlledFileItem(raw, usedIds, nextIdRef) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const attachment = normalizeFileAttachment(raw);
  if (!attachment) return null;

  const kind =
    raw.kind === 'pdf' || raw.kind === 'word'
      ? raw.kind
      : detectControlledFileKind(attachment.fileName, attachment.mimeType);
  if (!kind) return null;

  let id = Number(raw.id);
  if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) {
    while (usedIds.has(nextIdRef.value)) nextIdRef.value += 1;
    id = nextIdRef.value;
  }
  usedIds.add(id);
  nextIdRef.value = Math.max(nextIdRef.value, id + 1);

  return { id, kind, ...attachment };
}

export function createDefaultControlledDocuments() {
  return [];
}

export function normalizeControlledDocuments(sourceItems) {
  if (!Array.isArray(sourceItems)) return [];

  const usedIds = new Set();
  const nextIdRef = { value: 1 };
  const items = [];
  const isLegacySlot = sourceItems.some(
    (item) =>
      item &&
      typeof item === 'object' &&
      Object.hasOwn(item, 'label') &&
      (Object.hasOwn(item, 'pdf') || Object.hasOwn(item, 'word')),
  );

  if (isLegacySlot) {
    for (const slot of sourceItems) {
      if (!slot || typeof slot !== 'object') continue;
      for (const kind of ['pdf', 'word']) {
        const raw = slot[kind];
        if (!raw) continue;
        const normalized = normalizeControlledFileItem(
          { ...raw, kind },
          usedIds,
          nextIdRef,
        );
        if (normalized) items.push(normalized);
      }
    }
    return items;
  }

  for (const raw of sourceItems) {
    const normalized = normalizeControlledFileItem(raw, usedIds, nextIdRef);
    if (normalized) items.push(normalized);
  }
  return items;
}

export function validateControlledUpload(kind, fileName, mimeType, size) {
  const rules = CONTROLLED_FILE_RULES[kind];
  if (!rules) return { ok: false, reason: 'validation' };
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

export function normalizeDictionaryItems(sourceItems) {
  const usedIds = new Set();
  let nextId = 1;
  const source = Array.isArray(sourceItems) ? sourceItems : [];
  const normalized = source
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => {
      let id = Number(item.id);
      if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) {
        while (usedIds.has(nextId)) nextId += 1;
        id = nextId;
      }
      usedIds.add(id);
      nextId = Math.max(nextId, id + 1);
      const name = storedText(item.name).trim().slice(0, 40);
      const sort = Number(item.sort);
      return {
        id,
        name,
        sort: Number.isFinite(sort) ? sort : index + 1,
      };
    })
    .filter((item) => item.name);

  const unique = [];
  const seen = new Set();
  for (const item of normalized) {
    const key = item.name.toLocaleLowerCase('zh-CN');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  unique.sort((left, right) => left.sort - right.sort || left.id - right.id);
  return unique;
}

export function createDictionaryDefaults(code) {
  const definition = DICTIONARY_DEFINITIONS.find((item) => item.code === code);
  const names = definition?.defaults || [];
  return names.map((name, index) => ({
    id: index + 1,
    name,
    sort: index + 1,
  }));
}

export function normalizeEntityGroups(sourceGroups) {
  const usedGroupNames = new Set();
  const usedItemNames = new Set();
  return (Array.isArray(sourceGroups) ? sourceGroups : [])
    .filter(
      (group) => group && typeof group === 'object' && !Array.isArray(group),
    )
    .map((group) => {
      const name = storedText(group.name).trim().slice(0, 40);
      if (!name) return null;
      const nameKey = name.toLocaleLowerCase('zh-CN');
      if (usedGroupNames.has(nameKey)) return null;
      usedGroupNames.add(nameKey);

      const items = [];
      for (const rawItem of Array.isArray(group.items) ? group.items : []) {
        const item = storedText(rawItem).trim().slice(0, 40);
        if (!item) continue;
        const itemKey = item.toLocaleLowerCase('zh-CN');
        if (usedItemNames.has(itemKey)) continue;
        usedItemNames.add(itemKey);
        items.push(item);
      }
      return { name, items };
    })
    .filter(Boolean);
}

function entityKindDefinition(kind) {
  return ENTITY_KIND_DEFINITIONS.find((item) => item.kind === kind) || null;
}

function sameLocaleName(left, right) {
  return (
    storedText(left).trim().toLocaleLowerCase('zh-CN') ===
    storedText(right).trim().toLocaleLowerCase('zh-CN')
  );
}

export function normalizeFeedbackTypes(sourceItems) {
  return normalizeDictionaryItems(sourceItems);
}

export function createFeedbackTypeDefaults() {
  return createDictionaryDefaults('customer-feedback');
}

export function createSelectionRepository({
  storage,
  crudDefaults,
  sensorData,
}) {
  let store;
  try {
    store = parsePersistedStore(storage?.getItem?.(STORAGE_KEY));
  } catch {
    store = emptyStore();
  }

  function keyFor(listId, entityName) {
    return `${listId}:${entityName}`;
  }

  function persist(snapshot) {
    try {
      storage?.setItem?.(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch {
      store = snapshot;
      return false;
    }
  }

  function getCrud(listId, entityName) {
    const key = keyFor(listId, entityName);
    if (!Array.isArray(store[key])) {
      const factory = crudDefaults[listId];
      store[key] = factory
        ? factory(entityName).map((item) => ({ ...item }))
        : [];
    }
    store[key] = normalizeCrudItems(listId, store[key]);
    return store[key];
  }

  function saveCrud(listId, entityName, payload, editId) {
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
      const requiredValue = isTimeline
        ? payload.problem
        : isCustomerReq
          ? payload.content
          : payload.name;
      if (!storedText(requiredValue).trim())
        return { ok: false, reason: 'validation' };
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

    const normalized = normalizeCrudItems(listId, [
      { ...payload, id: editId || nextAvailableId(items) },
    ])[0];
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

  function deleteCrud(listId, entityName, id) {
    const items = getCrud(listId, entityName);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    const snapshot = cloneStore(store);
    items.splice(index, 1);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getSensors() {
    const key = keyFor('sensor-catalog', 'all');
    if (!Array.isArray(store[key])) {
      store[key] = createSensorCatalogDefaults(sensorData);
    }
    const typeNames = getDictionaryItems('sensor-type').map(
      (item) => item.name,
    );
    const statusNames = getDictionaryItems('sensor-status').map(
      (item) => item.name,
    );
    store[key] = normalizeSensorItems(store[key], typeNames, statusNames);
    return store[key];
  }

  function saveSensor(payload, editId) {
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

    const snapshot = cloneStore(store);
    let sopId = null;
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
    if (editId) {
      const index = items.findIndex((item) => item.id === editId);
      if (index === -1) return { ok: false, reason: 'stale' };
      const previous = items[index];
      // 未显式传 sopId 时保留原关联
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
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: normalized };
  }

  function replaceSensorCurrent(alternateId, currentId, problemNote) {
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
    if (alternate.status !== '备选' || current.status !== '现用') {
      return { ok: false, reason: 'validation' };
    }

    const snapshot = cloneStore(store);
    const replacedAt = formatLocalDate(new Date());
    items[altIndex] = normalizeSensorItems(
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
    const curIndexAfter = items.findIndex((item) => item.id === curId);
    items[curIndexAfter] = normalizeSensorItems(
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

    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: items[altIndex] };
  }

  function deleteSensor(id) {
    const items = getSensors();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    const snapshot = cloneStore(store);
    items.splice(index, 1);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getSensorSops() {
    const key = keyFor('sensor-sop', 'all');
    if (!Array.isArray(store[key])) {
      store[key] = [];
    }
    store[key] = normalizeSensorSops(store[key]);
    return store[key];
  }

  function saveSensorSop(payload, editId) {
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

  function deleteSensorSop(id) {
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

  function getProcessSteps() {
    const key = keyFor('process-steps', 'all');
    if (!Array.isArray(store[key])) {
      store[key] = createProcessStepDefaults();
    }
    store[key] = normalizeProcessSteps(store[key]);
    if (store[key].length === 0) {
      store[key] = createProcessStepDefaults();
    }
    return store[key];
  }

  function saveProcessStep(payload, editId) {
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

  function deleteProcessStep(id) {
    const items = getProcessSteps();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    const snapshot = cloneStore(store);
    items.splice(index, 1);
    store[keyFor('process-steps', 'all')] = normalizeProcessSteps(items);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function machineSectionRowsKey(sectionId, machineName) {
    return `machine-section-rows:${sectionId}:${machineName}`;
  }

  function generalStructureLabelsKey() {
    return keyFor('general-structure-labels', 'all');
  }

  function getGeneralStructureLabelMap() {
    const key = generalStructureLabelsKey();
    const map = { ...GENERAL_STRUCTURE_SECTION_LABELS };
    if (!Array.isArray(store[key])) {
      store[key] = Object.entries(GENERAL_STRUCTURE_SECTION_LABELS).map(
        ([id, name]) => ({ id: Number(id), name }),
      );
    }
    for (const row of store[key]) {
      const id = Number(row?.id);
      const name = storedText(row?.name).trim();
      if (!Number.isSafeInteger(id) || id <= 0 || !name) continue;
      map[id] = name;
    }
    return map;
  }

  function persistGeneralStructureLabel(sectionId, name) {
    const key = generalStructureLabelsKey();
    const list = Array.isArray(store[key]) ? [...store[key]] : [];
    const index = list.findIndex((row) => Number(row.id) === sectionId);
    const row = { id: sectionId, name };
    if (index === -1) list.push(row);
    else list.splice(index, 1, row);
    const snapshot = cloneStore(store);
    store[key] = list;
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function findGeneralStructureSection(itemName) {
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

  function ensureGeneralStructureSection(itemName) {
    const name = storedText(itemName).trim().slice(0, 40);
    if (!name) return { ok: false, reason: 'validation' };
    const found = findGeneralStructureSection(name);
    if (found) return { ok: true, item: found.section };
    return saveGlobalMachineSection({
      name,
      sort: getGlobalMachineSections().length + 1,
    });
  }

  function syncGeneralStructureItemRename(fromName, toName) {
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

  function getGlobalMachineSections() {
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

    // 若曾误把全局 Tab 改成「通用结构」机型名，迁回数据字典种子名
    const mistakenNames = {
      1: '标准输送段',
      2: '六轴机械手',
      3: '台车系统',
    };
    let restored = false;
    store[key] = store[key].map((item) => {
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
      // 通过注入的 storage 持久化修复结果（在线模式下经桥接层同步到后端），
      // 而不是绕过桥接层直写浏览器 localStorage。
      persist(cloneStore(store));
    }
    return store[key];
  }

  function saveGlobalMachineSection(payload, editId) {
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
      items.push(normalized);
    }

    store[keyFor('machine-global-sections', 'all')] = normalizeMachineSections(
      items,
      { allowNotes: true },
    );
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    const saved = store[keyFor('machine-global-sections', 'all')].find(
      (item) => item.name === name,
    );
    return { ok: true, item: saved };
  }

  function deleteGlobalMachineSection(id) {
    const items = getGlobalMachineSections();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    const target = items[index];
    if (target.locked || target.kind === 'notes') {
      return { ok: false, reason: 'validation' };
    }

    for (const group of getEntityGroups('machine')) {
      for (const machineName of group.items) {
        if (getMachineSectionRows(id, machineName).length > 0) {
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

  function getExtraMachineSections(machineName) {
    const key = keyFor('machine-extra-sections', machineName);
    if (!Array.isArray(store[key])) {
      store[key] = [];
    }
    store[key] = normalizeMachineSections(store[key], {
      allowNotes: false,
    }).map((item) => ({ ...item, kind: 'structure', scope: 'machine' }));
    return store[key];
  }

  function nextExtraMachineSectionId(machineName) {
    const used = new Set([
      ...getExtraMachineSections(machineName).map((item) => item.id),
      ...getGlobalMachineSections().map((item) => item.id),
    ]);
    let id = 1001;
    while (used.has(id)) id += 1;
    return id;
  }

  function saveExtraMachineSection(machineName, payload, editId) {
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
      items.push({ ...normalized, scope: 'machine' });
    }

    store[keyFor('machine-extra-sections', machineName)] =
      normalizeMachineSections(items, { allowNotes: false }).map((item) => ({
        ...item,
        kind: 'structure',
        scope: 'machine',
      }));
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    const saved = store[keyFor('machine-extra-sections', machineName)].find(
      (item) => item.name === name,
    );
    return { ok: true, item: saved };
  }

  function deleteExtraMachineSection(machineName, id) {
    const items = getExtraMachineSections(machineName);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    if (getMachineSectionRows(id, machineName).length > 0) {
      return { ok: false, reason: 'not-empty' };
    }

    const snapshot = cloneStore(store);
    items.splice(index, 1);
    store[keyFor('machine-extra-sections', machineName)] =
      normalizeMachineSections(items, { allowNotes: false }).map((item) => ({
        ...item,
        kind: 'structure',
        scope: 'machine',
      }));
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function sectionAllowsImage(sectionId) {
    const numericId = Number(sectionId);
    const section = getGlobalMachineSections().find(
      (item) => item.id === numericId,
    );
    if (section) return section.kind !== 'notes';
    // Extra/machine-scoped sections are structure-only.
    return true;
  }

  function migrateLegacyMachineRows(sectionId, machineName) {
    const numericId = Number(sectionId);
    const newKey = machineSectionRowsKey(numericId, machineName);
    // Key presence means already migrated (including intentional empty []).
    if (Object.hasOwn(store, newKey)) return;

    const legacyListId = Object.entries(MACHINE_SECTION_LEGACY_MAP).find(
      ([, id]) => id === numericId,
    )?.[0];

    if (!legacyListId) {
      store[newKey] = [];
      return;
    }

    const legacyKey = keyFor(legacyListId, machineName);
    let legacyItems;
    if (Array.isArray(store[legacyKey])) {
      legacyItems = store[legacyKey];
    } else {
      const factory = crudDefaults[legacyListId];
      legacyItems = factory
        ? factory(machineName).map((item) => ({ ...item }))
        : [];
    }

    store[newKey] = normalizeMachineSectionRows(legacyItems, {
      allowImage: sectionAllowsImage(numericId),
    });
  }

  function getMachineSectionRows(sectionId, machineName) {
    const numericId = Number(sectionId);
    migrateLegacyMachineRows(numericId, machineName);
    const key = machineSectionRowsKey(numericId, machineName);
    const allowImage = sectionAllowsImage(numericId);
    store[key] = normalizeMachineSectionRows(
      Array.isArray(store[key]) ? store[key] : [],
      { allowImage },
    );
    return store[key];
  }

  function saveMachineSectionRow(sectionId, machineName, payload, editId) {
    const numericId = Number(sectionId);
    const items = getMachineSectionRows(numericId, machineName);
    const allowImage = sectionAllowsImage(numericId);
    const role = storedText(payload.role).trim();
    if (allowImage) {
      const sensorType = storedText(payload.sensorType).trim();
      if (!role || !sensorType) return { ok: false, reason: 'validation' };
    } else {
      const name = storedText(payload.name).trim();
      if (!role || !name) return { ok: false, reason: 'validation' };
    }

    let image;
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
    const base = {
      id: editId || nextAvailableId(items),
      role,
      sensorType: storedText(payload.sensorType),
      spec: storedText(payload.spec),
      purpose: storedText(payload.purpose),
      name: storedText(payload.name),
      desc: storedText(payload.desc),
      note: storedText(payload.note),
    };
    if (allowImage) {
      if (image !== undefined) {
        if (image) base.image = image;
      } else if (editId) {
        const existing = items.find((item) => item.id === editId);
        if (existing?.image) base.image = existing.image;
      }
    }

    const normalized = normalizeMachineSectionRows([base], { allowImage })[0];
    if (!normalized) return { ok: false, reason: 'validation' };

    if (editId) {
      const index = items.findIndex((item) => item.id === editId);
      if (index === -1) return { ok: false, reason: 'stale' };
      items.splice(index, 1, normalized);
    } else {
      items.push(normalized);
    }

    store[machineSectionRowsKey(numericId, machineName)] =
      normalizeMachineSectionRows(items, { allowImage });
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: normalized };
  }

  function deleteMachineSectionRow(sectionId, machineName, id) {
    const numericId = Number(sectionId);
    const items = getMachineSectionRows(numericId, machineName);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    const snapshot = cloneStore(store);
    items.splice(index, 1);
    store[machineSectionRowsKey(numericId, machineName)] =
      normalizeMachineSectionRows(items, {
        allowImage: sectionAllowsImage(numericId),
      });
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function listResolvedMachineSections(machineName) {
    const global = getGlobalMachineSections().map((item) => ({
      ...item,
      scope: 'global',
    }));
    const extra = getExtraMachineSections(machineName).map((item) => ({
      ...item,
      kind: 'structure',
      scope: 'machine',
    }));
    return [...global, ...extra];
  }

  function getControlledDocuments(entityName) {
    const key = keyFor('customer-sop', entityName);
    if (!Array.isArray(store[key])) {
      store[key] = createDefaultControlledDocuments();
    }
    store[key] = normalizeControlledDocuments(store[key]);
    return store[key];
  }

  function saveControlledFile(entityName, attachment) {
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

    const normalized = normalizeFileAttachment(attachment);
    if (!normalized) return { ok: false, reason: 'validation' };

    const items = getControlledDocuments(entityName);
    const snapshot = cloneStore(store);
    const item = {
      id: nextAvailableId(items),
      kind,
      ...normalized,
    };
    items.push(item);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item };
  }

  function deleteControlledFile(entityName, id) {
    const items = getControlledDocuments(entityName);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };

    const snapshot = cloneStore(store);
    items.splice(index, 1);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function dictionaryCodeForList(listId) {
    return (
      DICTIONARY_DEFINITIONS.find(
        (item) =>
          item.listIds.includes(listId) && (item.field || 'type') === 'type',
      )?.code || null
    );
  }

  function dictionaryStorageKey(code) {
    return keyFor('dict', code);
  }

  function getDictionaryItems(code) {
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

    // 已有本地字典若缺「停用」则补齐一次，不覆盖用户已有项
    if (
      code === 'sensor-status' &&
      !store[key].some((item) => item.name === '停用')
    ) {
      const snapshot = cloneStore(store);
      store[key] = normalizeDictionaryItems([
        ...store[key],
        {
          id: nextAvailableId(store[key]),
          name: '停用',
          sort:
            Math.max(0, ...store[key].map((item) => Number(item.sort) || 0)) +
            1,
        },
      ]);
      persist(snapshot);
    }

    return store[key];
  }

  function renameDictionaryValue(definition, fromName, toName) {
    const field = definition.field || 'type';
    for (const listId of definition.listIds) {
      const prefix = `${listId}:`;
      for (const [key, value] of Object.entries(store)) {
        if (!key.startsWith(prefix) || !Array.isArray(value)) continue;
        store[key] = normalizeCrudItems(
          listId,
          value.map((item) =>
            item?.[field] === fromName ? { ...item, [field]: toName } : item,
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
        store[key].map((item) =>
          item?.[field] === fromName ? { ...item, [field]: toName } : item,
        ),
        typeNames,
        statusNames,
      );
    }

    if (definition.catalog === 'process-step') {
      const key = keyFor('process-steps', 'all');
      if (!Array.isArray(store[key])) return;
      store[key] = normalizeProcessSteps(
        store[key].map((item) =>
          item?.[field] === fromName ? { ...item, [field]: toName } : item,
        ),
      );
    }
  }

  function saveDictionaryItem(code, payload, editId) {
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

    if (editId) {
      const index = items.findIndex((item) => item.id === editId);
      if (index === -1) return { ok: false, reason: 'stale' };
      const previousName = items[index].name;
      items.splice(index, 1, normalized);
      if (previousName !== normalized.name) {
        renameDictionaryValue(definition, previousName, normalized.name);
      }
    } else {
      items.push(normalized);
    }

    store[dictionaryStorageKey(code)] = normalizeDictionaryItems(items);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return { ok: true, item: normalized };
  }

  function deleteDictionaryItem(code, id) {
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
    renameDictionaryValue(definition, removed.name, fallback);
    store[dictionaryStorageKey(code)] = normalizeDictionaryItems(items);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function getFeedbackTypes() {
    return getDictionaryItems('customer-feedback');
  }

  function saveFeedbackType(payload, editId) {
    return saveDictionaryItem('customer-feedback', payload, editId);
  }

  function deleteFeedbackType(id) {
    return deleteDictionaryItem('customer-feedback', id);
  }

  function entityGroupsKey(kind) {
    return keyFor('entity-groups', kind);
  }

  function getEntityGroups(kind) {
    if (!entityKindDefinition(kind)) return [];
    const key = entityGroupsKey(kind);
    if (!Array.isArray(store[key])) {
      store[key] = createEntityGroupDefaults(kind);
    }
    store[key] = normalizeEntityGroups(store[key]);
    if (store[key].length === 0) {
      store[key] = createEntityGroupDefaults(kind);
    }
    return store[key];
  }

  function entityDataKeys(kind, entityName) {
    const definition = entityKindDefinition(kind);
    if (!definition) return [];
    if (kind === 'machine') {
      const keys = [keyFor('machine-extra-sections', entityName)];
      const sectionIds = new Set(
        listResolvedMachineSections(entityName).map((item) => item.id),
      );
      for (const sectionId of sectionIds) {
        keys.push(machineSectionRowsKey(sectionId, entityName));
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

  function entityHasData(kind, entityName) {
    if (kind === 'machine') {
      if (getExtraMachineSections(entityName).length > 0) return true;
      return listResolvedMachineSections(entityName).some(
        (section) => getMachineSectionRows(section.id, entityName).length > 0,
      );
    }
    return entityDataKeys(kind, entityName).some(
      (key) => Array.isArray(store[key]) && store[key].length > 0,
    );
  }

  function migrateEntityDataKeys(kind, fromName, toName) {
    if (kind === 'machine') {
      const removals = [];
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

      for (const listId of Object.keys(MACHINE_SECTION_LEGACY_MAP)) {
        const fromKey = keyFor(listId, fromName);
        if (!Object.hasOwn(store, fromKey)) continue;
        store[keyFor(listId, toName)] = store[fromKey];
        removals.push(fromKey);
      }

      if (removals.length > 0) store = omitStoreKeys(store, removals);
      return;
    }

    const removals = [];
    for (const fromKey of entityDataKeys(kind, fromName)) {
      const listId = fromKey.slice(0, fromKey.lastIndexOf(':'));
      const toKey = keyFor(listId, toName);
      if (!Object.hasOwn(store, fromKey)) continue;
      store[toKey] = store[fromKey];
      removals.push(fromKey);
    }
    if (removals.length > 0) store = omitStoreKeys(store, removals);
  }

  function clearEntityDataKeys(kind, entityName) {
    store = omitStoreKeys(store, entityDataKeys(kind, entityName));
  }

  function initEmptyEntityData(kind, entityName) {
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

  function findEntityLocation(groups, entityName) {
    for (const group of groups) {
      const index = group.items.indexOf(entityName);
      if (index !== -1) return { group, index };
    }
    return null;
  }

  function saveEntityGroup(kind, payload, editName) {
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
      groups[index] = { name, items: [...groups[index].items] };
    } else {
      groups.push({ name, items: [] });
    }

    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups);
    if (!persist(snapshot)) return { ok: false, reason: 'storage' };
    return {
      ok: true,
      item: store[entityGroupsKey(kind)].find((group) => group.name === name),
    };
  }

  function deleteEntityGroup(kind, name) {
    if (!entityKindDefinition(kind)) return { ok: false, reason: 'validation' };
    const groups = getEntityGroups(kind);
    const index = groups.findIndex((group) => group.name === name);
    if (index === -1) return { ok: false, reason: 'stale' };
    if (groups[index].items.length > 0) {
      return { ok: false, reason: 'not-empty' };
    }

    const snapshot = cloneStore(store);
    groups.splice(index, 1);
    store[entityGroupsKey(kind)] = normalizeEntityGroups(groups);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function saveEntityItem(kind, payload, editName) {
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

  function deleteEntityItem(kind, name) {
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

  function replaceFromStorage(rawValue) {
    store = parsePersistedStore(rawValue);
  }

  /** 返回当前内存 store 的快照（全部值为数组）。 */
  function snapshotStore() {
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
    getMachineSectionRows,
    getProcessSteps,
    getSensors,
    getSensorSops,
    listResolvedMachineSections,
    replaceFromStorage,
    saveControlledFile,
    saveCrud,
    saveDictionaryItem,
    saveEntityGroup,
    saveEntityItem,
    saveExtraMachineSection,
    saveFeedbackType,
    saveGlobalMachineSection,
    saveMachineSectionRow,
    saveProcessStep,
    replaceSensorCurrent,
    saveSensor,
    saveSensorSop,
    snapshotStore,
    syncGeneralStructureItemRename,
  };
}

/**
 * 物化前端内置的基础数据（数据字典、客户/机型分组、制程步骤、机型全局结构、
 * 通用结构标签、Sensor 型号目录、SOP 空表），供后端空库时的首次种子导入。
 *
 * 只含「全局基础数据」：各实体的业务行（示例行）仍由仓库按需物化，
 * 避免把 15 个客户 × 多列表的同一批示例行写死进数据库。
 */
export function buildDefaultStore({ crudDefaults, sensorData }) {
  const memory = { value: null };
  const fakeStorage = {
    getItem: () => memory.value,
    setItem: (key, value) => {
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
  repo.getGlobalMachineSections();
  repo.getGeneralStructureLabelMap();
  repo.getSensors();
  repo.getSensorSops();
  const store = repo.snapshotStore();
  // 记录种子版本，供桥接层做版本化回填（升级时补种缺失默认 key）
  store['meta:seed-version'] = [{ version: SEED_VERSION }];
  return store;
}

export function buildSearchIndex({
  customerGroups,
  machineDetails,
  machineGroups,
  machineSectionHits,
  processSteps,
  sensors,
}) {
  const customers = customerGroups.flatMap((group) =>
    group.items.map((title) => ({
      type: 'customer',
      title,
      category: group.name,
      sub: `${group.name}区域 · PCB 制造客户`,
      path: '/selection/customer',
      query: { category: group.name, item: title },
    })),
  );
  const processes = (Array.isArray(processSteps) ? processSteps : []).map(
    (item) => ({
      type: 'process',
      title: item.name,
      category: item.layer,
      sub: [item.layer, item.role, item.feature].filter(Boolean).join(' · '),
      path: '/selection/process',
      query: { tab: 'steps', q: item.name },
    }),
  );
  const machines = machineGroups.flatMap((group) =>
    group.items.map((title) => ({
      type: 'machine',
      title,
      category: group.name,
      sub: `${group.name} · ${machineDetails[title]?.desc || '机型结构'}`,
      path: '/selection/machine',
      query: { category: group.name, item: title },
    })),
  );
  const machineRows = (
    Array.isArray(machineSectionHits) ? machineSectionHits : []
  ).map((item) => ({
    type: 'machine',
    title: item.title,
    category: item.category,
    sub: item.sub,
    path: item.path || '/selection/machine',
    query: { ...item.query },
  }));
  const sensorItems = sensors.map((item) => ({
    type: 'sensor',
    title: [item.brand, item.model, item.partNumber].filter(Boolean).join(' '),
    category: item.sensorType,
    sub: [
      item.status,
      item.partNumber,
      item.sensorType,
      item.spec,
      item.feature,
      item.scene,
      item.problemNote,
    ]
      .filter(Boolean)
      .join(' · '),
    path: '/selection/sensor',
    query: { model: item.model },
  }));
  return [
    ...sensorItems,
    ...processes,
    ...machines,
    ...machineRows,
    ...customers,
  ];
}
