import type {
  CrudRecord,
  CustomerProcItem,
  CustomerReqItem,
  EntityGroup,
  ProcessStepItem,
  SearchItem,
  SensorItem,
  TimelineItem,
} from './types';
import { entityDataName, listEntityTreeItems } from './entity-tree';

/** 客户区域下可被全局搜索的资料列表，tab 对应客户页的标签页 */
const CUSTOMER_LISTS = [
  { listId: 'customer-req', tab: 'req', label: '客户通用要求' },
  { listId: 'customer-proc', tab: 'proc', label: '制程注意事项' },
  { listId: 'customer-feedback', tab: 'feedback', label: '厂外反馈问题项' },
] as const;

type CustomerListId = (typeof CUSTOMER_LISTS)[number]['listId'];

/** 结果标题取该条资料最有辨识度的字段，其余字段放进 sub 供检索与展示 */
function customerRecordText(
  listId: CustomerListId,
  record: CrudRecord,
): { title: string; details: string[] } {
  if (listId === 'customer-req') {
    const item = record as CustomerReqItem;
    return {
      title: item.content || item.type,
      details: [item.type, item.machine, item.process, item.source, item.note],
    };
  }
  if (listId === 'customer-proc') {
    const item = record as CustomerProcItem;
    return {
      title: item.role || item.type,
      details: [item.type, item.feature, item.sensorNote, item.note],
    };
  }
  const item = record as TimelineItem;
  return {
    title: item.problem || item.type,
    details: [item.type, item.machine, item.measure, item.status],
  };
}

export function buildSearchIndex({
  customerGroups,
  machineDetails,
  machineGroups,
  machineSectionHits,
  processSteps,
  sensors,
  customerCrud,
}: {
  customerGroups: EntityGroup[];
  machineDetails: Record<string, { desc?: string }>;
  machineGroups: EntityGroup[];
  machineSectionHits?: SearchItem[];
  processSteps: ProcessStepItem[];
  sensors: SensorItem[];
  /** 读取客户区域下的资料列表；不传则只索引客户 / 区域名称 */
  customerCrud?: (listId: CustomerListId, entityName: string) => CrudRecord[];
}): SearchItem[] {
  // 客户目录是「客户 → 区域」：每个区域是一条结果，标题带上客户名便于按客户搜到
  const customers = customerGroups.flatMap((group) =>
    group.items.map((region) => ({
      type: 'customer' as const,
      title: `${group.name} / ${region}`,
      category: group.name,
      sub: `${region}区域 · PCB 制造客户`,
      path: '/selection/customer',
      query: { category: group.name, item: region },
    })),
  );
  const customerRecords = customerCrud
    ? customerGroups.flatMap((group) =>
        group.items.flatMap((region) => {
          const entityName = entityDataName('customer', group.name, region);
          return CUSTOMER_LISTS.flatMap(({ listId, tab, label }) =>
            customerCrud(listId, entityName).map((record) => {
              const { title, details } = customerRecordText(listId, record);
              return {
                type: 'customer' as const,
                title,
                category: group.name,
                sub: [`${region}区域`, label, ...details]
                  .filter(Boolean)
                  .join(' · '),
                path: '/selection/customer',
                query: { category: group.name, item: region, tab },
              };
            }),
          ).filter((item) => item.title);
        }),
      )
    : [];
  const processes = (Array.isArray(processSteps) ? processSteps : []).map(
    (item) => ({
      type: 'process' as const,
      title: item.name,
      category: item.layer,
      sub: [item.layer, item.role, item.feature].filter(Boolean).join(' · '),
      path: '/selection/process',
      query: { tab: 'steps', q: item.name },
    }),
  );
  const machines = listEntityTreeItems(machineGroups).map(
    ({ category, configuration, name: title }) => ({
      type: 'machine' as const,
      title,
      category,
      sub: [category, configuration, machineDetails[title]?.desc || '机型结构']
        .filter(Boolean)
        .join(' · '),
      path: '/selection/machine',
      query: { category, item: title },
    }),
  );
  const machineRows = (
    Array.isArray(machineSectionHits) ? machineSectionHits : []
  ).map((item) => ({
    type: 'machine' as const,
    title: item.title,
    category: item.category,
    sub: item.sub,
    path: item.path || '/selection/machine',
    query: { ...item.query },
  }));
  const sensorItems = sensors.map((item) => ({
    type: 'sensor' as const,
    title: [item.brand, item.model, item.partNumber].filter(Boolean).join(' '),
    category: item.sensorType,
    sub: [
      item.status,
      item.partNumber,
      item.sensorType,
      item.spec,
      item.feature,
      item.scene,
      item.problemNote,
    ]
      .filter(Boolean)
      .join(' · '),
    path: '/selection/sensor',
    query: { model: item.model },
  }));
  return [
    ...sensorItems,
    ...processes,
    ...machines,
    ...machineRows,
    ...customers,
    ...customerRecords,
  ];
}

/**
 * 结果卡片第三行的说明文字。索引里的 sub 为了便于检索，开头往往重复了
 * category（「输送机构 · 客户特殊配置 · …」），
 * 而卡片第二行已经显示了 category，这里把重复的首段去掉；只剩重复内容时返回空串。
 */
export function searchItemDetail(
  item: Pick<SearchItem, 'category' | 'sub'>,
): string {
  const category = item.category?.trim() ?? '';
  const segments = (item.sub ?? '')
    .split(' · ')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (
    category &&
    (segments[0] === category || segments[0] === `${category}区域`)
  ) {
    segments.shift();
  }
  return segments.join(' · ');
}
