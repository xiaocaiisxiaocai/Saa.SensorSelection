export interface EntityGroup {
  name: string;
  items: string[];
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

export interface TimelineItem {
  id: number;
  type: string;
  machine: string;
  problem: string;
  measure: string;
  date: string;
  status: string;
}

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
  /** 可选料号 */
  partNumber: string;
  sensorType: string;
  brand: string;
  model: string;
  spec: string;
  feature: string;
  scene: string;
  /** 关联的 Sensor SOP id，未关联时为 null */
  sopId: null | number;
  /** 作为现用时，替换掉的旧型号 id */
  replacesId: null | number;
  /** 被停用时，接替它的新型号 id */
  replacedById: null | number;
  /** 替换问题点（双方同文） */
  problemNote: string;
  /** 替换发生日期 YYYY-MM-DD */
  replacedAt: string;
}

export interface SensorSopItem {
  id: number;
  title: string;
  dataUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

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
  kind: 'pdf' | 'word';
}

export type MachineSectionKind = 'notes' | 'structure';

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
  field?: 'layer' | 'sensorType' | 'status' | 'type';
  catalog?: 'machine-section' | 'process-step' | 'sensor';
}

export interface EntityKindDefinition {
  kind: 'customer' | 'machine';
  label: string;
  groupLabel: string;
  listIds: string[];
  hasControlledFiles: boolean;
  seedGroups: EntityGroup[];
}

export const CUSTOMER_GROUPS: EntityGroup[];
export const PROCESS_GROUPS: EntityGroup[];
export const MACHINE_GROUPS: EntityGroup[];
export const PROCESS_DETAILS: Record<string, EntityDetail>;
export const MACHINE_DETAILS: Record<string, EntityDetail>;
export const SENSOR_DATA: Record<string, SensorTypeDefinition>;
export const CRUD_DEFAULTS: Record<
  string,
  (
    entityName: string,
  ) => Array<CrudItem | CustomerProcItem | CustomerReqItem | TimelineItem>
>;
export const FEEDBACK_TYPE_OPTIONS: string[];
export const FEEDBACK_TYPE_DEFAULTS: DictionaryItem[];
export const FEEDBACK_STATUS_OPTIONS: string[];
export const CUSTOMER_REQ_SOURCE_OPTIONS: string[];
export const CUSTOMER_REQ_SOURCE_DEFAULTS: DictionaryItem[];
export const PROCESS_LAYER_OPTIONS: string[];
export function createProcessStepDefaults(): ProcessStepItem[];
export const SENSOR_STATUS_OPTIONS: string[];
export const SENSOR_TYPE_OPTIONS: string[];
export const CRUD_TYPE_OPTIONS: Record<string, string[]>;
export const MACHINE_SECTION_SEED: MachineSectionItem[];
export const GENERAL_STRUCTURE_CATEGORY: string;
export const GENERAL_STRUCTURE_SECTION_LABELS: Record<number, string>;
export const MACHINE_SECTION_LEGACY_MAP: Record<string, number>;
export const MACHINE_ROW_IMAGE_RULES: {
  accept: string;
  extensions: string[];
  maxBytes: number;
  mimeTypes: string[];
};
export const DICTIONARY_DEFINITIONS: DictionaryDefinition[];
export const ENTITY_KIND_DEFINITIONS: EntityKindDefinition[];
export function createEntityGroupDefaults(
  kind: 'customer' | 'machine',
): EntityGroup[];
