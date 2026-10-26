import type {
  AuditChangeSummary,
  AuditLogItem,
  AuditOperationItem,
  AuditRowChange,
} from '@/api';
import { formatAuditTarget } from '@/pages/system/audit-target';

import { ACTION_LABELS, actionLabel, parseAuditDetail } from './audit-actions';

/*
 * 操作日志的变更明细：后端记下的是数据里的原始字段名（content、sensorIds…），
 * 这里翻成页面上的叫法，再拼出列表里一行字的「变更摘要」。
 */

/** 各类数据通用的字段名 */
const FIELD_LABELS: Record<string, string> = {
  boardCharacteristicId: '板件特性',
  brand: '品牌',
  actualCondition: '实际工况',
  catalog: '目录',
  configurations: '配置',
  content: '要求内容',
  dataUrl: '文件',
  date: '反馈时间',
  disabledAt: '停用日期',
  enteredAt: '录入日期',
  desc: '说明',
  feature: '特性',
  fileName: '文件名',
  image: '示意图',
  images: '图片',
  items: '条目',
  kind: '类型',
  layer: '制程',
  locked: '锁定',
  machine: '适用机型',
  machineModelId: '机型',
  machineType: '目录类型',
  measure: '改善对策',
  measureHistory: '对策历史',
  mimeType: '文件类型',
  model: '型号',
  model3dId: '关联 3D',
  name: '名称',
  note: '备注',
  pages: '二级 Tab',
  partNumber: '料号',
  problem: '问题点',
  problemNote: '问题点',
  process: '适用制程',
  processStepId: '工艺制程',
  purpose: '作用',
  replacedAt: '替换时间',
  replacedById: '被替换为',
  replacesId: '替换的型号',
  role: '作用',
  scene: '适用场景',
  scope: '范围',
  sensorIds: '关联传感器',
  sensorNote: 'sensor使用注意事项',
  sensorType: '感应器类型',
  size: '大小',
  sopId: '关联型录',
  sort: '排序',
  source: '来源',
  spec: '规格参数',
  status: '状态',
  title: '标题',
  type: '分类',
  uploadedAt: '上传时间',
  usedAt: '使用日期',
  version: '版本',
};

/** 同一个字段名在不同数据里叫法不同；键是数据 key 的命名空间（客户/机型目录细到种类） */
const NAMESPACE_FIELD_LABELS: Record<string, Record<string, string>> = {
  'customer-feedback': { status: '处理状态', type: '问题分类' },
  'customer-proc': { feature: '制程特性', role: '制程作用', type: '制程分类' },
  'customer-req': { type: '要求分类' },
  'entity-groups:customer': { items: '厂区', name: '客户', regions: '区域' },
  'entity-groups:machine': { items: '机型', name: '分类' },
  'machine-section-rows': { name: '事项名称', role: 'Sensor名称' },
  'process-steps': { feature: '制程特性', name: '工艺制程', role: '作用' },
  'sensor-catalog': { feature: '特性与注意' },
};

/** 日志目标对应的数据命名空间；不是数据 key（用户 / 角色 / 组织）时为 null */
export function targetNamespace(
  target: null | string | undefined,
): null | string {
  const raw = target?.trim();
  if (!raw) return null;
  const at = raw.indexOf(':');
  if (at <= 0) return null;
  const namespace = raw.slice(0, at);
  return namespace === 'entity-groups' ? raw : namespace;
}

export function fieldLabel(namespace: null | string, field: string): string {
  return (
    (namespace ? NAMESPACE_FIELD_LABELS[namespace]?.[field] : undefined) ??
    FIELD_LABELS[field] ??
    field
  );
}

