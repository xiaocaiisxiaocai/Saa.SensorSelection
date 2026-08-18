import type {
  CrudItem,
  CustomerProcItem,
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
  StorageLike,
} from './domain.js';

import { computed, ref } from 'vue';

import { useAccessStore } from '@vben/stores';

import { defineStore } from 'pinia';

import { refreshAccess } from '#/router/access';

import {
  api,
  ApiError,
  getStoredToken,
  readTokenDisplayName,
  storeToken,
  type UserProfile,
} from './api.js';
import { BackendStorage, type BackendSyncStatus } from './backend-storage.js';
import { CRUD_DEFAULTS, MACHINE_DETAILS, SENSOR_DATA } from './data.js';
import {
  buildDefaultStore,
  buildSearchIndex,
  createSelectionRepository,
  STORAGE_KEY,
} from './domain.js';

const storage = typeof window === 'undefined' ? undefined : window.localStorage;

let repository = createSelectionRepository({
  crudDefaults: CRUD_DEFAULTS,
  sensorData: SENSOR_DATA,
  storage,
});

/** 后端连接状态：connecting/online/offline/unauthorized。 */
const backendStatus = ref<BackendSyncStatus>('connecting');
/** 后端相关提示（迁移完成、离线、写入失败等）。 */
const backendMessage = ref('');
/** 当前登录用户显示名。 */
const backendUser = ref('');
/** 当前登录用户资料（角色/权限/组织），null = 未登录或未加载。 */
const profile = ref<null | UserProfile>(null);
let initPromise: null | Promise<void> = null;
let profilePromise: null | Promise<void> = null;

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
    payload: Partial<
      CrudItem & CustomerProcItem & CustomerReqItem & TimelineItem
    >,
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

  /** 权限码同步到 Vben access store（供 v-access 指令与路由过滤使用）。 */
  function applyProfile(next: null | UserProfile) {
    profile.value = next;
    backendUser.value = next ? next.displayName || next.username : '';
    useAccessStore().setAccessCodes(next ? next.permissions : []);
  }

  /**
   * 加载当前用户资料与权限码（幂等）。
   * - 无 token：清空权限（匿名只读）
   * - /me 401：token 失效，清空权限（守卫会引导跳转登录页）
   * - 网络失败：保留 access store 持久化的上次权限码（离线场景），profile 置空
   */
  async function ensureProfile(): Promise<void> {
    if (profilePromise) return profilePromise;
    profilePromise = (async () => {
      if (!getStoredToken()) {
        applyProfile(null);
        return;
      }
      try {
        applyProfile(await api.me());
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'unauthorized') {
          applyProfile(null);
        }
      }
    })();
    try {
      await profilePromise;
    } finally {
      profilePromise = null;
    }
  }

  /**
   * 初始化后端连接：拉取远端数据（首次自动迁移 localStorage），
   * 失败时退化为本地模式或进入未登录状态。
   */
  async function initBackend(): Promise<void> {
    initPromise = null;
    backendStatus.value = 'connecting';
    backendMessage.value = '';
    backendUser.value = readTokenDisplayName() ?? '';
    const bridge = new BackendStorage({
      transport: {
        fetchStore: () => api.getStore(),
        writeKey: (key, value) => api.putKey(key, value),
        deleteKey: (key) => api.deleteKey(key),
        writeAll: (store) => api.replaceAll(store),
      },
      // 浏览器环境下 storage 恒为 window.localStorage（SSR 守卫仅用于类型安全）
      local: storage as StorageLike,
      migrateOnEmpty: true,
      // 全新环境（后端空库 + 本地无缓存）时，把内置基础数据种子导入后端
      seedDefaults: buildDefaultStore({
        crudDefaults: CRUD_DEFAULTS,
        sensorData: SENSOR_DATA,
      }),
      onStatus: (status) => {
        backendStatus.value = status;
      },
      onWriteFailure: (message) => {
        lastFailure.value = 'storage';
        backendMessage.value = `写入后端失败：${message}`;
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
    } else if (result.seeded) {
      backendMessage.value = '已将内置基础数据初始化到后端';
    }
    touch();
  }

  /** 确保后端已初始化（幂等，供挂载点调用）。 */
  function ensureBackendInit(): Promise<void> {
    if (!initPromise) {
      initPromise = initBackend().catch(() => {
        // 状态已通过回调反馈，避免未处理异常
      });
    }
    return initPromise;
  }

  /** 登录：校验账号密码，签发并保存 token 后重建数据层。 */
  async function login(username: string, password: string) {
    if (!username.trim() || !password) {
      return { ok: false as const, message: '请输入用户名和密码' };
    }
    try {
      const result = await api.login(username.trim(), password);
      storeToken(result.token);
      applyProfile(result);
      // 重建可访问路由/菜单（系统管理页按权限码出现）
      const { router } = await import('#/router');
      await refreshAccess(router, [
        ...result.permissions,
        ...result.roles.map((role) => role.code),
      ]);
      await initBackend();
      return { ok: true as const };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '登录失败，请重试';
      return { ok: false as const, message };
    }
  }

  /**
   * 登出：清除 token 与权限，重建为匿名只读路由（系统管理页消失），
   * 并跳转业务首页进入只读预览（右上角可点「登录」重新登录）。
   */
  async function logout() {
    storeToken(null);
    backendUser.value = '';
    applyProfile(null);
    const { router } = await import('#/router');
    await refreshAccess(router, []);
    await router.replace('/selection/customer');
    await initBackend();
  }

  /** 手动重连（离线/失败后）。 */
  function reconnect() {
    return ensureBackendInit();
  }

  return {
    backendMessage,
    backendStatus,
    backendUser,
    ensureProfile,
    profile,
    userRoleCodes: computed(() =>
      (profile.value?.roles ?? []).map((role) => role.code),
    ),
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
    ensureBackendInit,
    initBackend,
    entityGroups,
    entityHasData,
    extraMachineSections,
    generalStructureLabelMap,
    globalMachineSections,
    lastFailure,
    machineSectionRows,
    processSteps,
    resolvedMachineSections,
    login,
    logout,
    reconnect,
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
