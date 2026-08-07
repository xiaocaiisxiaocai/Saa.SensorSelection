import type { CrudItem, SensorItem, TimelineItem } from './data.js';
import type { SaveFailure, SearchItem } from './domain.js';

import { computed, ref } from 'vue';

import { defineStore } from 'pinia';

import {
  CRUD_DEFAULTS,
  CUSTOMER_GROUPS,
  MACHINE_DETAILS,
  MACHINE_GROUPS,
  PROCESS_DETAILS,
  PROCESS_GROUPS,
  SENSOR_DATA,
} from './data.js';
import {
  buildSearchIndex,
  createSelectionRepository,
  STORAGE_KEY,
} from './domain.js';

const storage = typeof window === 'undefined' ? undefined : window.localStorage;
const repository = createSelectionRepository({
  crudDefaults: CRUD_DEFAULTS,
  sensorData: SENSOR_DATA,
  storage,
});

let storageSyncBound = false;

export const useSelectionStore = defineStore('sensor-selection', () => {
  const revision = ref(0);
  const lastFailure = ref<null | SaveFailure>(null);

  const sensors = computed(() => {
    revision.value;
    return repository.getSensors();
  });

  const searchIndex = computed<SearchItem[]>(() =>
    buildSearchIndex({
      customerGroups: CUSTOMER_GROUPS,
      machineDetails: MACHINE_DETAILS,
      machineGroups: MACHINE_GROUPS,
      processDetails: PROCESS_DETAILS,
      processGroups: PROCESS_GROUPS,
      sensors: sensors.value,
    }),
  );

  function touch() {
    revision.value += 1;
  }

  function crudItems(listId: string, entityName: string) {
    revision.value;
    return repository.getCrud(listId, entityName);
  }

  function saveCrud(
    listId: string,
    entityName: string,
    payload: Partial<CrudItem & TimelineItem>,
    editId?: number,
  ) {
    const result = repository.saveCrud(listId, entityName, payload, editId);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function deleteCrud(listId: string, entityName: string, id: number) {
    const result = repository.deleteCrud(listId, entityName, id);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function saveSensor(payload: Partial<SensorItem>, editId?: number) {
    const result = repository.saveSensor(payload, editId);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function deleteSensor(id: number) {
    const result = repository.deleteSensor(id);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function bindStorageSync() {
    if (storageSyncBound || typeof window === 'undefined') return;
    storageSyncBound = true;
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return;
      repository.replaceFromStorage(event.newValue);
      touch();
    });
  }

  bindStorageSync();

  return {
    crudItems,
    deleteCrud,
    deleteSensor,
    lastFailure,
    revision,
    saveCrud,
    saveSensor,
    searchIndex,
    sensors,
  };
});
