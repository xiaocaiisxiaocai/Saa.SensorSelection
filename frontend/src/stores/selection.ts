import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { api } from '@/api';
import {
  BackendStorage,
  buildDefaultStore,
  buildSearchIndex,
  createSelectionRepository,
  CRUD_DEFAULTS,
  MACHINE_DETAILS,
  migrateSelectionSeedStore,
  SENSOR_DATA,
  STORAGE_KEY,
  type BackendSyncStatus,
  type CrudRecord,
  type CustomerProcItem,
  type CustomerReqItem,
  type DictionaryItem,
  type EntityKind,
  type MachineRowImage,
  type MachineSectionItem,
  type MachineSectionRow,
  type ProcessStepItem,
  type SaveFailure,
  type SearchItem,
  type SensorItem,
  type SensorSopItem,
  type StorageLike,
  type TimelineItem,
} from '@/domain';
import { toast } from '@/ui/toast';

type Repository = ReturnType<typeof createSelectionRepository>;

const browserStorage: StorageLike | undefined =
  typeof window === 'undefined' ? undefined : window.localStorage;

function createLocalRepository(storage: StorageLike | undefined = browserStorage) {
  return createSelectionRepository({
    crudDefaults: CRUD_DEFAULTS,
    sensorData: SENSOR_DATA,
    storage,
  });
}

