import { MACHINE_TAB_PAGE_OWNER, type MachineReportSection } from '@/domain';
import type { useSelectionStore } from '@/stores/selection';

import { nodeLabel } from './machine-nodes';

type SelectionStore = ReturnType<typeof useSelectionStore>;

/**
 * 示意图报告的分区：每个 Tab 一节，节里按 Tab 内的顺序列出所勾选二级 Tab 的
 * 选型记录、示意图和用到的 Sensor。
 */
export function buildReportSections(
  store: SelectionStore,
  pageIds: readonly number[],
): MachineReportSection[] {
  const selected = new Set(pageIds);
  return store.machineTabs.flatMap((tab) => {
    const structure = tab.kind === 'structure';
    const blocks = tab.pages
      .filter((page) => selected.has(page.id))
      .map((page) => {
        const rows = store.machineSectionRows(page.id, MACHINE_TAB_PAGE_OWNER);
        return {
          // 报告里写明是哪个选单节点下的二级 Tab
          // 机型的直属表格没有二级 Tab 名，标题只写机型名
          machineName: page.direct
            ? nodeLabel(page.node)
            : `${nodeLabel(page.node)} / ${page.name}`,
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
          // 示意图挂在记录上；共用同一张图的记录只放一次
          images: structure
            ? [
                ...new Map(
                  rows
                    .flatMap((row) => (row.image ? [row.image] : []))
                    .map((image) => [image.dataUrl, image] as const),
                ).values(),
              ]
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
