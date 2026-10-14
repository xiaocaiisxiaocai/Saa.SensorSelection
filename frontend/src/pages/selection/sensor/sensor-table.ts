import type { TableColumnType } from 'ant-design-vue';

import { isSensorStatus, type SensorItem } from '@/domain';

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
  /** 停用页签多显示「停用时间 / 停用原因」 */
  showDisabledDetails: boolean;
  hidden: ReadonlySet<string>;
  writable: boolean;
  /** 「全部」分组：关联型录 / 关联 3D 按组跨行合并 */
  grouped?: boolean;
}): TableColumnType<SensorTableRow>[] {
  const shared = options.grouped ? { customCell: associationCell } : {};
  // 行数据是 { item, rowKey, muted }。dataIndex 指到 item 上的字段，单元格才能取到值。
  const field = (key: string): TableColumnType['dataIndex'] => ['item', key];
  const baseColumns: TableColumnType[] = [
    {
      key: 'status',
      dataIndex: field('status'),
      title: '状态',
      width: 112,
      fixed: 'left',
    },
    {
      key: 'partNumber',
      dataIndex: field('partNumber'),
      title: '料号',
      width: 120,
    },
    {
      key: 'sensorType',
      dataIndex: field('sensorType'),
      title: '感应器类型',
      width: 136,
    },
    {
      key: 'brand',
      dataIndex: field('brand'),
      title: '品牌',
      width: 88,
    },
    {
      key: 'model',
      dataIndex: field('model'),
      title: '型号',
      width: 140,
    },
    ...(options.showDisabledDetails
      ? [
          {
            key: 'replacedAt',
            dataIndex: field('replacedAt'),
            title: '停用时间',
            width: 112,
          },
          {
            key: 'problemNote',
            dataIndex: field('problemNote'),
            title: '停用原因',
            width: 180,
          },
        ]
      : []),
    // 替换关系/关联型录/关联 3D 内容都很短（多数是「—」或一个文件名），给窄宽度；
    // 宽度留给规格参数/特性与注意/适用场景：这三列完整显示不截断，
    // 列越宽折行越少，紧凑主题下行高才压得下来。
    // 替换关系 / 关联型录 / 关联 3D 由面板按 item 自行渲染，没有对应的 item 字段。
    { key: 'relation', dataIndex: 'relation', title: '替换关系', width: 120 },
    { key: 'spec', dataIndex: field('spec'), title: '规格参数', width: 220 },
    { key: 'feature', dataIndex: field('feature'), title: '特性与注意', width: 260 },
    { key: 'scene', dataIndex: field('scene'), title: '适用场景', width: 200 },
    { key: 'sop', dataIndex: 'sop', title: '关联型录', width: 96, ...shared },
    {
      key: 'model3d',
      dataIndex: 'model3d',
      title: '关联 3D',
      width: 96,
      ...shared,
    },
  ];
  const cols = baseColumns.filter(
    (column) => !options.hidden.has(String(column.key)),
  );
  if (options.writable) {
    // 三格各 24px（编辑 / 替换 / 删除）。96 扣掉单元格内边距后装不下。
    cols.push({ key: 'actions', title: '操作', width: 120, fixed: 'right' });
  }
  return cols;
}

/** 类型与关键字都要落在同一条型号上。关键字也匹配替换关系另一方与关联文件标题。 */
function matchesTypeAndQuery(
  item: SensorItem,
  sensorTypes: readonly (string | number)[],
  query: string,
  lookup: SensorLookup,
): boolean {
  if (sensorTypes.length > 0 && !sensorTypes.includes(item.sensorType)) {
    return false;
  }
  const value = query.trim().toLocaleLowerCase('zh-CN');
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
}

/**
 * 按状态、类型和关键字筛选型号；关键字也匹配替换关系另一方与关联文件标题。
 * `statuses` 为空表示不限状态。
 */
