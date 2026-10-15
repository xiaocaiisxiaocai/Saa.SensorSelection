export type SaveFailure =
  | 'duplicate'
  | 'in-use'
  | 'not-empty'
  | 'size'
  | 'stale'
  | 'storage'
  | 'type'
  | 'validation';

export type SaveResult<T> =
  { item: T; ok: true } | { ok: false; reason: SaveFailure; message?: string };

export type DeleteResult =
  | {
      ok: false;
      reason: Exclude<SaveFailure, 'duplicate'>;
      message?: string;
    }
  | { ok: true };

export type ReorderResult =
  { ok: false; reason: 'stale' | 'storage' | 'validation' } | { ok: true };

export type EntityKind = 'customer' | 'machine';
export type MachineCatalogKind = 'mechanism' | 'project';

export interface EntityConfiguration {
  name: string;
  items: string[];
}

export interface EntityGroup {
  name: string;
  items: string[];
  configurations?: EntityConfiguration[];
  machineType?: MachineCatalogKind;
}

export interface EntityTreeItem {
  category: string;
  configuration?: string | null;
  name: string;
}

export interface CrudItem {
  id: number;
  type: string;
  name: string;
  desc: string;
  note: string;
}

export interface CustomerReqItem {
  id: number;
  type: string;
  machine: string;
  process: string;
  content: string;
  source: string;
  note: string;
}

export interface CustomerProcItem {
  id: number;
  type: string;
  role: string;
  feature: string;
  sensorNote: string;
  note: string;
}

export interface FeedbackMeasureHistoryEntry {
  measure: string;
  date: string;
  status: '已作废' | '现行';
}

export interface TimelineItem {
  id: number;
  type: string;
  machine: string;
  problem: string;
  measure: string;
  date: string;
  status: string;
  measureHistory: FeedbackMeasureHistoryEntry[];
}

export type CrudRecord =
  CrudItem | CustomerProcItem | CustomerReqItem | TimelineItem;

export type CrudSeedRow = CrudRecord | MachineSectionRow;

export interface DictionaryItem {
  id: number;
  name: string;
  sort: number;
}

export interface ProcessStepItem {
  id: number;
  layer: string;
  name: string;
  role: string;
  feature: string;
  note: string;
}

export interface SensorItem {
  id: number;
  status: string;
  partNumber: string;
  sensorType: string;
  brand: string;
  model: string;
  spec: string;
  feature: string;
  scene: string;
  sopId: null | number;
  model3dId: null | number;
  replacesId: null | number;
  replacedById: null | number;
  problemNote: string;
  replacedAt: string;
}

