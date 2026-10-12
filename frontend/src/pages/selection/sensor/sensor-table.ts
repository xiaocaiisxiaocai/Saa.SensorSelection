import type { TableColumnType } from 'ant-design-vue';

import { isSensorStatus, type SensorItem } from '@/domain';
import { sortOrderOf, type TableSortState } from '@/pages/shared/table';

/** 型号表格里需要的反查：替换关系的另一方、型录 / 3D 标题 */
export interface SensorLookup {
  related(item: SensorItem): SensorItem | null;
  sopTitle(sopId: null | number | undefined): string;
  model3dTitle(model3dId: null | number | undefined): string;
}

// 状态/料号/类型/品牌/型号/操作是识别与操作的必需列，不提供隐藏；
// 其余描述性列允许按需隐藏。
export const HIDEABLE_COLUMNS: { key: string; label: string }[] = [
  { key: 'relation', label: '替换关系' },
  { key: 'spec', label: '规格参数' },
  { key: 'feature', label: '特性与注意' },
  { key: 'scene', label: '适用场景' },
  { key: 'sop', label: '关联型录' },
  { key: 'model3d', label: '关联 3D' },
];

export function sensorColumns(options: {
  sort: TableSortState | null;
  /** 停用页签多显示「停用时间 / 停用原因」 */
  showDisabledDetails: boolean;
  hidden: ReadonlySet<string>;
  writable: boolean;
}): TableColumnType[] {
  const { sort } = options;
  const baseColumns: TableColumnType[] = [
    {
      key: 'status',
      dataIndex: 'status',
      title: '状态',
      width: 88,
      fixed: 'left',
      sorter: true,
      sortOrder: sortOrderOf(sort, 'status'),
    },
    {
      key: 'partNumber',
      dataIndex: 'partNumber',
      title: '料号',
      width: 120,
      sorter: true,
      sortOrder: sortOrderOf(sort, 'partNumber'),
    },
    {
      key: 'sensorType',
      dataIndex: 'sensorType',
      title: '感应器类型',
      width: 136,
      sorter: true,
      sortOrder: sortOrderOf(sort, 'sensorType'),
    },
    {
      key: 'brand',
      dataIndex: 'brand',
      title: '品牌',
      width: 88,
      sorter: true,
      sortOrder: sortOrderOf(sort, 'brand'),
    },
    {
      key: 'model',
      dataIndex: 'model',
      title: '型号',
      width: 140,
      sorter: true,
      sortOrder: sortOrderOf(sort, 'model'),
    },
    ...(options.showDisabledDetails
      ? [
          {
            key: 'replacedAt',
            dataIndex: 'replacedAt',
            title: '停用时间',
            width: 112,
            sorter: true,
            sortOrder: sortOrderOf(sort, 'replacedAt'),
          },
          {
            key: 'problemNote',
            dataIndex: 'problemNote',
            title: '停用原因',
            width: 180,
          },
        ]
      : []),
    // 替换关系/关联型录/关联 3D 内容都很短（多数是「—」或一个文件名），给窄宽度；
    // 宽度留给规格参数/特性与注意/适用场景：这三列完整显示不截断，
    // 列越宽折行越少，紧凑主题下行高才压得下来。
    { key: 'relation', dataIndex: 'relation', title: '替换关系', width: 120 },
    { key: 'spec', dataIndex: 'spec', title: '规格参数', width: 220 },
    { key: 'feature', dataIndex: 'feature', title: '特性与注意', width: 260 },
    { key: 'scene', dataIndex: 'scene', title: '适用场景', width: 200 },
    { key: 'sop', dataIndex: 'sop', title: '关联型录', width: 96 },
    { key: 'model3d', dataIndex: 'model3d', title: '关联 3D', width: 96 },
  ];
  const cols = baseColumns.filter(
    (column) => !options.hidden.has(String(column.key)),
  );
  if (options.writable) {
    cols.push({ key: 'actions', title: '操作', width: 96, fixed: 'right' });
  }
  return cols;
}

/** 按状态、类型和关键字筛选型号；关键字也匹配替换关系另一方与关联文件标题 */
export function filterSensors(
  sensors: readonly SensorItem[],
  filters: {
    status: string;
    sensorTypes: readonly (string | number)[];
    query: string;
  },
  lookup: SensorLookup,
): SensorItem[] {
  const value = filters.query.trim().toLocaleLowerCase('zh-CN');
  return sensors.filter((item) => {
    if (filters.status !== '全部' && item.status !== filters.status) {
      return false;
    }
    if (
      filters.sensorTypes.length > 0 &&
      !filters.sensorTypes.includes(item.sensorType)
    ) {
      return false;
    }
    if (!value) return true;
    const related = lookup.related(item);
    const haystack = [
      item.status,
      item.partNumber,
      item.sensorType,
      item.brand,
      item.model,
      item.spec,
      item.feature,
      item.scene,
      item.problemNote,
      related?.model,
      related?.brand,
      related?.partNumber,
      lookup.sopTitle(item.sopId),
      lookup.model3dTitle(item.model3dId),
    ]
      .join(' ')
      .toLocaleLowerCase('zh-CN');
    return haystack.includes(value);
  });
}

export function relationText(item: SensorItem, related: SensorItem | null) {
  const label = related
    ? [related.brand, related.model].filter(Boolean).join(' ')
    : '';
  if (item.replacesId) {
    const target = label || `型号#${item.replacesId}`;
    return item.problemNote
      ? `替换了 ${target} · ${item.problemNote}`
      : `替换了 ${target}`;
  }
  if (item.replacedById) {
    const target = label || `型号#${item.replacedById}`;
    return item.problemNote
      ? `被 ${target} 替换 · ${item.problemNote}`
      : `被 ${target} 替换`;
  }
  return '';
}

/** 导出 Excel 时一个单元格的文字，与表格里看到的一致 */
export function exportCell(
  item: SensorItem,
  key: string,
  lookup: SensorLookup,
): string {
  const empty = '—';
  switch (key) {
    case 'status':
      return item.status || empty;
    case 'partNumber':
      return item.partNumber || empty;
    case 'sensorType':
      return item.sensorType || empty;
    case 'brand':
      return item.brand || empty;
    case 'model':
      return item.model || empty;
    case 'replacedAt':
      return item.replacedAt || empty;
    case 'problemNote':
      return item.problemNote || empty;
    case 'relation':
      return relationText(item, lookup.related(item)) || empty;
    case 'spec':
      return item.spec || empty;
    case 'feature':
      return item.feature || empty;
    case 'scene':
      return item.scene || empty;
    case 'sop':
      return lookup.sopTitle(item.sopId) || '未关联';
    case 'model3d':
      return lookup.model3dTitle(item.model3dId) || '未关联';
    default:
      return empty;
  }
}

/** 型号状态对应的 a-tag 预设色 */
export function statusColor(status: string): string {
  if (isSensorStatus(status, 'current')) return 'green';
  if (isSensorStatus(status, 'alternate')) return 'gold';
  if (isSensorStatus(status, 'disabled')) return 'red';
  return 'default';
}

// 感应器类型圆点：按类型名稳定地映射到 antd 的预设色
const TYPE_ACCENT_COLORS = [
  'cyan',
  'geekblue',
  'purple',
  'magenta',
  'gold',
] as const;

export function typeAccent(label: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return TYPE_ACCENT_COLORS[(hash >>> 0) % TYPE_ACCENT_COLORS.length]!;
}
