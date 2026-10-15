import { runAsOperation } from '@/api/audit-operation';
import {
  MACHINE_TAB_PAGE_OWNER,
  type EntityKind,
  type MachineNodeRef,
} from '@/domain';

/*
 * 业务写入在操作日志里显示的「操作」名称。store 的每个写方法在 runAsOperation
 * 里执行：这一下产生的全部写入共用一个操作编号和这里的名称。
 * 新增写方法时在这里补一条（store 的测试会检查漏了哪个）。
 */

const LIST_LABELS: Record<string, string> = {
  'customer-feedback': '厂外反馈问题项',
  'customer-proc': '制程注意事项',
  'customer-req': '客户通用要求',
  'customer-sop': '感应器选用标准',
};

function quoted(name: string | null | undefined): string {
  return name ? `「${name}」` : '';
}

/** 编辑时改了名就写「旧名」→「新名」，否则写当前名称 */
function target(editName: string | undefined, name: string): string {
  return editName && name && editName !== name
    ? `${quoted(editName)}→${quoted(name)}`
    : quoted(editName || name);
}

function onMachine(name: string): string {
  return name && name !== MACHINE_TAB_PAGE_OWNER ? ` · ${name}` : '';
}

function verb(editing: unknown, create = '新增'): string {
  return editing === undefined || editing === null || editing === ''
    ? create
    : '编辑';
}

function groupLabel(kind: EntityKind): string {
  return kind === 'machine' ? '分类' : '客户';
}

function itemLabel(kind: EntityKind): string {
  return kind === 'machine' ? '机型' : '区域';
}

type Labeler = (...args: never[]) => string;

export const OPERATION_LABELS = {
  deleteControlledFile: () => '删除文件',
  deleteCrud: (listId: string, entityName: string) =>
    `删除${LIST_LABELS[listId] ?? '记录'} · ${entityName}`,
  deleteDictionaryItem: () => '删除字典项',
  deleteEntityGroup: (kind: EntityKind, name: string) =>
    `删除${groupLabel(kind)}${quoted(name)}`,
  deleteEntityItem: (kind: EntityKind, name: string, category?: string) =>
    kind === 'customer'
      ? `删除区域${quoted(category ? `${category}/${name}` : name)}`
      : `删除机型${quoted(name)}`,
  deleteExtraMachineSection: () => '删除机型页签',
  deleteGlobalMachineSection: () => '删除公共页签',
  deleteMachineConfiguration: (_category: string, name: string) =>
    `删除配置${quoted(name)}`,
  deleteMachineSectionRow: (_sectionId: number, machineName: string) =>
    `删除选型记录${onMachine(machineName)}`,
  deleteMachineTab: () => '删除 Tab',
  deleteMachineTabPage: () => '删除二级 Tab',
  deleteProcessIntroFile: () => '删除制程介绍文件',
  deleteProcessStep: () => '删除工艺制程',
  deleteSensor: () => '删除 Sensor 型号',
  deleteSensor3dFile: () => '删除 3D 文件',
  deleteSensorSop: () => '删除型录',
  deleteSensorSopFile: () => '删除 Sensor SOP',
  ensureMachineDirectPage: (_tabId: number, node: MachineNodeRef) =>
    `新建表格${onMachine(node.item ?? node.configuration ?? node.category)}`,
  importSensors: () => '导入 Sensor 型号',
  moveMachineTabPage: () => '调整二级 Tab 顺序',
  reorderEntityGroups: (kind: EntityKind) => `调整${groupLabel(kind)}顺序`,
  reorderEntityItems: (kind: EntityKind, groupName: string) =>
    `调整${itemLabel(kind)}顺序 · ${groupName}`,
  replaceSensorCurrent: () => '用备选替换现用型号',
  restoreDictionaries: () => '还原数据字典',
  saveControlledFile: () => '上传文件',
  saveCrud: (
    listId: string,
    entityName: string,
    _payload: unknown,
    editId?: number,
  ) => `${verb(editId)}${LIST_LABELS[listId] ?? '记录'} · ${entityName}`,
  saveDictionaryItem: (_code: string, _payload: unknown, editId?: number) =>
    `${verb(editId)}字典项`,
  saveEntityGroup: (
    kind: EntityKind,
    payload: { name: string },
    editName?: string,
  ) =>
    `${verb(editName, '新建')}${groupLabel(kind)}${target(editName, payload.name)}`,
  saveEntityItem: (
    kind: EntityKind,
    payload: { name: string },
    editName?: string,
  ) =>
    `${verb(editName, '新建')}${itemLabel(kind)}${target(editName, payload.name)}`,
  saveExtraMachineSection: () => '保存机型页签',
  saveGlobalMachineSection: () => '保存公共页签',
  saveMachineConfiguration: (
    _category: string,
    payload: { name: string },
    editName?: string,
  ) => `${verb(editName, '新建')}配置${target(editName, payload.name)}`,
  saveMachineDirectRow: (_tabId: number, node: MachineNodeRef) =>
    `新增选型记录${onMachine(node.item ?? '')}`,
  saveMachineRowsImage: (_sectionId: number, machineName: string) =>
    `更换示意图${onMachine(machineName)}`,
  saveMachineSectionImages: (_sectionId: number, machineName: string) =>
    `保存示意图${onMachine(machineName)}`,
  saveMachineSectionRow: (
    _sectionId: number,
    machineName: string,
    _payload: unknown,
    editId?: number,
  ) => `${verb(editId)}选型记录${onMachine(machineName)}`,
  saveMachineTab: (
    _catalog: unknown,
    payload: { name?: string },
    editId?: number,
  ) => `${verb(editId, '新建')} Tab${quoted(payload.name)}`,
  saveMachineTabPage: (
    _tabId: number,
    payload: { name?: string },
    editId?: number,
  ) =>
    `${editId === undefined ? '新建' : '改名'}二级 Tab${quoted(payload.name)}`,
  saveProcessIntroFile: () => '上传制程介绍文件',
  saveProcessStep: (_payload: unknown, editId?: number) =>
    `${verb(editId)}工艺制程`,
  saveSensor: (payload: { model?: string }, editId?: number) =>
    `${verb(editId)} Sensor 型号${quoted(payload.model)}`,
  saveSensor3dFile: () => '保存 3D 文件',
  saveSensorSop: () => '保存型录',
  saveSensorSopFile: () => '保存 Sensor SOP',
} satisfies Record<string, Labeler>;

/** 名称算不出来时（参数不合法）照样执行写入，只是不带名称 */
function safeLabel(labeler: Labeler, args: unknown[]): string | undefined {
  try {
    return (labeler as (...values: unknown[]) => string)(...args);
  } catch {
    return undefined;
  }
}

/** 把 store 里有名称的写方法包进 runAsOperation，其余属性原样返回 */
export function labelOperations<T extends object>(target: T): T {
  const wrapped = { ...target } as Record<string, unknown>;
  for (const [name, labeler] of Object.entries(OPERATION_LABELS)) {
    const method = wrapped[name];
    if (typeof method !== 'function') continue;
    wrapped[name] = (...args: unknown[]) =>
      runAsOperation(safeLabel(labeler as Labeler, args), () =>
        (method as (...values: unknown[]) => unknown)(...args),
      );
  }
  return wrapped as T;
}