export function parseChanges(
  json: null | string | undefined,
): AuditChangeSummary | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<AuditChangeSummary>;
    if (!value || typeof value !== 'object') return null;
    return {
      added: value.added ?? [],
      removed: value.removed ?? [],
      modified: value.modified ?? [],
      addedCount: value.addedCount ?? value.added?.length ?? 0,
      removedCount: value.removedCount ?? value.removed?.length ?? 0,
      modifiedCount: value.modifiedCount ?? value.modified?.length ?? 0,
      reordered: Boolean(value.reordered),
      truncated: Boolean(value.truncated),
    };
  } catch {
    return null;
  }
}

const MAX_NAMES = 2;
const MAX_FIELDS = 3;

function names(rows: AuditRowChange[], count: number): string {
  const shown = rows.slice(0, MAX_NAMES).map((row) => `「${row.label}」`);
  return count > shown.length ? `${shown.join('')} 等` : shown.join('');
}

function countText(count: number): string {
  return count > 1 ? ` ${count} 条` : '';
}

/** 一条日志改了什么，压成一句话；没有任何改动时为空串 */
export function changeSummaryText(
  summary: AuditChangeSummary,
  namespace: null | string,
): string {
  const parts: string[] = [];
  if (summary.modifiedCount > 0) {
    const fields = [
      ...new Set(
        summary.modified.flatMap((row) =>
          row.fields.map((field) => fieldLabel(namespace, field.name)),
        ),
      ),
    ];
    const fieldText =
      fields.length > MAX_FIELDS
        ? `${fields.slice(0, MAX_FIELDS).join('、')} 等`
        : fields.join('、');
    parts.push(
      `修改${countText(summary.modifiedCount)}${names(summary.modified, summary.modifiedCount)}${fieldText ? `：${fieldText}` : ''}`,
    );
  }
  if (summary.addedCount > 0) {
    parts.push(
      `新增${countText(summary.addedCount)}${names(summary.added, summary.addedCount)}`,
    );
  }
  if (summary.removedCount > 0) {
    parts.push(
      `删除${countText(summary.removedCount)}${names(summary.removed, summary.removedCount)}`,
    );
  }
  if (summary.reordered) parts.push('调整了顺序');
  return parts.join('；');
}

/** 「数据类型：数组；记录数：1」这类旧格式没有信息量，摘要里不显示 */
const UNINFORMATIVE_DETAIL = /^数据类型：|^删除目标：/;

const STORE_ACTIONS = new Set([
  'store.delete',
  'store.entity-groups.reorder',
  'store.upsert',
]);

/** 记录变更明细之后写的日志（之前的日志迁移时操作编号补成 legacy-） */
export function isRecorded(entry: AuditLogItem): boolean {
  return (
    Boolean(entry.operationId) && !entry.operationId!.startsWith('legacy-')
  );
}

/** 记了明细却没有改动的数据写入：删的是空表，或写入的内容和原来一样 */
export function unchangedStoreWrite(entry: AuditLogItem): boolean {
  return (
    entry.result &&
    !entry.changes &&
    isRecorded(entry) &&
    STORE_ACTIONS.has(entry.action)
  );
}

/** 一条日志在摘要里的那句话 */
export function entrySummary(entry: AuditLogItem): string {
  if (!entry.result) return entry.error ? `失败：${entry.error}` : '失败';
  const summary = parseChanges(entry.changes);
  if (summary) {
    const text = changeSummaryText(summary, targetNamespace(entry.target));
    if (text) return text;
  }
  // 新日志（有操作编号、不是迁移补上的 legacy-）一定记了改动；没有就是内容本来为空 / 没变
  if (unchangedStoreWrite(entry)) {
    return entry.action === 'store.delete'
      ? '删除（原本没有内容）'
      : '内容没有变化';
  }
  const detail = entry.detail?.trim();
  if (!detail || UNINFORMATIVE_DETAIL.test(detail)) return '';
  const parsed = parseAuditDetail(detail);
  return parsed?.summary || detail;
}

