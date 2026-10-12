import type { MachineReportSection } from '@/domain';
import type { useSelectionStore } from '@/stores/selection';

type SelectionStore = ReturnType<typeof useSelectionStore>;

const sectionKey = (section: { kind: string; name: string }) =>
  `${section.kind}:${section.name.toLocaleLowerCase('zh-CN')}`;

/**
 * 示意图报告的分区：把所选机型在当前制程下的 Tab 按「类型 + 名称」合并，
 * 每个分区里按机型列出各自的行、示意图和用到的 Sensor。
 */
export function buildReportSections(
  store: SelectionStore,
  machineNames: readonly string[],
  processId: number,
): MachineReportSection[] {
  const resolvedByMachine = new Map(
    machineNames.map((machineName) => [
      machineName,
      store.resolvedMachineSections(machineName, processId),
    ]),
  );
  const sectionMap = new Map<string, MachineReportSection>();
  for (const sectionsForMachine of resolvedByMachine.values()) {
    for (const section of sectionsForMachine) {
      const key = sectionKey(section);
      if (!sectionMap.has(key)) {
        sectionMap.set(key, {
          ...section,
          displayName: section.name,
          blocks: [],
        });
      }
    }
  }
  return [...sectionMap.values()]
    .sort((left, right) => left.sort - right.sort)
    .map((section) => ({
      ...section,
      blocks: machineNames.flatMap((machineName) => {
        const machineSection = resolvedByMachine
          .get(machineName)
          ?.find((candidate) => sectionKey(candidate) === sectionKey(section));
        if (!machineSection) return [];
        const rows = store.machineSectionRows(
          machineSection.id,
          machineName,
          processId,
        );
        const reportRows = rows.map((row) => {
          const processStep = store.processSteps.find(
            (item) => item.id === row.processStepId,
          );
          return {
            ...row,
            processStepName: processStep
              ? `${processStep.layer} · ${processStep.name}`
              : '',
          };
        });
        const structure = section.kind === 'structure';
        return [
          {
            machineName,
            rows: reportRows,
            images: structure
              ? store.machineSectionImages(
                  machineSection.id,
                  machineName,
                  processId,
                )
              : [],
            sensors: structure
              ? store.sensors.filter((sensor) =>
                  rows.some((row) => row.sensorIds.includes(sensor.id)),
                )
              : [],
          },
        ];
      }),
    }));
}

/** 报告里至少有一行数据或一张示意图 */
export function hasReportContent(sections: readonly MachineReportSection[]) {
  return sections.some((section) =>
    section.blocks.some(
      (block) => block.rows.length > 0 || (block.images?.length ?? 0) > 0,
    ),
  );
}
