import { describe, expect, it } from 'vitest';

import type { MachineNodeRef, MachineTab } from '@/domain';

import { commonMachineTabs } from './machine-compare';

const left: MachineNodeRef = {
  category: '结构机型',
  configuration: '标准配置',
  item: '左机型',
};
const right: MachineNodeRef = {
  category: '专案机型',
  configuration: null,
  item: '右机型',
};

const tab = (
  id: number,
  name: string,
  kind: MachineTab['kind'],
  pages: MachineTab['pages'],
): MachineTab => ({
  id,
  catalog: id < 10 ? 'mechanism' : 'project',
  name,
  sort: id,
  kind,
  pages,
});

const directPage = (id: number, node: MachineNodeRef) => ({
  id,
  name: `直属页 ${id}`,
  node,
  direct: true as const,
});

describe('commonMachineTabs', () => {
  it('matches trimmed exact names across catalogs and keeps each side references', () => {
    const leftTab = tab(1, '  输送结构  ', 'structure', [
      directPage(101, left),
    ]);
    const rightTab = tab(11, '输送结构', 'structure', [directPage(201, right)]);
    const sharedTab = tab(2, '注意事项', 'notes', [
      directPage(102, left),
      directPage(202, right),
    ]);

    expect(
      commonMachineTabs([leftTab, rightTab, sharedTab], left, right),
    ).toEqual([
      {
        key: '输送结构',
        name: '输送结构',
        left: { tab: leftTab, page: leftTab.pages[0] },
        right: { tab: rightTab, page: rightTab.pages[0] },
      },
      {
        key: '注意事项',
        name: '注意事项',
        left: { tab: sharedTab, page: sharedTab.pages[0] },
        right: { tab: sharedTab, page: sharedTab.pages[1] },
      },
    ]);
  });

  it('requires direct content on both sides and compatible, case-exact tabs', () => {
    const tabs: MachineTab[] = [
      tab(1, '只有左侧', 'structure', [directPage(101, left)]),
      tab(2, '空脚手架', 'structure', []),
      tab(3, '旧二级页', 'structure', [
        { id: 103, name: '不是直属页', node: left },
        directPage(203, right),
      ]),
      tab(4, '大小写', 'structure', [directPage(104, left)]),
      tab(14, '大小寫', 'structure', [directPage(204, right)]),
      tab(5, 'Case', 'structure', [directPage(105, left)]),
      tab(15, 'case', 'structure', [directPage(205, right)]),
      tab(6, '同名不同表', 'structure', [directPage(106, left)]),
      tab(16, '同名不同表', 'notes', [directPage(206, right)]),
    ];

    expect(commonMachineTabs(tabs, left, right)).toEqual([]);
  });
});
