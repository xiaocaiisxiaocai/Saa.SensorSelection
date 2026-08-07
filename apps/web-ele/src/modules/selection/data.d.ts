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

export interface TimelineItem {
  id: number;
  date: string;
  title: string;
  desc: string;
  actions: string;
  status: 'pending' | 'processing' | 'resolved';
}

export interface SensorItem {
  id: number;
  status: '备选' | '现用';
  sensorType: string;
  brand: string;
  model: string;
  spec: string;
  feature: string;
  scene: string;
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

export const CUSTOMER_GROUPS: EntityGroup[];
export const PROCESS_GROUPS: EntityGroup[];
export const MACHINE_GROUPS: EntityGroup[];
export const PROCESS_DETAILS: Record<string, EntityDetail>;
export const MACHINE_DETAILS: Record<string, EntityDetail>;
export const SENSOR_DATA: Record<string, SensorTypeDefinition>;
export const CRUD_DEFAULTS: Record<
  string,
  (entityName: string) => Array<CrudItem | TimelineItem>
>;
export const CRUD_TYPE_OPTIONS: Record<string, string[]>;
export const CRUD_COLUMN_LABELS: Record<string, string[]>;