export const useSelectionStore = defineStore('selection', () => {
  // 每个 Store 实例独立的标志位（避免 Vitest 测试间跨实例共享）
  let storageSyncBound = false;
  let repository: Repository = createLocalRepository();
  let initPromise: null | Promise<void> = null;
  const revision = ref(0);
  const lastFailure = ref<null | SaveFailure>(null);
  const backendStatus = ref<BackendSyncStatus>('connecting');
  const backendMessage = ref('');

  const sensors = computed(() => {
    void revision.value;
    return repository.getSensors();
  });

  const processSteps = computed(() => {
    void revision.value;
    return repository.getProcessSteps();
  });

  const globalMachineSections = computed(() => {
    void revision.value;
    return repository.getGlobalMachineSections();
  });

  const generalStructureLabelMap = computed(() => {
    void revision.value;
    return repository.getGeneralStructureLabelMap();
  });

  const processIntroFiles = computed(() => {
    void revision.value;
    return repository.getProcessIntroFiles();
  });

  const sensorSops = computed(() => {
    void revision.value;
    return repository.getSensorSops();
  });

  const searchIndex = computed<SearchItem[]>(() => {
    void revision.value;
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
              title: row.sensorType || row.name || row.role,
              category: group.name,
              sub: [machineName, section.name, row.role]
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

  function mutate<T extends { ok: boolean; reason?: SaveFailure }>(
    run: () => T,
  ): T {
    const result = run();
    lastFailure.value = result.ok ? null : (result.reason ?? null);
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

  function entityGroups(kind: EntityKind) {
    void revision.value;
    return repository.getEntityGroups(kind);
  }

  function entityHasData(kind: EntityKind, entityName: string) {
    void revision.value;
    return repository.entityHasData(kind, entityName);
  }

  function crudItems(listId: string, entityName: string) {
    void revision.value;
    return repository.getCrud(listId, entityName);
  }

  function dictionaryItems(code: string) {
    void revision.value;
    return repository.getDictionaryItems(code);
  }

  function dictionaryNames(code: string) {
    return dictionaryItems(code).map((item) => item.name);
  }

  function controlledDocuments(entityName: string) {
    void revision.value;
    return repository.getControlledDocuments(entityName);
  }

  function extraMachineSections(machineName: string) {
    void revision.value;
    return repository.getExtraMachineSections(machineName);
  }

  function resolvedMachineSections(machineName: string) {
    void revision.value;
    return repository.listResolvedMachineSections(machineName);
  }

  function machineSectionRows(sectionId: number, machineName: string) {
    void revision.value;
    return repository.getMachineSectionRows(sectionId, machineName);
  }

  function machineSectionImages(sectionId: number, machineName: string) {
    void revision.value;
    return repository.getMachineSectionImages(sectionId, machineName);
  }

  async function initBackend(): Promise<void> {
    const running = (async () => {
      backendStatus.value = 'connecting';
      backendMessage.value = '';
      const bridge = new BackendStorage({
        transport: {
          fetchStore: () => api.getStore(),
          writeKey: (key, value) => {
            const entityGroupsMatch = /^entity-groups:(customer|machine)$/.exec(
              key,
            );
            if (entityGroupsMatch) {
              return api.putEntityGroups(
                entityGroupsMatch[1] as 'customer' | 'machine',
                value,
              );
            }
            return api.putKey(key, value);
          },
          deleteKey: (key) => api.deleteKey(key),
          writeAll: (store) => api.replaceAll(store),
        },
        local: browserStorage as StorageLike,
        migrateOnEmpty: true,
        seedDefaults: buildDefaultStore({
          crudDefaults: CRUD_DEFAULTS,
          sensorData: SENSOR_DATA,
        }),
        seedMigration: migrateSelectionSeedStore,
        onStatus: (status) => {
          backendStatus.value = status;
        },
        onWriteFailure: (message) => {
          lastFailure.value = 'storage';
          backendMessage.value = `写入后端失败：${message}`;
          toast.error(`写入后端失败：${message}`);
        },
      });
      const result = await bridge.init();
      repository = createSelectionRepository({
        crudDefaults: CRUD_DEFAULTS,
        sensorData: SENSOR_DATA,
        storage: bridge,
      });
      if (result.migrated) {
        backendMessage.value = '已将本地数据导入后端（迁移完成）';
        toast.success('已将本地数据导入后端（迁移完成）');
      } else if (result.seeded) {
        backendMessage.value = '已将内置基础数据初始化到后端';
        toast.success('已将内置基础数据初始化到后端');
      }
      touch();
    })();
    initPromise = running.catch(() => {
      /* status is reported via callbacks */
    });
    await running;
  }

  function ensureBackendInit(): Promise<void> {
    if (!initPromise) {
      initPromise = initBackend().catch(() => {
        /* status is reported via callbacks */
      });
    }
    return initPromise;
  }

  function reconnect() {
    initPromise = null;
    return ensureBackendInit();
  }

  return {
    backendMessage,
    backendStatus,
    controlledDocuments,
    crudItems,
    deleteControlledFile: (entityName: string, id: number) =>
      mutate(() => repository.deleteControlledFile(entityName, id)),
    deleteCrud: (listId: string, entityName: string, id: number) =>
      mutate(() => repository.deleteCrud(listId, entityName, id)),
    deleteDictionaryItem: (code: string, id: number) =>
      mutate(() => repository.deleteDictionaryItem(code, id)),
    deleteEntityGroup: (kind: EntityKind, name: string) =>
      mutate(() => repository.deleteEntityGroup(kind, name)),
    deleteEntityItem: (kind: EntityKind, name: string) =>
      mutate(() => repository.deleteEntityItem(kind, name)),
    deleteExtraMachineSection: (machineName: string, id: number) =>
      mutate(() => repository.deleteExtraMachineSection(machineName, id)),
    deleteGlobalMachineSection: (id: number) =>
      mutate(() => repository.deleteGlobalMachineSection(id)),
    deleteMachineSectionRow: (
      sectionId: number,
      machineName: string,
      id: number,
    ) =>
      mutate(() =>
        repository.deleteMachineSectionRow(sectionId, machineName, id),
      ),
    deleteProcessIntroFile: (id: number) =>
      mutate(() => repository.deleteProcessIntroFile(id)),
    deleteProcessStep: (id: number) =>
      mutate(() => repository.deleteProcessStep(id)),
    deleteSensor: (id: number) => mutate(() => repository.deleteSensor(id)),
    deleteSensorSop: (id: number) =>
      mutate(() => repository.deleteSensorSop(id)),
    dictionaryItems,
    dictionaryNames,
    ensureBackendInit,
    entityGroups,
    entityHasData,
    extraMachineSections,
    generalStructureLabelMap,
    globalMachineSections,
    initBackend,
    lastFailure,
    machineSectionImages,
    machineSectionRows,
    processIntroFiles,
    processSteps,
    reconnect,
    reorderEntityGroups: (
      kind: EntityKind,
      oldIndex: number,
      newIndex: number,
    ) =>
      mutate(() => repository.reorderEntityGroups(kind, oldIndex, newIndex)),
    reorderEntityItems: (
      kind: EntityKind,
      groupName: string,
      oldIndex: number,
      newIndex: number,
    ) =>
      mutate(() =>
        repository.reorderEntityItems(kind, groupName, oldIndex, newIndex),
      ),
    replaceSensorCurrent: (
      alternateId: number,
      currentId: number,
      problemNote: string,
    ) =>
      mutate(() =>
        repository.replaceSensorCurrent(alternateId, currentId, problemNote),
      ),
    resolvedMachineSections,
    revision,
    saveControlledFile: (
      entityName: string,
      attachment: {
        dataUrl: string;
        fileName: string;
        mimeType: string;
        size: number;
        uploadedAt: string;
      },
    ) => mutate(() => repository.saveControlledFile(entityName, attachment)),
    saveCrud: (
      listId: string,
      entityName: string,
      payload: Partial<
        CrudRecord & CustomerProcItem & CustomerReqItem & TimelineItem
      >,
      editId?: number,
    ) => mutate(() => repository.saveCrud(listId, entityName, payload, editId)),
    saveDictionaryItem: (
      code: string,
      payload: Partial<DictionaryItem>,
      editId?: number,
    ) => mutate(() => repository.saveDictionaryItem(code, payload, editId)),
    saveEntityGroup: (
      kind: EntityKind,
      payload: { name: string },
      editName?: string,
    ) => mutate(() => repository.saveEntityGroup(kind, payload, editName)),
    saveEntityItem: (
      kind: EntityKind,
      payload: { category: string; name: string },
      editName?: string,
    ) => mutate(() => repository.saveEntityItem(kind, payload, editName)),
    saveExtraMachineSection: (
      machineName: string,
      payload: Partial<MachineSectionItem>,
      editId?: number,
    ) =>
      mutate(() =>
        repository.saveExtraMachineSection(machineName, payload, editId),
      ),
    saveGlobalMachineSection: (
      payload: Partial<MachineSectionItem>,
      editId?: number,
    ) => mutate(() => repository.saveGlobalMachineSection(payload, editId)),
    saveMachineSectionImages: (
      sectionId: number,
      machineName: string,
      images: MachineRowImage[],
    ) =>
      mutate(() =>
        repository.saveMachineSectionImages(sectionId, machineName, images),
      ),
    saveMachineSectionRow: (
      sectionId: number,
      machineName: string,
      payload: Partial<MachineSectionRow>,
      editId?: number,
    ) =>
      mutate(() =>
        repository.saveMachineSectionRow(
          sectionId,
          machineName,
          payload,
          editId,
        ),
      ),
    saveProcessIntroFile: (attachment: {
      dataUrl: string;
      fileName: string;
      mimeType: string;
      size: number;
      uploadedAt: string;
    }) => mutate(() => repository.saveProcessIntroFile(attachment)),
    saveProcessStep: (payload: Partial<ProcessStepItem>, editId?: number) =>
      mutate(() => repository.saveProcessStep(payload, editId)),
    saveSensor: (payload: Partial<SensorItem>, editId?: number) =>
      mutate(() => repository.saveSensor(payload, editId)),
    saveSensorSop: (payload: Partial<SensorSopItem>, editId?: number) =>
      mutate(() => repository.saveSensorSop(payload, editId)),
    searchIndex,
    sensors,
    sensorSops,
  };
});
