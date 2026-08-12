import type {
  CrudItem,
  CustomerReqItem,
  DictionaryItem,
  EntityGroup,
  MachineSectionItem,
  MachineSectionRow,
  ProcessStepItem,
  SensorItem,
  SensorSopItem,
  TimelineItem,
} from './data.js';
import type {
  EntityKind,
  EntityTreeItem,
  SaveFailure,
  SearchItem,
} from './domain.js';

import { computed, ref } from 'vue';

import { defineStore } from 'pinia';

import { CRUD_DEFAULTS, MACHINE_DETAILS, SENSOR_DATA } from './data.js';
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

  const processSteps = computed(() => {
    revision.value;
    return repository.getProcessSteps();
  });

  const globalMachineSections = computed(() => {
    revision.value;
    return repository.getGlobalMachineSections();
  });

  const generalStructureLabelMap = computed(() => {
    revision.value;
    return repository.getGeneralStructureLabelMap();
  });

  const searchIndex = computed<SearchItem[]>(() => {
    revision.value;
    const machineGroups = repository.getEntityGroups('machine');
    const machineSectionHits: SearchItem[] = [];
    for (const group of machineGroups) {
      for (const machineName of group.items) {
        for (const section of repository.listResolvedMachineSections(
          machineName,
        )) {
          for (const row of repository.getMachineSectionRows(
            section.id,
            machineName,
          )) {
            machineSectionHits.push({
              type: 'machine',
              title: row.name,
              category: group.name,
              sub: [machineName, section.name, row.type]
                .filter(Boolean)
                .join(' · '),
              path: '/selection/machine',
              query: {
                category: group.name,
                item: machineName,
                section: String(section.id),
              },
            });
          }
        }
      }
    }
    return buildSearchIndex({
      customerGroups: repository.getEntityGroups('customer'),
      machineDetails: MACHINE_DETAILS,
      machineGroups,
      machineSectionHits,
      processSteps: processSteps.value,
      sensors: sensors.value,
    });
  });

  function touch() {
    revision.value += 1;
  }

  function entityGroups(kind: EntityKind): EntityGroup[] {
    revision.value;
    return repository.getEntityGroups(kind);
  }

  function entityHasData(kind: EntityKind, entityName: string) {
    revision.value;
    return repository.entityHasData(kind, entityName);
  }

  function crudItems(listId: string, entityName: string) {
    revision.value;
    return repository.getCrud(listId, entityName);
  }

  function dictionaryItems(code: string) {
    revision.value;
    return repository.getDictionaryItems(code);
  }

  function dictionaryNames(code: string) {
    return dictionaryItems(code).map((item) => item.name);
  }

  function controlledDocuments(entityName: string) {
    revision.value;
    return repository.getControlledDocuments(entityName);
  }

  function saveControlledFile(
    entityName: string,
    attachment: {
      dataUrl: string;
      fileName: string;
      mimeType: string;
      size: number;
      uploadedAt: string;
    },
  ) {
    const result = repository.saveControlledFile(entityName, attachment);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function deleteControlledFile(entityName: string, id: number) {
    const result = repository.deleteControlledFile(entityName, id);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function saveCrud(
    listId: string,
    entityName: string,
    payload: Partial<CrudItem & CustomerReqItem & TimelineItem>,
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

  function saveDictionaryItem(
    code: string,
    payload: Partial<DictionaryItem>,
    editId?: number,
  ) {
    const result = repository.saveDictionaryItem(code, payload, editId);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function deleteDictionaryItem(code: string, id: number) {
    const result = repository.deleteDictionaryItem(code, id);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function saveEntityGroup(
    kind: EntityKind,
    payload: { name: string },
    editName?: string,
  ) {
    const result = repository.saveEntityGroup(kind, payload, editName);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function deleteEntityGroup(kind: EntityKind, name: string) {
    const result = repository.deleteEntityGroup(kind, name);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function saveEntityItem(
    kind: EntityKind,
    payload: { category: string; name: string },
    editName?: string,
  ) {
    const result = repository.saveEntityItem(kind, payload, editName);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function deleteEntityItem(kind: EntityKind, name: string) {
    const result = repository.deleteEntityItem(kind, name);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function saveProcessStep(payload: Partial<ProcessStepItem>, editId?: number) {
    const result = repository.saveProcessStep(payload, editId);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function deleteProcessStep(id: number) {
    const result = repository.deleteProcessStep(id);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function extraMachineSections(machineName: string) {
    revision.value;
    return repository.getExtraMachineSections(machineName);
  }

  function resolvedMachineSections(machineName: string) {
    revision.value;
    return repository.listResolvedMachineSections(machineName);
  }

  function machineSectionRows(sectionId: number, machineName: string) {
    revision.value;
    return repository.getMachineSectionRows(sectionId, machineName);
  }

  function saveGlobalMachineSection(
    payload: Partial<MachineSectionItem>,
    editId?: number,
  ) {
    const result = repository.saveGlobalMachineSection(payload, editId);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function deleteGlobalMachineSection(id: number) {
    const result = repository.deleteGlobalMachineSection(id);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function saveExtraMachineSection(
    machineName: string,
    payload: Partial<MachineSectionItem>,
    editId?: number,
  ) {
    const result = repository.saveExtraMachineSection(
      machineName,
      payload,
      editId,
    );
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function deleteExtraMachineSection(machineName: string, id: number) {
    const result = repository.deleteExtraMachineSection(machineName, id);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function saveMachineSectionRow(
    sectionId: number,
    machineName: string,
    payload: Partial<MachineSectionRow>,
    editId?: number,
  ) {
    const result = repository.saveMachineSectionRow(
      sectionId,
      machineName,
      payload,
      editId,
    );
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function deleteMachineSectionRow(
    sectionId: number,
    machineName: string,
    id: number,
  ) {
    const result = repository.deleteMachineSectionRow(
      sectionId,
      machineName,
      id,
    );
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

  function replaceSensorCurrent(
    alternateId: number,
    currentId: number,
    problemNote: string,
  ) {
    const result = repository.replaceSensorCurrent(
      alternateId,
      currentId,
      problemNote,
    );
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

  const sensorSops = computed(() => {
    revision.value;
    return repository.getSensorSops();
  });

  function saveSensorSop(payload: Partial<SensorSopItem>, editId?: number) {
    const result = repository.saveSensorSop(payload, editId);
    lastFailure.value = result.ok ? null : result.reason;
    if (result.ok) touch();
    return result;
  }

  function deleteSensorSop(id: number) {
    const result = repository.deleteSensorSop(id);
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
    controlledDocuments,
    crudItems,
    deleteControlledFile,
    deleteCrud,
    deleteDictionaryItem,
    deleteEntityGroup,
    deleteEntityItem,
    deleteExtraMachineSection,
    deleteGlobalMachineSection,
    deleteMachineSectionRow,
    deleteProcessStep,
    deleteSensor,
    deleteSensorSop,
    dictionaryItems,
    dictionaryNames,
    entityGroups,
    entityHasData,
    extraMachineSections,
    generalStructureLabelMap,
    globalMachineSections,
    lastFailure,
    machineSectionRows,
    processSteps,
    resolvedMachineSections,
    revision,
    saveControlledFile,
    saveCrud,
    saveDictionaryItem,
    saveEntityGroup,
    saveEntityItem,
    saveExtraMachineSection,
    saveGlobalMachineSection,
    saveMachineSectionRow,
    replaceSensorCurrent,
    saveProcessStep,
    saveSensor,
    saveSensorSop,
    searchIndex,
    sensors,
    sensorSops,
  };
});

export type { EntityKind, EntityTreeItem };
