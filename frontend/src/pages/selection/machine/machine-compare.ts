import type { MachineNodeRef, MachineTab, MachineTabPage } from '@/domain';

import { pagesOf } from './machine-nodes';

export interface MachineCompareTabSide {
  tab: MachineTab;
  page: MachineTabPage;
}

export interface MachineCompareTab {
  /** Trimmed exact tab name, also used as the stable switch key. */
  key: string;
  name: string;
  left: MachineCompareTabSide;
  right: MachineCompareTabSide;
}

interface DirectTabPage extends MachineCompareTabSide {
  name: string;
}

const directTabsOf = (
  tabs: readonly MachineTab[],
  node: MachineNodeRef,
): DirectTabPage[] =>
  tabs.flatMap((tab) => {
    const page = pagesOf(tab, node).find((candidate) => candidate.direct);
    const name = tab.name.trim();
    return page && name ? [{ name, tab, page }] : [];
  });

/**
 * Tabs that have an existing direct content page for both machine leaves.
 * Names match after trimming and remain case-sensitive; incompatible table kinds
 * are excluded because they cannot share one comparison surface.
 */
export function commonMachineTabs(
  tabs: readonly MachineTab[],
  left: MachineNodeRef,
  right: MachineNodeRef,
): MachineCompareTab[] {
  const rightTabs = directTabsOf(tabs, right);
  return directTabsOf(tabs, left).flatMap((leftSide) => {
    const rightSide = rightTabs.find(
      (candidate) =>
        candidate.name === leftSide.name &&
        candidate.tab.kind === leftSide.tab.kind,
    );
    if (!rightSide) return [];
    return [
      {
        key: leftSide.name,
        name: leftSide.name,
        left: { tab: leftSide.tab, page: leftSide.page },
        right: { tab: rightSide.tab, page: rightSide.page },
      },
    ];
  });
}