export function filterSensors(
  sensors: readonly SensorItem[],
  filters: {
    statuses: readonly string[];
    sensorTypes: readonly (string | number)[];
    query: string;
  },
  lookup: SensorLookup,
): SensorItem[] {
  return sensors.filter((item) => {
    if (
      filters.statuses.length > 0 &&
      !filters.statuses.includes(item.status)
    ) {
      return false;
    }
    return matchesTypeAndQuery(
      item,
      filters.sensorTypes,
      filters.query,
      lookup,
    );
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

/**
 * 「全部」里的一个分页单位。
 * head 是现用，或落单行自己。members 不含 head：先是同型备选（仓库顺序），
 * 再是顺着替换链归到这条现用的停用。
 */
export interface SensorGroupUnit {
  head: SensorItem;
  /** 只有「现用且下面还有成员」才成组。落单行和单独的现用都是 false。 */
  grouped: boolean;
  members: SensorItem[];
}

/** 型号表的一行。同一备选可挂在多条现用下，成员行的 rowKey 带上头的 id。 */
export interface SensorTableRow {
  rowKey: string;
  item: SensorItem;
  /** 这一组的现用。落单行、或不分组时，等于 item。 */
  parent: SensorItem;
  /** 组里的备选和停用。落单行不弱化。 */
  muted: boolean;
  /** 组内停用：正文加删除线。落单的停用不加。 */
  struck: boolean;
  /** 这笔现用下面跟着成员。 */
  groupStart: boolean;
  /** 这一组一共几行。单独一行是 1；组里每一行都写同一个数。 */
  groupSize: number;
}

/**
 * 分组时，关联型录和关联 3D 整组合并成现用那一格。
 * 成员行这两列让出（rowSpan 0）；没有成员的行仍是单独一格。
 */
function associationCell(row: SensorTableRow) {
  if (row.muted) return { rowSpan: 0 };
  if (row.groupSize > 1) {
    return { rowSpan: row.groupSize, class: 'sensor-shared-cell' };
  }
  return { rowSpan: 1 };
}

function compareRetired(
  left: SensorItem,
  right: SensorItem,
  indexOf: ReadonlyMap<SensorItem, number>,
) {
  const leftAt = left.replacedAt.trim();
  const rightAt = right.replacedAt.trim();
  if (!leftAt !== !rightAt) return leftAt ? -1 : 1;
  if (leftAt && rightAt && leftAt !== rightAt) {
    return leftAt < rightAt ? 1 : -1;
  }
  return (indexOf.get(left) ?? 0) - (indexOf.get(right) ?? 0);
}

/**
 * 从现用往回找「谁的 replacedById 指向我」。
 * 一代比一代远；同一代里停用按 replacedAt 从新到旧，空日期排在这代最后，再按仓库顺序。
 * 备选只当作桥，不写进停用名单。另一条现用不穿过去。
 */
function retiredUnder(
  head: SensorItem,
  predecessors: ReadonlyMap<number, readonly SensorItem[]>,
  indexOf: ReadonlyMap<SensorItem, number>,
  limit: number,
): SensorItem[] {
  const retired: SensorItem[] = [];
  const seen = new Set<number>([head.id]);
  let frontier: SensorItem[] = [head];
  let steps = 0;
  while (frontier.length > 0 && retired.length < limit && steps < limit) {
    steps += 1;
    const generation: SensorItem[] = [];
    for (const node of frontier) {
      for (const predecessor of predecessors.get(node.id) ?? []) {
        if (seen.has(predecessor.id)) continue;
        seen.add(predecessor.id);
        if (isSensorStatus(predecessor.status, 'current')) continue;
        generation.push(predecessor);
      }
    }
    if (generation.length === 0) break;
    const disabled = generation.filter((item) =>
      isSensorStatus(item.status, 'disabled'),
    );
    disabled.sort((left, right) => compareRetired(left, right, indexOf));
    retired.push(...disabled);
    frontier = generation;
  }
  return retired;
}

/**
 * 把整份目录收成「全部」的分组单位。
 * 现用按仓库顺序做组头；同型备选挂到每一条同型现用下。
 * 停用只挂到替换链尽头的那一条现用。链到不了现用的备选和停用，按仓库顺序排在最后。
 */
export function groupSensorCatalog(
  catalog: readonly SensorItem[],
): SensorGroupUnit[] {
  const limit = catalog.length;
  const indexOf = new Map<SensorItem, number>();
  const predecessors = new Map<number, SensorItem[]>();
  const alternatesByType = new Map<string, SensorItem[]>();

  catalog.forEach((item, index) => {
    indexOf.set(item, index);
    const nextId = item.replacedById;
    if (nextId != null) {
      const list = predecessors.get(nextId);
      if (list) list.push(item);
      else predecessors.set(nextId, [item]);
    }
    if (!isSensorStatus(item.status, 'alternate')) return;
    const group = alternatesByType.get(item.sensorType);
    if (group) group.push(item);
    else alternatesByType.set(item.sensorType, [item]);
  });

  const units: SensorGroupUnit[] = [];
  const consumedDisabled = new Set<number>();
  const typesWithCurrent = new Set<string>();

  for (const item of catalog) {
    if (!isSensorStatus(item.status, 'current')) continue;
    typesWithCurrent.add(item.sensorType);
    const alternates = alternatesByType.get(item.sensorType) ?? [];
    const retired = retiredUnder(item, predecessors, indexOf, limit);
    for (const row of retired) consumedDisabled.add(row.id);
    const members = [...alternates, ...retired];
    units.push({
      head: item,
      grouped: members.length > 0,
      members,
    });
  }

  for (const item of catalog) {
    if (isSensorStatus(item.status, 'current')) continue;
    if (
      isSensorStatus(item.status, 'alternate') &&
      typesWithCurrent.has(item.sensorType)
    ) {
      continue;
    }
    if (
      isSensorStatus(item.status, 'disabled') &&
      consumedDisabled.has(item.id)
    ) {
      continue;
    }
    units.push({ head: item, grouped: false, members: [] });
  }
  return units;
}

/**
 * 「全部」的筛选：组头或任一成员同时满足类型和关键字，就保留整组。
 * 类型和关键字必须落在同一条型号上。
 */
export function filterSensorGroups(
  units: readonly SensorGroupUnit[],
  filters: {
    sensorTypes: readonly (string | number)[];
    query: string;
  },
  lookup: SensorLookup,
): SensorGroupUnit[] {
  if (filters.sensorTypes.length === 0 && !filters.query.trim()) {
    return [...units];
  }
  return units.filter((unit) =>
    [unit.head, ...unit.members].some((item) =>
      matchesTypeAndQuery(item, filters.sensorTypes, filters.query, lookup),
    ),
  );
}

/** 把分组单位展开成表格行。成员行键为 `${headId}:${itemId}`。 */
export function expandSensorGroups(
  units: readonly SensorGroupUnit[],
): SensorTableRow[] {
  const rows: SensorTableRow[] = [];
  for (const unit of units) {
    const grouped = unit.grouped && unit.members.length > 0;
    const groupSize = grouped ? 1 + unit.members.length : 1;
    rows.push({
      rowKey: String(unit.head.id),
      item: unit.head,
      parent: unit.head,
      muted: false,
      struck: false,
      groupStart: grouped,
      groupSize,
    });
    if (!grouped) continue;
    for (const member of unit.members) {
      rows.push({
        rowKey: `${unit.head.id}:${member.id}`,
        item: member,
        parent: unit.head,
        muted: true,
        struck: isSensorStatus(member.status, 'disabled'),
        groupStart: false,
        groupSize,
      });
    }
  }
  return rows;
}
