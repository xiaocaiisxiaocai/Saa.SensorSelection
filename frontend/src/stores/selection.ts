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
import { message } from 'ant-design-vue';

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
  let repository: Repository = createLocalRepository();
  // 当前生效的 bridge；重建时旧 bridge 的回调不能再改共享状态。
  let activeBridge: BackendStorage | null = null;
  let initPromise: null | Promise<void> = null;
  let initInFlight = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelayMs = 0;
  const RECONNECT_BASE_DELAY_MS = 3000;
  const RECONNECT_MAX_DELAY_MS = 30_000;
  const revision = ref(0);
  const lastFailure = ref<null | SaveFailure>(null);
  const backendStatus = ref<BackendSyncStatus>('connecting');
  const backendMessage = ref('');
  // 是否曾经成功连上过后端。之后的重连期间页面保持挂载（继续显示已加载的数据），
  // 只有首次连接才用加载态替换页面，避免重连把编辑到一半的表单和弹窗卸载掉。
  const hasConnected = ref(false);

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
    return repository.batchRead(buildFullSearchIndex);
  });

  function buildFullSearchIndex(): SearchItem[] {
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
      processSteps: repository.getProcessSteps(),
      sensors: repository.getSensors(),
    });
  }

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

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  // 断线后自动退避重连：把"发现掉线"到"重新可写"之间的空档从"人工点按钮才会
  // 恢复"缩短到几秒钟——bridge/repository 必须整体重建才能保证一致性（见
  // runInit），所以这里只负责按节奏重新触发同一条已验证过的重建路径。
  function scheduleReconnect() {
    if (reconnectTimer !== null) return;
    reconnectDelayMs =
      reconnectDelayMs === 0
        ? RECONNECT_BASE_DELAY_MS
        : Math.min(reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void reconnect();
    }, reconnectDelayMs);
  }

  function runInit(): Promise<void> {
    clearReconnectTimer();
    initInFlight = true;
    const running = (async () => {
      backendStatus.value = 'connecting';
      backendMessage.value = '';
      // 先让旧 bridge 队列里已提交的写入落地，再拉取新快照；否则这些写入可能
      // 晚于 fetchStore 到达后端，新仓库读到的是旧值，下一次编辑就会把它们覆盖掉。
      if (activeBridge) await activeBridge.queue;
      const bridge: BackendStorage = new BackendStorage({
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
        // 不传 local：浏览器不缓存业务数据，后端为空时也不能用本地内容回灌。
        migrateOnEmpty: false,
        onStatus: (status) => {
          if (bridge !== activeBridge) return;
          backendStatus.value = status;
          if (status === 'online') {
            hasConnected.value = true;
            reconnectDelayMs = 0;
            clearReconnectTimer();
          } else if (status === 'offline') {
            // 掉线可能来自初始连接失败，也可能来自后面某次写入失败（storage.ts
            // 内部会把状态整体标记为 offline）；两种情况都要自动重连。
            scheduleReconnect();
          } else {
            // 'unauthorized' 需要用户重新登录，自动重试没有意义；
            // 'connecting' 是重建过程中的瞬时状态，不需要额外调度。
            clearReconnectTimer();
          }
        },
        onWriteFailure: (reason) => {
          if (bridge !== activeBridge) return;
          // bridge 已把失败的 key 回滚到后端确认值；仓库持有自己的一份内存 store，
          // 必须按回滚后的缓存重建，否则页面会继续显示这次并未保存成功的数据。
          repository.replaceFromStorage(bridge.readStoreJson());
          touch();
          lastFailure.value = 'storage';
          backendMessage.value = `写入后端失败：${reason}`;
          message.error(`写入后端失败：${reason}`);
        },
      });
      activeBridge = bridge;
      await bridge.init();
      repository = createSelectionRepository({
        crudDefaults: CRUD_DEFAULTS,
        sensorData: SENSOR_DATA,
        demoData: testFixturesEnabled,
        storage: bridge,
      });
      touch();
    })();
    return running
      .catch(() => {
        /* status is reported via callbacks */
      })
      .finally(() => {
        initInFlight = false;
      });
  }

  function initBackend(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = runInit();
    return initPromise;
  }

  function ensureBackendInit(): Promise<void> {
    // 重新登录或以访客身份进入后，旧 bridge 可能仍停在 unauthorized（401/403
    // 不会自动重连）或 offline；它会拒绝所有写入，必须用新身份重建。
    if (
      initPromise &&
      !initInFlight &&
      (backendStatus.value === 'unauthorized' ||
        backendStatus.value === 'offline')
    ) {
      return reconnect();
    }
    return initBackend();
  }

  function reconnect(): Promise<void> {
    // 已有一次重建在途（无论是初次连接、手动点击，还是自动重试触发的）时，
    // 直接复用同一个 in-flight promise，避免并发重建出两套 bridge/repository。
    if (initInFlight && initPromise) return initPromise;
    initPromise = runInit();
    return initPromise;
  }

  return {
    backendMessage,
    batchRead: <T>(run: () => T): T => repository.batchRead(run),
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
    hasConnected,
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
