import type {
  CrudItem,
  EntityDetail,
  EntityGroup,
  SensorItem,
  SensorTypeDefinition,
  TimelineItem,
} from './data.js';

export type SaveFailure = 'duplicate' | 'stale' | 'storage' | 'validation';
export type SaveResult<T> =
  | { item: T; ok: true }
  | { ok: false; reason: SaveFailure };
export type DeleteResult =
  | { ok: false; reason: Exclude<SaveFailure, 'duplicate' | 'validation'> }
  | { ok: true };

export interface StorageLike {
  getItem(key: string): null | string;
  setItem(key: string, value: string): void;
}

export interface SelectionRepository {
  deleteCrud(listId: string, entityName: string, id: number): DeleteResult;
  deleteSensor(id: number): DeleteResult;
  getCrud(listId: string, entityName: string): Array<CrudItem | TimelineItem>;
  getSensors(): SensorItem[];
  replaceFromStorage(rawValue: null | string): void;
  saveCrud(
    listId: string,
    entityName: string,
    payload: Partial<CrudItem & TimelineItem>,
    editId?: number,
  ): SaveResult<CrudItem | TimelineItem>;
  saveSensor(
    payload: Partial<SensorItem>,
    editId?: number,
  ): SaveResult<SensorItem>;
}

export interface SearchItem {
  category: string;
  path: string;
  query: Record<string, string>;
  sub: string;
  title: string;
  type: 'customer' | 'machine' | 'process' | 'sensor';
}

export const STORAGE_KEY: string;
export function parsePersistedStore(
  rawValue: null | string,
): Record<string, unknown[]>;
export function normalizeCrudItems(
  listId: string,
  sourceItems: unknown[],
): Array<CrudItem | TimelineItem>;
export function normalizeSensorItems(
  sourceItems: unknown[],
  sensorTypes: Record<string, SensorTypeDefinition>,
): SensorItem[];
export function createSensorCatalogDefaults(
  sensorData: Record<string, SensorTypeDefinition>,
): SensorItem[];
export function formatLocalDate(date: Date): string;
export function createSelectionRepository(options: {
  crudDefaults: Record<
    string,
    (entityName: string) => Array<CrudItem | TimelineItem>
  >;
  sensorData: Record<string, SensorTypeDefinition>;
  storage?: StorageLike;
}): SelectionRepository;
export function buildSearchIndex(options: {
  customerGroups: EntityGroup[];
  machineDetails: Record<string, EntityDetail>;
  machineGroups: EntityGroup[];
  processDetails: Record<string, EntityDetail>;
  processGroups: EntityGroup[];
  sensors: SensorItem[];
}): SearchItem[];
