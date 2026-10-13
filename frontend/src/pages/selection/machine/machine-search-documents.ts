import { MACHINE_TAB_PAGE_OWNER } from '@/domain';
import type { useSelectionStore } from '@/stores/selection';

import type { MachineStructureSearchDocument } from './machine-structure-search';

type SelectionStore = ReturnType<typeof useSelectionStore>;

/**
 * 「条件查找」的索引：遍历结构目录里结构类 Tab 下每个二级 Tab 的每一行选型，
 * 把机型型号 / 工序 / 板件特性的名称和 Sensor 文字摊平成一条文档。
 * 文档的 sectionId 是二级 Tab 的 id，category / sectionName 是所属 Tab 名。
 * 调用方应包在 store.batchRead 里，让归一化结果在一次构建内只算一次。
 */
export function buildMachineSearchDocuments(
  store: SelectionStore,
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
  const tabs = store.machineTabs.filter(
    (tab) => tab.catalog === 'mechanism' && tab.kind === 'structure',
  );
  for (const tab of tabs) {
    for (const page of tab.pages) {
      for (const row of store.machineSectionRows(
        page.id,
        MACHINE_TAB_PAGE_OWNER,
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
          category: tab.name,
          configuration: '',
          machineModelId: row.machineModelId,
          machineModelName: machineModel?.name ?? '',
          machineName: page.name,
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
          // 结果按二级 Tab 聚合，点开时跳到它
          sectionId: page.id,
          sectionName: tab.name,
        });
      }
    }
  }
  return documents;
}
