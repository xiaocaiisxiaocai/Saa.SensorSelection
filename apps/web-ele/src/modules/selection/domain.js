export const STORAGE_KEY = 'symtek_crud_store';

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
        const statuses = ['pending', 'processing', 'resolved'];
        return {
          id,
          date: storedText(item.date),
          title: storedText(item.title || item.name),
          desc: storedText(item.desc),
          actions: storedText(item.actions),
          status: statuses.includes(item.status) ? item.status : 'pending',
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

export function normalizeSensorItems(sourceItems, sensorTypes) {
  const allowedTypes = Object.keys(sensorTypes);
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
        status: item.status === '备选' ? '备选' : '现用',
        sensorType: allowedTypes.includes(item.sensorType)
          ? item.sensorType
          : allowedTypes[0] || '',
        brand: storedText(item.brand),
        model: storedText(item.model),
        spec: storedText(item.spec),
        feature: storedText(item.feature),
        scene: storedText(item.scene),
      };
    });
}

export function createSensorCatalogDefaults(sensorData) {
  let id = 1;
  return Object.entries(sensorData).flatMap(([sensorType, definition]) =>
    definition.models.map((model, index) => ({
      id: id++,
      status: index === 0 ? '现用' : '备选',
      sensorType,
      brand: model.brand,
      model: model.model,
      spec: model.spec,
      feature: [definition.desc, definition.notes].filter(Boolean).join('；'),
      scene: definition.scenes.join('、'),
    })),
  );
}

export function formatLocalDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    const requiredValue = isTimeline ? payload.title : payload.name;
    if (!storedText(requiredValue).trim())
      return { ok: false, reason: 'validation' };

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
    store[key] = normalizeSensorItems(store[key], sensorData);
    return store[key];
  }

  function saveSensor(payload, editId) {
    const items = getSensors();
    const model = storedText(payload.model).trim();
    if (!model || !Object.hasOwn(sensorData, payload.sensorType)) {
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
    const normalized = normalizeSensorItems(
      [{ ...payload, id: editId || nextAvailableId(items), model }],
      sensorData,
    )[0];
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

  function deleteSensor(id) {
    const items = getSensors();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: 'stale' };
    const snapshot = cloneStore(store);
    items.splice(index, 1);
    return persist(snapshot) ? { ok: true } : { ok: false, reason: 'storage' };
  }

  function replaceFromStorage(rawValue) {
    store = parsePersistedStore(rawValue);
  }

  return {
    deleteCrud,
    deleteSensor,
    getCrud,
    getSensors,
    replaceFromStorage,
    saveCrud,
    saveSensor,
  };
}

export function buildSearchIndex({
  customerGroups,
  machineDetails,
  machineGroups,
  processDetails,
  processGroups,
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
  const processes = processGroups.flatMap((group) =>
    group.items.map((title) => ({
      type: 'process',
      title,
      category: group.name,
      sub: `${group.name} · ${processDetails[title]?.desc || '制程工艺文档'}`,
      path: '/selection/process',
      query: { category: group.name, item: title },
    })),
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
  const sensorItems = sensors.map((item) => ({
    type: 'sensor',
    title: [item.brand, item.model].filter(Boolean).join(' '),
    category: item.sensorType,
    sub: [item.status, item.sensorType, item.spec, item.feature, item.scene]
      .filter(Boolean)
      .join(' · '),
    path: '/selection/sensor',
    query: { model: item.model },
  }));
  return [...sensorItems, ...processes, ...machines, ...customers];
}
