import type { TableColumnType } from 'ant-design-vue';

import type {
  DictionaryItem,
  MachineSectionRow,
  ProcessStepItem,
  SensorItem,
} from '@/domain';
import { sortOrderOf, type TableSortState } from '@/pages/shared/table';

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
}

function sensorSpec(sensor: SensorItem): string {
  return `${sensor.brand} ${sensor.model} · ${sensor.spec || '未填写规格'}`.trim();
}

export function buildMachineTableRows(
  items: MachineSectionRow[],
  sensors: SensorItem[],
  isStructure: boolean,
  processSteps: ProcessStepItem[] = [],
  machineModels: DictionaryItem[] = [],
  boardCharacteristics: DictionaryItem[] = [],
): MachineTableRow[] {
  return items.flatMap((item) => {
    const records = isStructure
      ? (item.sensorIds ?? [])
          .map((id) => sensors.find((sensor) => sensor.id === id))
          .filter((sensor): sensor is SensorItem => Boolean(sensor))
      : [];
    const displaySensors: Array<SensorItem | null> =
      records.length > 0 ? records : [null];

    const processStep = isStructure
      ? processSteps.find((candidate) => candidate.id === item.processStepId)
      : undefined;
    const processStepName = processStep
      ? `${processStep.layer} · ${processStep.name}`
      : '—';
    const machineModelName =
      machineModels.find((candidate) => candidate.id === item.machineModelId)
        ?.name ?? '—';
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
      machineModelName,
      processStepName,
      boardCharacteristicName,
      sensor,
      source: item,
      sensorType: sensor?.sensorType ?? item.sensorType,
      spec: sensor ? sensorSpec(sensor) : item.spec,
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
 * 分区表格的列。结构分区一条记录按传感器展开成多行，除传感器两列外都合并单元格
 * （合并后 antd 不能排序，所以结构分区不提供排序）；注意事项分区按分类 / 名称排序。
 */
export function sectionColumns(options: {
  structure: boolean;
  sort: TableSortState | null;
  writable: boolean;
}): Column[] {
  const { structure, sort } = options;
  const merged: Pick<Column, 'customCell'> = structure
    ? { customCell: (row) => ({ rowSpan: row.groupStart ? row.groupSize : 0 }) }
    : {};
  const cols: Column[] = structure
    ? [
        {
          key: 'role',
          dataIndex: 'role',
          title: '功能作用',
          width: 104,
          fixed: 'left',
          ...merged,
        },
        {
          key: 'machineModelName',
          dataIndex: 'machineModelName',
          title: '机型',
          width: 100,
          ...merged,
        },
        {
          key: 'processStepName',
          dataIndex: 'processStepName',
          title: '工艺制程',
          width: 110,
          ...merged,
        },
        {
          key: 'boardCharacteristicName',
          dataIndex: 'boardCharacteristicName',
          title: '板件特性',
          width: 120,
          ...merged,
        },
        {
          key: 'sensorType',
          dataIndex: 'sensorType',
          title: '传感器类型',
          width: 116,
        },
        { key: 'spec', dataIndex: 'spec', title: '规格', width: 220 },
        {
          key: 'purpose',
          dataIndex: 'purpose',
          title: '作用',
          width: 120,
          ...merged,
        },
        { key: 'note', dataIndex: 'note', title: '备注', width: 96, ...merged },
      ]
    : [
        {
          key: 'role',
          dataIndex: 'role',
          title: '注意分类',
          width: 120,
          fixed: 'left',
          sorter: true,
          sortOrder: sortOrderOf(sort, 'role'),
        },
        {
          key: 'name',
          dataIndex: 'name',
          title: '事项名称',
          width: 140,
          sorter: true,
          sortOrder: sortOrderOf(sort, 'name'),
        },
        { key: 'desc', dataIndex: 'desc', title: '说明', width: 180 },
        { key: 'note', dataIndex: 'note', title: '备注', width: 120 },
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
  machineModelId: string | number | null;
  processStepId: string | number | null;
  boardCharacteristicId: string | number | null;
}

/**
 * 按筛选条件过滤分区记录。下拉筛选只对结构分区生效；关键字在结构分区里
 * 也匹配机型 / 工艺制程 / 板件特性名称和关联传感器的类型、品牌型号、规格。
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
  const processStepLabel = (id: number | null) => {
    if (id === null) return '';
    const step = lookup.processSteps.find((candidate) => candidate.id === id);
    return step ? `${step.layer} · ${step.name}` : '';
  };
  const matchesId = (filter: string | number | null, id: number | null) =>
    filter === null || id === Number(filter);

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
        !matchesId(filters.machineModelId, row.machineModelId) ||
        !matchesId(filters.processStepId, row.processStepId) ||
        !matchesId(filters.boardCharacteristicId, row.boardCharacteristicId)
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
        nameOf(lookup.machineModels, row.machineModelId),
        processStepLabel(row.processStepId),
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