/** 列表里「操作」一列：前端传来的名称，没有时用第一条日志的操作类型 */
export function operationTitle(operation: AuditOperationItem): string {
  if (operation.label) return operation.label;
  const first = operation.entries[0];
  return first ? actionLabel(first.action) : '—';
}

/** 一条日志的对象：上传或下载的目标是文件编号，换成详情里的文件名 */
export function entryObject(entry: AuditLogItem): string {
  if (entry.action === 'file.upload' || entry.action === 'file.download') {
    const fileName = parseAuditDetail(entry.detail)?.pairs.find(
      (pair) => pair.label === '文件名',
    )?.value;
    if (fileName) return fileName;
  }
  return formatAuditTarget(entry.target);
}

/** 列表里「对象」一列：第一条日志的目标，多个目标时注明一共几项 */
export function operationObject(operation: AuditOperationItem): string {
  const targets = [
    ...new Set(operation.entries.map(entryObject).filter(Boolean)),
  ];
  if (targets.length === 0) return '—';
  return targets.length > 1
    ? `${targets[0]} 等 ${targets.length} 项`
    : targets[0]!;
}

/**
 * 列表里「变更摘要」一列：失败的说原因；成功的把各条改动拼起来，
 * 最多三句，多出来的用「等 N 项改动」带过。旧日志没有记录改动时为空串。
 */
export function operationSummary(operation: AuditOperationItem): string {
  const failed = operation.entries.find((entry) => !entry.result);
  if (failed) return entrySummary(failed);
  const parts = [
    ...new Set(operation.entries.map(entrySummary).filter(Boolean)),
  ];
  if (parts.length <= 3) return parts.join('；');
  return `${parts.slice(0, 3).join('；')}；等 ${parts.length} 项改动`;
}

/** 记录里存的是编号的字段：显示时换成名称（查不到就保留编号） */
export interface AuditValueLookups {
  boardCharacteristics: ReadonlyMap<number, string>;
  machineModels: ReadonlyMap<number, string>;
  processSteps: ReadonlyMap<number, string>;
  sensors: ReadonlyMap<number, string>;
}

const ID_FIELDS: Record<string, keyof AuditValueLookups> = {
  boardCharacteristicId: 'boardCharacteristics',
  machineModelId: 'machineModels',
  processStepId: 'processSteps',
  replacedById: 'sensors',
  replacesId: 'sensors',
  sensorIds: 'sensors',
};

export function displayFieldValue(
  field: string,
  value: string | undefined,
  lookups: AuditValueLookups | null,
): string {
  if (value === undefined || value === '') return '（空）';
  const source = lookups ? ID_FIELDS[field] : undefined;
  if (!source || !lookups) return value;
  // 编号列表按「、」拼接（后端格式化数组的写法）
  return value
    .split('、')
    .map((part) => {
      const id = Number(part);
      return Number.isInteger(id)
        ? (lookups[source].get(id) ?? `#${part}`)
        : part;
    })
    .join('、');
}

/**
 * 「操作」筛选的选项：后端给出日志里出现过的操作类型（如「删除机型」）和
 * 没有操作名称的操作码（如 auth.login）。操作码翻成中文；显示文字相同的
 * （file.upload 与「上传文件」、file.download 与「下载文件」）合成一项，选中时两者都查。
 */
export function operationKindOptions(
  kinds: readonly string[],
): Array<{ label: string; value: string; kinds: string[] }> {
  const byText = new Map<string, string[]>();
  for (const kind of kinds) {
    const text = kind in ACTION_LABELS ? actionLabel(kind) : kind;
    byText.set(text, [...(byText.get(text) ?? []), kind]);
  }
  return [...byText.entries()]
    .map(([text, values]) => ({ label: text, value: text, kinds: values }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}

/** 一条日志的名称：操作类型 · 对象 */
export function entryName(entry: AuditLogItem): string {
  return [actionLabel(entry.action), entryObject(entry)]
    .filter(Boolean)
    .join(' · ');
}