export interface SensorFileItem {
  id: number;
  title: string;
  dataUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export type SensorSopItem = SensorFileItem;
export type SensorSopFileItem = SensorFileItem;
export type Sensor3dFileItem = SensorFileItem;

export interface SensorTypeDefinition {
  desc: string;
  notes: string;
  scenes: string[];
  models: Array<{ brand: string; model: string; spec: string }>;
}

export interface EntityDetail {
  desc: string;
  files?: Array<{ name: string; note: string; size: string }>;
}

export interface ControlledFileAttachment {
  dataUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface ControlledFileItem extends ControlledFileAttachment {
  id: number;
  kind: 'pdf' | 'ppt' | 'word';
}

export type MachineSectionKind = 'notes' | 'structure';

/**
 * 机型页顶部的 Tab：按目录（结构 / 专案机型）共用的一组容器。
 * 二级 Tab（页）属于「左侧选单节点 × Tab」：选中某个节点时只显示它自己的二级 Tab。
 */
export interface MachineTab {
  id: number;
  catalog: MachineCatalogKind;
  name: string;
  sort: number;
  /** 决定 Tab 下各页内容的格式：结构选型表或注意事项表 */
  kind: MachineSectionKind;
  /** 二级 Tab，按显示顺序 */
  pages: MachineTabPage[];
}

/**
 * 左侧选单里的一个节点：分类（只有 category）、配置（再带 configuration）
 * 或机型（再带 item）。
 */
export interface MachineNodeRef {
  category: string;
  configuration: string | null;
  item: string | null;
}

/**
 * 二级 Tab：属于某个选单节点（node）。节点的下一层只能二选一——
 * 有子选单就不能有二级 Tab，有二级 Tab 就不能再加子选单。
 * 机型（最末一层）没有二级 Tab：它在每个一级 Tab 下只有一张直属表格，
 * 也用这个结构存（direct: true，名称同一级 Tab，界面上不显示成二级 Tab）。
 * 名称在同一 Tab、同一节点内不重复；id 在所有 Tab 间唯一，内容按 id 存放。
 */
export interface MachineTabPage {
  id: number;
  name: string;
  node: MachineNodeRef;
  /** 机型在该一级 Tab 下的直属表格 */
  direct?: true;
}

export interface MachineSectionItem {
  id: number;
  name: string;
  sort: number;
  kind: MachineSectionKind;
  locked?: boolean;
  scope: 'global' | 'machine';
}

export interface MachineRowImage {
  dataUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface MachineSectionRow {
  id: number;
  role: string;
  machineModelId: number | null;
  processStepId: number | null;
  boardCharacteristicId: number | null;
  sensorIds: number[];
  sensorType: string;
  spec: string;
  purpose: string;
  name: string;
  desc: string;
  note: string;
  image?: MachineRowImage | null;
}

export interface DictionaryDefinition {
  code: string;
  title: string;
  description: string;
  listIds: string[];
  defaults: string[];
  field?: 'layer' | 'sensorType' | 'source' | 'status' | 'type';
  catalog?: 'process-step' | 'sensor';
  machineRowField?: 'machineModelId' | 'boardCharacteristicId';
}

export interface EntityKindDefinition {
  kind: EntityKind;
  label: string;
  groupLabel: string;
  listIds: string[];
  hasControlledFiles: boolean;
  seedGroups: EntityGroup[];
}

export interface SearchItem {
  category: string;
  path: string;
  query: Record<string, string>;
  sub: string;
  title: string;
  type: 'customer' | 'machine' | 'process' | 'sensor';
}

export type PersistedStore = Record<string, unknown[]>;

export interface StorageLike {
  getItem(key: string): null | string;
  setItem(key: string, value: string): boolean | void;
}

export type BackendSyncStatus =
  'connecting' | 'offline' | 'online' | 'unauthorized';

export interface BackendStoreTransport {
  fetchStore(): Promise<Record<string, unknown[]>>;
  /** context：入队时 captureContext 取到的值（如操作日志的操作编号），原样带给后端 */
  writeKey(
    key: string,
    value: unknown[],
    context?: unknown,
  ): Promise<unknown[] | void>;
  deleteKey?(key: string, context?: unknown): Promise<void>;
  writeAll(store: Record<string, unknown[]>): Promise<void>;
}

export interface BackendStorageOptions {
  transport: BackendStoreTransport;
  /** 后端成功后的本地快照；不传则不做快照（省掉每次写入后的全量序列化）。 */
  local?: StorageLike;
  onStatus?: (status: BackendSyncStatus) => void;
  onWriteFailure?: (message: string) => void;
  /**
   * 写入入队时同步调用，返回值随这次写入交给 transport。写入是排队异步发出的，
   * 必须在入队那一刻取，才能知道它属于哪一次界面操作。
   */
  captureContext?: () => unknown;
  migrateOnEmpty?: boolean;
  seedDefaults?: Record<string, unknown[]>;
  seedMigration?: (
    store: PersistedStore,
    currentVersion: number,
    targetVersion: number,
  ) => { changed: boolean; store: PersistedStore };
}

export interface BackendInitResult {
  migrated: boolean;
  seeded: boolean;
  keyCount: number;
  status: BackendSyncStatus;
}

export type CrudDefaults = Record<
  string,
  (entityName: string) => CrudSeedRow[]
>;
