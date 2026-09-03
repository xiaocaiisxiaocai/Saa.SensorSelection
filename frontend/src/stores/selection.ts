import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { api } from '@/api';
import {
  BackendStorage,
  buildSearchIndex,
  createSelectionRepository,
  CRUD_DEFAULTS,
  listEntityGroupItems,
  SENSOR_DATA,
  STORAGE_KEY,
  type BackendSyncStatus,
  type CrudRecord,
  type CustomerProcItem,
  type CustomerReqItem,
  type DictionaryItem,
  type EntityKind,
  type MachineCatalogKind,
  type MachineRowImage,
  type MachineProcessItem,
  type MachineSectionItem,
  type MachineSectionRow,
  type ProcessStepItem,
  type SaveFailure,
  type SearchItem,
  type SensorItem,
  type Sensor3dFileItem,
  type SensorSopFileItem,
  type SensorSopItem,
  type TimelineItem,
} from '@/domain';
import { toast } from '@/ui/toast';

type Repository = ReturnType<typeof createSelectionRepository>;

// Vitest 页面夹具仍可使用可控的演示数据；开发/生产构建永远关闭前端种子。
const testFixturesEnabled = import.meta.env.MODE === 'test';

function createLocalRepository() {
  return createSelectionRepository({
    crudDefaults: CRUD_DEFAULTS,
    sensorData: SENSOR_DATA,
    // 页面初始化前不读取浏览器缓存，也不生成前端演示数据；所有业务数据必须来自后端。
    demoData: testFixturesEnabled,
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

  const machineProcesses = computed(() => {
    void revision.value;
    return repository.getMachineProcesses();
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

  const sensorSopFiles = computed(() => {
    void revision.value;
    return repository.getSensorSopFiles();
  });

  const sensor3dFiles = computed(() => {
    void revision.value;
    return repository.getSensor3dFiles();
  });

  const searchIndex = computed<SearchItem[]>(() => {
    void revision.value;
    const machineGroups = repository.getEntityGroups('machine');
    const machineSectionHits: SearchItem[] = [];
    for (const process of repository.getMachineProcesses()) {
      for (const group of machineGroups) {
        for (const machineName of listEntityGroupItems(group)) {
          for (const section of repository.listResolvedMachineSections(
            machineName,
            process.id,
          )) {
            for (const row of repository.getMachineSectionRows(
              section.id,
              machineName,
              process.id,
            )) {
              machineSectionHits.push({
                type: 'machine',
                title: row.sensorType || row.name || row.role,
                category: group.name,
                sub: [process.name, machineName, section.name, row.role]
                  .filter(Boolean)
                  .join(' · '),
                path: '/selection/machine',
                query: {
                  category: group.name,
                  item: machineName,
                  section: String(section.id),
                  ...(process.id === 1 ? {} : { process: String(process.id) }),
                },
              });
            }
          }
        }
      }
    }
    return buildSearchIndex({
      customerGroups: repository.getEntityGroups('customer'),
      // 机型描述必须由后端 store 提供，前端不再注入演示条目。
      machineDetails: {},
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

  function extraMachineSections(machineName: string, processId = 1) {
    void revision.value;
    return repository.getExtraMachineSections(machineName, processId);
  }

  function resolvedMachineSections(machineName: string, processId = 1) {
    void revision.value;
    return repository.listResolvedMachineSections(machineName, processId);
  }

  function machineSectionRows(
    sectionId: number,
    machineName: string,
    processId = 1,
  ) {
    void revision.value;
    return repository.getMachineSectionRows(sectionId, machineName, processId);
  }

  function machineSectionImages(
    sectionId: number,
    machineName: string,
    processId = 1,
  ) {
    void revision.value;
    return repository.getMachineSectionImages(
      sectionId,
      machineName,
      processId,
    );
  }

  function initBackend(): Promise<void> {
    if (initPromise) return initPromise;
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
        // localStorage 仅作为后端成功后的快照缓存，不能在后端为空时回灌或充当数据源。
        local: {
          getItem: () => null,
          setItem: () => undefined,
        },
        migrateOnEmpty: false,
        onStatus: (status) => {
          backendStatus.value = status;
        },
        onWriteFailure: (message) => {
          lastFailure.value = 'storage';
          backendMessage.value = `写入后端失败：${message}`;
          toast.error(`写入后端失败：${message}`);
        },
      });
      await bridge.init();
      repository = createSelectionRepository({
        crudDefaults: CRUD_DEFAULTS,
        sensorData: SENSOR_DATA,
        demoData: testFixturesEnabled,
        storage: bridge,
      });
      touch();
    })();
    initPromise = running.catch(() => {
      /* status is reported via callbacks */
    });
    return initPromise;
  }

  function ensureBackendInit(): Promise<void> {
    return initBackend();
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
    deleteEntityItem: (
      kind: EntityKind,
      name: string,
      category?: string,
      configuration?: string | null,
    ) =>
      mutate(() =>
        repository.deleteEntityItem(kind, name, category, configuration),
      ),
    deleteExtraMachineSection: (
      machineName: string,
      id: number,
      processId = 1,
    ) =>
      mutate(() =>
        repository.deleteExtraMachineSection(machineName, id, processId),
      ),
    deleteGlobalMachineSection: (id: number) =>
      mutate(() => repository.deleteGlobalMachineSection(id)),
    deleteMachineProcess: (id: number) =>
      mutate(() => repository.deleteMachineProcess(id)),
    deleteMachineSectionRow: (
      sectionId: number,
      machineName: string,
      id: number,
      processId = 1,
    ) =>
      mutate(() =>
        repository.deleteMachineSectionRow(
          sectionId,
          machineName,
          id,
          processId,
        ),
      ),
    deleteProcessIntroFile: (id: number) =>
      mutate(() => repository.deleteProcessIntroFile(id)),
    deleteProcessStep: (id: number) =>
      mutate(() => repository.deleteProcessStep(id)),
    deleteSensor: (id: number) => mutate(() => repository.deleteSensor(id)),
    deleteSensor3dFile: (id: number) =>
      mutate(() => repository.deleteSensor3dFile(id)),
    deleteSensorSopFile: (id: number) =>
      mutate(() => repository.deleteSensorSopFile(id)),
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
    machineProcesses,
    processIntroFiles,
    processSteps,
    reconnect,
    reorderEntityGroups: (
      kind: EntityKind,
      oldIndex: number,
      newIndex: number,
    ) => mutate(() => repository.reorderEntityGroups(kind, oldIndex, newIndex)),
    reorderEntityItems: (
      kind: EntityKind,
      groupName: string,
      oldIndex: number,
      newIndex: number,
      configurationName?: string | null,
    ) =>
      mutate(() =>
        repository.reorderEntityItems(
          kind,
          groupName,
          oldIndex,
          newIndex,
          configurationName,
        ),
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
      payload: {
        name: string;
        sort?: number;
        machineType?: MachineCatalogKind;
      },
      editName?: string,
    ) => mutate(() => repository.saveEntityGroup(kind, payload, editName)),
    saveMachineConfiguration: (
      category: string,
      payload: { name: string; sort?: number },
      editName?: string,
    ) =>
      mutate(() =>
        repository.saveMachineConfiguration(category, payload, editName),
      ),
    deleteMachineConfiguration: (category: string, name: string) =>
      mutate(() => repository.deleteMachineConfiguration(category, name)),
    saveEntityItem: (
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
    ) => mutate(() => repository.saveEntityItem(kind, payload, editName)),
    saveExtraMachineSection: (
      machineName: string,
      payload: Partial<MachineSectionItem>,
      editId?: number,
      processId = 1,
    ) =>
      mutate(() =>
        repository.saveExtraMachineSection(
          machineName,
          payload,
          editId,
          processId,
        ),
      ),
    saveGlobalMachineSection: (
      payload: Partial<MachineSectionItem>,
      editId?: number,
    ) => mutate(() => repository.saveGlobalMachineSection(payload, editId)),
    saveMachineProcess: (
      payload: Partial<MachineProcessItem>,
      editId?: number,
    ) => mutate(() => repository.saveMachineProcess(payload, editId)),
    saveMachineSectionImages: (
      sectionId: number,
      machineName: string,
      images: MachineRowImage[],
      processId = 1,
    ) =>
      mutate(() =>
        repository.saveMachineSectionImages(
          sectionId,
          machineName,
          images,
          processId,
        ),
      ),
    saveMachineSectionRow: (
      sectionId: number,
      machineName: string,
      payload: Partial<MachineSectionRow>,
      editId?: number,
      processId = 1,
    ) =>
      mutate(() =>
        repository.saveMachineSectionRow(
          sectionId,
          machineName,
          payload,
          editId,
          processId,
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
    saveSensor3dFile: (payload: Partial<Sensor3dFileItem>, editId?: number) =>
      mutate(() => repository.saveSensor3dFile(payload, editId)),
    saveSensorSopFile: (payload: Partial<SensorSopFileItem>, editId?: number) =>
      mutate(() => repository.saveSensorSopFile(payload, editId)),
    saveSensorSop: (payload: Partial<SensorSopItem>, editId?: number) =>
      mutate(() => repository.saveSensorSop(payload, editId)),
    searchIndex,
    sensors,
    sensor3dFiles,
    sensorSopFiles,
    sensorSops,
  };
});
