import type { TableColumnType } from 'ant-design-vue';

import type {
  DictionaryItem,
  MachineSectionRow,
  ProcessStepItem,
  SensorItem,
} from '@/domain';

export interface MachineTableRow extends MachineSectionRow {
  displayId: string;
  groupSize: number;
  groupStart: boolean;
  groupEnd: boolean;
  machineModelName: string;
  processStepName: string;
  boardCharacteristicName: string;
  sensor: SensorItem | null;
  source: MachineSectionRow;
  /**
   * 示意图格占几行：相邻记录用同一张图时合并成一格，由第一行占满整组，
   * 组里其余行为 0；没有图的记录各自一格
   */
  imageSpan: number;
  /** 共用这一格示意图的记录（只在 imageSpan > 0 的行上有值） */
  imageRows: MachineSectionRow[];
  /**
   * 这一格还没有图、而紧挨在上面的记录有图时，就是那条记录；
   * 格子里据此提供「沿用上一笔的图」
   */
  previousRow: MachineSectionRow | null;
}

function sensorSpec(sensor: SensorItem): string {
  return `${sensor.brand} ${sensor.model} · ${sensor.spec || '未填写规格'}`.trim();
}

/** 把相邻、示意图相同的记录分成一组；没有图的记录各自一组 */
export function imageGroups(
  items: readonly MachineSectionRow[],
): MachineSectionRow[][] {
  const groups: MachineSectionRow[][] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    const previous = last?.[last.length - 1];
    if (
      last &&
      item.image &&
      previous?.image &&
      previous.image.dataUrl === item.image.dataUrl
    ) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups;
}

export function buildMachineTableRows(
  items: MachineSectionRow[],
  sensors: SensorItem[],
  isStructure: boolean,
  _processSteps: ProcessStepItem[] = [],
  _machineModels: DictionaryItem[] = [],
  boardCharacteristics: DictionaryItem[] = [],
): MachineTableRow[] {
  const sensorCount = (item: MachineSectionRow) =>
    isStructure
      ? Math.max(
          1,
          (item.sensorIds ?? []).filter((id) =>
            sensors.some((sensor) => sensor.id === id),
          ).length,
        )
      : 1;
  // 每条记录在示意图列上的位置：组首记录的第一行占满整组的行数
  const imageCell = new Map<
    MachineSectionRow,
    {
      span: number;
      rows: MachineSectionRow[];
      previous: MachineSectionRow | null;
    }
  >();
  let previous: MachineSectionRow | null = null;
  for (const group of imageGroups(items)) {
    group.forEach((item, index) =>
      imageCell.set(
        item,
        index === 0
          ? {
              span: group.reduce((sum, row) => sum + sensorCount(row), 0),
              rows: group,
              // 只有没图的格子才需要「沿用上一笔」
              previous: !item.image && previous?.image ? previous : null,
            }
          : { span: 0, rows: [], previous: null },
      ),
    );
    previous = group[group.length - 1] ?? null;
  }
  return items.flatMap((item) => {
    const records = isStructure
      ? (item.sensorIds ?? [])
          .map((id) => sensors.find((sensor) => sensor.id === id))
          .filter((sensor): sensor is SensorItem => Boolean(sensor))
      : [];
    const displaySensors: Array<SensorItem | null> =
      records.length > 0 ? records : [null];

    const boardCharacteristicName =
      boardCharacteristics.find(
        (candidate) => candidate.id === item.boardCharacteristicId,
      )?.name ?? '—';

    return displaySensors.map((sensor, index) => ({
      ...item,
      displayId: `${item.id}-${index}-${sensor?.id ?? 'legacy'}`,
      groupSize: displaySensors.length,
      groupStart: index === 0,
      groupEnd: index === displaySensors.length - 1,
      machineModelName: '',
      processStepName: '',
      boardCharacteristicName,
      sensor,
      source: item,
      sensorType: sensor?.sensorType ?? item.sensorType,
      spec: sensor ? sensorSpec(sensor) : item.spec,
      imageSpan: index === 0 ? (imageCell.get(item)?.span ?? 0) : 0,
      imageRows: index === 0 ? (imageCell.get(item)?.rows ?? []) : [],
      previousRow: index === 0 ? (imageCell.get(item)?.previous ?? null) : null,
    }));
  });
}

/** 表格「传感器类型」列：展开行显示该传感器的类型，旧数据退回手填的类型 */
export function sensorTypeList(row: MachineTableRow): string[] {
  if (row.sensor) return [row.sensor.sensorType];
  return row.sensorType ? [row.sensorType] : [];
}

type Column = TableColumnType<MachineTableRow>;

/**
 * 分区表格的列。结构分区一条记录按传感器展开成多行，除传感器两列外都合并单元格，
 * 示意图列再把相邻同图的记录合并。行序保持仓库顺序，表头不提供排序。
 */
