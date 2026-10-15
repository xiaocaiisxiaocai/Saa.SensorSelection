import { describe, expect, it } from 'vitest';

import type { MachineReportSection } from '@/domain';

import { reportMachineNames } from './machine-report';

function section(id: number, machineNames: string[]): MachineReportSection {
  return {
    id,
    name: `Tab ${id}`,
    displayName: `Tab ${id}`,
    sort: id,
    kind: 'structure',
    scope: 'machine',
    blocks: machineNames.map((machineName) => ({
      machineName,
      rows: [],
      images: [],
      sensors: [],
    })),
  } as MachineReportSection;
}

describe('reportMachineNames', () => {
  it('lists a machine once even when several first-level tabs of it are checked', () => {
    // 专案机型的「整机结构」和「专案注意事项」都是直属表格，块名都是机型名
    expect(
      reportMachineNames([
        section(6, ['CSL(U)R-802（插框机）', 'CSZR-102（ESG设备）']),
        section(7, ['CSL(U)R-802（插框机）', 'CSZR-102（ESG设备）']),
      ]),
    ).toEqual(['CSL(U)R-802（插框机）', 'CSZR-102（ESG设备）']);
  });

  it('keeps the order the names first appear in the report', () => {
    expect(
      reportMachineNames([
        section(1, ['B / 输送', 'A / 输送']),
        section(2, ['A / 输送', 'C / 收板']),
      ]),
    ).toEqual(['B / 输送', 'A / 输送', 'C / 收板']);
  });
});
