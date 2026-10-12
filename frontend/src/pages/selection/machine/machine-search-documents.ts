import {
  listEntityTreeItems,
  MACHINE_CONTENT_SECTION_ID,
  type EntityGroup,
} from '@/domain';
import type { useSelectionStore } from '@/stores/selection';

import type { MachineStructureSearchDocument } from './machine-structure-search';

type SelectionStore = ReturnType<typeof useSelectionStore>;

/**
 * 「条件查找」的索引：遍历结构目录里结构类 Tab 下每个机型的每一行选型，
 * 把机型型号 / 工序 / 板件特性的名称和 Sensor 文字摊平成一条文档。
 * 还没放进 Tab 的机型看不到内容，不进索引。
 * 调用方应包在 store.batchRead 里，让归一化结果在一次构建内只算一次。
 */
export function buildMachineSearchDocuments(
  store: SelectionStore,
  groups: readonly EntityGroup[],
): MachineStructureSearchDocument[] {
  const documents: MachineStructureSearchDocument[] = [];
  const machineModelById = new Map(
    store.dictionaryItems('machine-model').map((item) => [item.id, item]),
  );
  const processStepById = new Map(
    store.processSteps.map((item) => [item.id, item]),
  );
  const boardCharacteristicById = new Map(
    store
      .dictionaryItems('board-characteristic')
      .map((item) => [item.id, item]),
  );
  const sensorById = new Map(
    store.sensors.map((sensor) => [sensor.id, sensor]),
  );
  const treeItemByName = new Map(
    listEntityTreeItems([...groups]).map((item) => [item.name, item]),
  );
  const tabs = store.machineTabs.filter(
    (tab) => tab.catalog === 'mechanism' && tab.kind === 'structure',
  );
  for (const tab of tabs) {
    for (const machineName of tab.machines) {
      const treeItem = treeItemByName.get(machineName);
      if (!treeItem) continue;
      for (const row of store.machineSectionRows(
        MACHINE_CONTENT_SECTION_ID,
        machineName,
      )) {
        const machineModel =
          row.machineModelId == null
            ? undefined
            : machineModelById.get(row.machineModelId);
        const processStep =
          row.processStepId == null
            ? undefined
            : processStepById.get(row.processStepId);
        const boardCharacteristic =
          row.boardCharacteristicId == null
            ? undefined
            : boardCharacteristicById.get(row.boardCharacteristicId);
        const sensors = row.sensorIds
          .map((id) => sensorById.get(id))
          .filter((sensor) => Boolean(sensor));
        documents.push({
          boardCharacteristicId: row.boardCharacteristicId,
          boardCharacteristicName: boardCharacteristic?.name ?? '',
          category: treeItem.category,
          configuration: treeItem.configuration ?? '',
          machineModelId: row.machineModelId,
          machineModelName: machineModel?.name ?? '',
          machineName,
          processStepId: row.processStepId,
          processStepName: processStep
            ? `${processStep.layer} · ${processStep.name}`
            : '',
          rowId: row.id,
          searchableText: [
            row.role,
            row.purpose,
            row.note,
            ...sensors.flatMap((sensor) => [
              sensor?.sensorType,
              sensor?.brand,
              sensor?.model,
              sensor?.spec,
            ]),
          ]
            .filter(Boolean)
            .join(' '),
          // 结果按「Tab + 机型」聚合，点开时跳到这个 Tab
          sectionId: tab.id,
          sectionName: tab.name,
        });
      }
    }
  }
  return documents;
}