export function sectionColumns(options: {
  structure: boolean;
  writable: boolean;
}): Column[] {
  const { structure } = options;
  const merged: Pick<Column, 'customCell'> = structure
    ? { customCell: (row) => ({ rowSpan: row.groupStart ? row.groupSize : 0 }) }
    : {};
  const cols: Column[] = structure
    ? [
        {
          key: 'role',
          dataIndex: 'role',
          title: 'Sensor名称',
          width: 104,
          fixed: 'left',
          ...merged,
        },
        {
          key: 'boardCharacteristicName',
          dataIndex: 'boardCharacteristicName',
          title: '板件特性',
          width: 144,
          ...merged,
        },
        {
          key: 'sensorType',
          dataIndex: 'sensorType',
          title: '传感器类型',
          width: 152,
        },
        { key: 'spec', dataIndex: 'spec', title: '规格', width: 220 },
        {
          key: 'purpose',
          dataIndex: 'purpose',
          title: '作用',
          width: 120,
          ...merged,
        },
        {
          key: 'note',
          dataIndex: 'note',
          title: '备注',
          width: 96,
          className: 'cell-pre-line',
          ...merged,
        },
        // 示意图放在操作列前；相邻记录同图时合并成一格
        {
          key: 'image',
          title: '示意图',
          width: 152,
          customCell: (row) => ({
            rowSpan: row.imageSpan,
            // 只有多条记录共用一张图才标记；单笔（含多个传感器展开）与空格都不加
            ...(row.imageRows.length > 1
              ? { class: 'machine-image-cell--shared' }
              : {}),
          }),
        },
      ]
    : [
        {
          key: 'role',
          dataIndex: 'role',
          title: '注意分类',
          width: 120,
          fixed: 'left',
        },
        {
          key: 'name',
          dataIndex: 'name',
          title: '事项名称',
          width: 140,
        },
        { key: 'desc', dataIndex: 'desc', title: '说明', width: 180 },
        {
          key: 'note',
          dataIndex: 'note',
          title: '备注',
          width: 120,
          className: 'cell-pre-line',
        },
      ];
  if (options.writable) {
    cols.push({
      key: 'actions',
      title: '操作',
      width: 72,
      fixed: 'right',
      ...merged,
    });
  }
  return cols;
}

export interface SectionRowFilters {
  query: string;
  sensorTypes: readonly (string | number)[];
  /** 空数组表示不限。多选命中任一即可。 */
  machineModelIds: readonly (string | number)[];
  processStepIds: readonly (string | number)[];
  boardCharacteristicIds: readonly (string | number)[];
}

/**
 * 按筛选条件过滤分区记录。表头筛选只对结构分区生效；关键字在结构分区里
 * 也匹配板件特性名称和关联传感器的类型、品牌型号、规格。
 * 板件特性是多选，命中任一即可；空数组表示不限。
 */
export function filterSectionRows(
  rows: readonly MachineSectionRow[],
  structure: boolean,
  filters: SectionRowFilters,
  lookup: {
    sensorById: ReadonlyMap<number, SensorItem>;
    processSteps: readonly ProcessStepItem[];
    machineModels: readonly DictionaryItem[];
    boardCharacteristics: readonly DictionaryItem[];
  },
): MachineSectionRow[] {
  const value = filters.query.trim().toLocaleLowerCase('zh-CN');
  const sensorsOf = (row: MachineSectionRow) =>
    (row.sensorIds ?? [])
      .map((id) => lookup.sensorById.get(id))
      .filter((sensor): sensor is SensorItem => Boolean(sensor));
  const nameOf = (
    items: readonly { id: number; name: string }[],
    id: number | null,
  ) => (id === null ? '' : (items.find((item) => item.id === id)?.name ?? ''));
  return rows.filter((row) => {
    if (structure) {
      if (
        filters.sensorTypes.length > 0 &&
        !sensorsOf(row).some((sensor) =>
          filters.sensorTypes.includes(sensor.sensorType),
        )
      ) {
        return false;
      }
      if (
        filters.boardCharacteristicIds.length > 0 &&
        !filters.boardCharacteristicIds.some(
          (item) => Number(item) === row.boardCharacteristicId,
        )
      ) {
        return false;
      }
    }
    if (!value) return true;
    let haystack: string[];
    if (structure) {
      const records = sensorsOf(row);
      const types = [...new Set(records.map((sensor) => sensor.sensorType))];
      haystack = [
        row.role,
        nameOf(lookup.boardCharacteristics, row.boardCharacteristicId),
        types.length > 0 ? types.join('、') : row.sensorType || '—',
        records.length > 0
          ? records.map(sensorSpec).join('\n')
          : row.spec || '—',
        row.purpose,
        row.note,
      ];
    } else {
      haystack = [row.role, row.name, row.desc, row.note];
    }
    return haystack.join(' ').toLocaleLowerCase('zh-CN').includes(value);
  });
}
