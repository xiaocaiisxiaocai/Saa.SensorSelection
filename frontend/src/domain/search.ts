import type { EntityGroup, ProcessStepItem, SearchItem, SensorItem } from './types';
import { listEntityTreeItems } from './entity-tree';

export function buildSearchIndex({
  customerGroups,
  machineDetails,
  machineGroups,
  machineSectionHits,
  processSteps,
  sensors,
}: {
  customerGroups: EntityGroup[];
  machineDetails: Record<string, { desc?: string }>;
  machineGroups: EntityGroup[];
  machineSectionHits?: SearchItem[];
  processSteps: ProcessStepItem[];
  sensors: SensorItem[];
}): SearchItem[] {
  const customers = customerGroups.flatMap((group) =>
    group.items.map((title) => ({
      type: 'customer' as const,
      title,
      category: group.name,
      sub: `${group.name}区域 · PCB 制造客户`,
      path: '/selection/customer',
      query: { category: group.name, item: title },
    })),
  );
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
  return [...sensorItems, ...processes, ...machines, ...machineRows, ...customers];
}

/**
 * 结果卡片第三行的说明文字。索引里的 sub 为了便于检索，开头往往重复了
 * category（「输送机构 · 客户特殊配置 · …」、「华东区域 · PCB 制造客户」），
 * 而卡片第二行已经显示了 category，这里把重复的首段去掉；只剩重复内容时返回空串。
 */
export function searchItemDetail(item: Pick<SearchItem, 'category' | 'sub'>): string {
  const category = item.category?.trim() ?? '';
  const segments = (item.sub ?? '')
    .split(' · ')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (category && (segments[0] === category || segments[0] === `${category}区域`)) {
    segments.shift();
  }
  return segments.join(' · ');
}
