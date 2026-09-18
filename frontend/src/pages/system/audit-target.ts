/*
 * 操作日志的「目标」列原样存的是数据仓库 key（如
 * machine-section-rows:1002:输送机（PLC）），业务人员看不懂。这里把 key 的
 * 命名空间翻成页面上的叫法，保留后面的业务名；数字段是内部 id，列表里不显示，
 * 详情弹窗仍给出原始 key 供排查。认不出的 key 原样返回，不猜。
 */

const NAMESPACE_LABELS: Record<string, string> = {
  'customer-feedback': '厂外反馈问题项',
  'customer-proc': '制程注意事项',
  'customer-req': '客户通用要求',
  'customer-sop': '感应器选用标准',
  dict: '数据字典',
  'dict-feedback-type': '反馈类型字典',
  'general-structure-labels': '通用结构标签',
  'machine-extra-sections': '机型页签',
  'machine-global-sections': '机型公共页签',
  'machine-processes': '机型制程',
  'machine-section-images': '结构示意图',
  'machine-section-rows': '机型选型',
  meta: '系统数据',
  'process-intro': '制程介绍',
  'process-steps': '工艺制程',
  'sensor-3d': 'Sensor 3D',
  'sensor-catalog': 'Sensor 型号',
  'sensor-sop': 'Sensor 型录',
  'sensor-sop-file': 'Sensor SOP',
};

const ENTITY_GROUP_LABELS: Record<string, string> = {
  customer: '客户分类',
  machine: '机型分类',
};

export function formatAuditTarget(target: null | string | undefined): string {
  const raw = target?.trim();
  if (!raw) return '';

  const at = raw.indexOf(':');
  if (at <= 0) return raw;

  const namespace = raw.slice(0, at);
  const rest = raw.slice(at + 1);

  if (namespace === 'entity-groups') {
    return ENTITY_GROUP_LABELS[rest] ?? raw;
  }

  const label = NAMESPACE_LABELS[namespace];
  if (!label) return raw;

  const parts = rest
    .split(':')
    .map((part) => part.trim())
    .filter((part) => part && part !== 'all' && !/^\d+$/.test(part));
  return parts.length ? `${label} · ${parts.join(' · ')}` : label;
}
