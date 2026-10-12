import {
  MACHINE_CONTENT_SECTION_ID,
  type MachineReportSection,
} from '@/domain';
import type { useSelectionStore } from '@/stores/selection';

type SelectionStore = ReturnType<typeof useSelectionStore>;

/**
 * 示意图报告的分区：每个 Tab 一节，节里按 Tab 内的顺序列出所选机型的
 * 选型记录、示意图和用到的 Sensor。还没放进 Tab 的机型没有内容，不出现在报告里。
 */
export function buildReportSections(
  store: SelectionStore,
  machineNames: readonly string[],
): MachineReportSection[] {
  const selected = new Set(machineNames);
  return store.machineTabs.flatMap((tab) => {
    const structure = tab.kind === 'structure';
    const blocks = tab.machines
      .filter((machineName) => selected.has(machineName))
      .map((machineName) => {
        const rows = store.machineSectionRows(
          MACHINE_CONTENT_SECTION_ID,
          machineName,
        );
        return {
          machineName,
          rows: rows.map((row) => {
            const processStep = store.processSteps.find(
              (item) => item.id === row.processStepId,
            );
            return {
              ...row,
              processStepName: processStep
                ? `${processStep.layer} · ${processStep.name}`
                : '',
            };
          }),
          images: structure
            ? store.machineSectionImages(
                MACHINE_CONTENT_SECTION_ID,
                machineName,
              )
            : [],
          sensors: structure
            ? store.sensors.filter((sensor) =>
                rows.some((row) => row.sensorIds.includes(sensor.id)),
              )
            : [],
        };
      });
    if (blocks.length === 0) return [];
    return [
      {
        id: tab.id,
        name: tab.name,
        displayName: tab.name,
        sort: tab.sort,
        kind: tab.kind,
        scope: 'machine' as const,
        blocks,
      },
    ];
  });
}

/** 报告里至少有一行数据或一张示意图 */
export function hasReportContent(sections: readonly MachineReportSection[]) {
  return sections.some((section) =>
    section.blocks.some(
      (block) => block.rows.length > 0 || (block.images?.length ?? 0) > 0,
    ),
  );
}
