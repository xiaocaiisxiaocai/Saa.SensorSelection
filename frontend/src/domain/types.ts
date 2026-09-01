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
  { item: T; ok: true } | { ok: false; reason: SaveFailure };

export type DeleteResult =
  { ok: false; reason: Exclude<SaveFailure, 'duplicate'> } | { ok: true };

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

export interface MachineProcessItem {
  id: number;
  name: string;
  sort: number;
  locked?: boolean;
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
  writeKey(key: string, value: unknown[]): Promise<unknown[] | void>;
  deleteKey?(key: string): Promise<void>;
  writeAll(store: Record<string, unknown[]>): Promise<void>;
}

export interface BackendStorageOptions {
  transport: BackendStoreTransport;
  local: StorageLike;
  onStatus?: (status: BackendSyncStatus) => void;
  onWriteFailure?: (message: string) => void;
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
