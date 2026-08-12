import type {
  ControlledFileItem,
  CrudItem,
  CustomerProcItem,
  CustomerReqItem,
  DictionaryItem,
  EntityGroup,
  MachineRowImage,
  MachineSectionItem,
  MachineSectionRow,
  ProcessStepItem,
  SensorItem,
  SensorSopItem,
  SensorTypeDefinition,
  TimelineItem,
} from './data.js';

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
  | { item: T; ok: true }
  | { ok: false; reason: SaveFailure };
export type DeleteResult =
  | { ok: false; reason: Exclude<SaveFailure, 'duplicate'> }
  | { ok: true };

export type EntityKind = 'customer' | 'machine';

export interface EntityTreeItem {
  category: string;
  name: string;
}

export interface StorageLike {
  getItem(key: string): null | string;
  setItem(key: string, value: string): void;
}

export interface SelectionRepository {
  deleteControlledFile(entityName: string, id: number): DeleteResult;
  deleteCrud(listId: string, entityName: string, id: number): DeleteResult;
  deleteDictionaryItem(code: string, id: number): DeleteResult;
  deleteEntityGroup(kind: EntityKind, name: string): DeleteResult;
  deleteEntityItem(kind: EntityKind, name: string): DeleteResult;
  deleteExtraMachineSection(machineName: string, id: number): DeleteResult;
  deleteFeedbackType(id: number): DeleteResult;
  deleteGlobalMachineSection(id: number): DeleteResult;
  deleteMachineSectionRow(
    sectionId: number,
    machineName: string,
    id: number,
  ): DeleteResult;
  deleteProcessStep(id: number): DeleteResult;
  deleteSensor(id: number): DeleteResult;
  deleteSensorSop(id: number): DeleteResult;
  ensureGeneralStructureSection(
    itemName: string,
  ): SaveResult<MachineSectionItem>;
  entityHasData(kind: EntityKind, entityName: string): boolean;
  findGeneralStructureSection(itemName: string): {
    section: MachineSectionItem;
    via: 'label' | 'name';
  } | null;
  getControlledDocuments(entityName: string): ControlledFileItem[];
  getCrud(
    listId: string,
    entityName: string,
  ): Array<CrudItem | CustomerProcItem | CustomerReqItem | TimelineItem>;
  getDictionaryItems(code: string): DictionaryItem[];
  getEntityGroups(kind: EntityKind): EntityGroup[];
  getExtraMachineSections(machineName: string): MachineSectionItem[];
  getFeedbackTypes(): DictionaryItem[];
  getGeneralStructureLabelMap(): Record<number, string>;
  getGlobalMachineSections(): MachineSectionItem[];
  getMachineSectionRows(
    sectionId: number,
    machineName: string,
  ): MachineSectionRow[];
  getProcessSteps(): ProcessStepItem[];
  getSensors(): SensorItem[];
  getSensorSops(): SensorSopItem[];
  listResolvedMachineSections(machineName: string): MachineSectionItem[];
  replaceFromStorage(rawValue: null | string): void;
  saveControlledFile(
    entityName: string,
    attachment: {
      dataUrl: string;
      fileName: string;
      mimeType: string;
      size: number;
      uploadedAt: string;
    },
  ): SaveResult<ControlledFileItem>;
  saveCrud(
    listId: string,
    entityName: string,
    payload: Partial<
      CrudItem & CustomerProcItem & CustomerReqItem & TimelineItem
    >,
    editId?: number,
  ): SaveResult<CrudItem | CustomerProcItem | CustomerReqItem | TimelineItem>;
  saveDictionaryItem(
    code: string,
    payload: Partial<DictionaryItem>,
    editId?: number,
  ): SaveResult<DictionaryItem>;
  saveEntityGroup(
    kind: EntityKind,
    payload: { name: string },
    editName?: string,
  ): SaveResult<EntityGroup>;
  saveEntityItem(
    kind: EntityKind,
    payload: { category: string; name: string },
    editName?: string,
  ): SaveResult<EntityTreeItem>;
  saveExtraMachineSection(
    machineName: string,
    payload: Partial<MachineSectionItem>,
    editId?: number,
  ): SaveResult<MachineSectionItem>;
  saveFeedbackType(
    payload: Partial<DictionaryItem>,
    editId?: number,
  ): SaveResult<DictionaryItem>;
  saveGlobalMachineSection(
    payload: Partial<MachineSectionItem>,
    editId?: number,
  ): SaveResult<MachineSectionItem>;
  saveMachineSectionRow(
    sectionId: number,
    machineName: string,
    payload: Partial<MachineSectionRow>,
    editId?: number,
  ): SaveResult<MachineSectionRow>;
  saveProcessStep(
    payload: Partial<ProcessStepItem>,
    editId?: number,
  ): SaveResult<ProcessStepItem>;
  replaceSensorCurrent(
    alternateId: number,
    currentId: number,
    problemNote: string,
  ): SaveResult<SensorItem>;
  saveSensor(
    payload: Partial<SensorItem>,
    editId?: number,
  ): SaveResult<SensorItem>;
  saveSensorSop(
    payload: Partial<SensorSopItem>,
    editId?: number,
  ): SaveResult<SensorSopItem>;
  syncGeneralStructureItemRename(
    fromName: string,
    toName: string,
  ): SaveResult<MachineSectionItem>;
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
export const CONTROLLED_FILE_ACCEPT: string;
export const CONTROLLED_FILE_RULES: Record<
  'pdf' | 'word',
  {
    accept: string;
    extensions: string[];
    maxBytes: number;
    mimeTypes: string[];
  }
>;
export function createDictionaryDefaults(code: string): DictionaryItem[];
export function normalizeDictionaryItems(
  sourceItems: unknown[],
): DictionaryItem[];
export function normalizeEntityGroups(sourceGroups: unknown[]): EntityGroup[];
export function createFeedbackTypeDefaults(): DictionaryItem[];
export function normalizeFeedbackTypes(
  sourceItems: unknown[],
): DictionaryItem[];
export function createDefaultControlledDocuments(): ControlledFileItem[];
export function detectControlledFileKind(
  fileName: string,
  mimeType: string,
): 'pdf' | 'word' | null;
export function normalizeControlledDocuments(
  sourceItems: unknown[],
): ControlledFileItem[];
export function validateControlledUpload(
  kind: 'pdf' | 'word',
  fileName: string,
  mimeType: string,
  size: number,
): { ok: false; reason: 'size' | 'type' | 'validation' } | { ok: true };
export function parsePersistedStore(
  rawValue: null | string,
): Record<string, unknown[]>;
export function normalizeCrudItems(
  listId: string,
  sourceItems: unknown[],
): Array<CrudItem | CustomerProcItem | CustomerReqItem | TimelineItem>;
export function normalizeSensorItems(
  sourceItems: unknown[],
  allowedTypes?: string[],
  allowedStatuses?: string[],
): SensorItem[];
export function createSensorCatalogDefaults(
  sensorData: Record<string, SensorTypeDefinition>,
): SensorItem[];
export function normalizeProcessSteps(
  sourceItems: unknown[],
): ProcessStepItem[];
export function normalizeMachineSections(
  source: unknown[],
  options?: { allowNotes?: boolean },
): MachineSectionItem[];
export function normalizeMachineRowImage(raw: unknown): MachineRowImage | null;
export function normalizeMachineSectionRows(
  source: unknown[],
  options?: { allowImage?: boolean },
): MachineSectionRow[];
export function validateMachineRowImage(
  fileName: string,
  mimeType: string,
  size: number,
): { ok: false; reason: 'size' | 'type' | 'validation' } | { ok: true };
export function formatLocalDate(date: Date): string;
export function formatLocalDateTime(date: Date): string;
export function createSelectionRepository(options: {
  crudDefaults: Record<
    string,
    (entityName: string) => Array<
      CrudItem | CustomerProcItem | CustomerReqItem | TimelineItem
    >
  >;
  sensorData: Record<string, SensorTypeDefinition>;
  storage?: StorageLike;
}): SelectionRepository;
export function buildSearchIndex(options: {
  customerGroups: EntityGroup[];
  machineDetails: Record<string, { desc?: string }>;
  machineGroups: EntityGroup[];
  machineSectionHits?: SearchItem[];
  processSteps: ProcessStepItem[];
  sensors: SensorItem[];
}): SearchItem[];
