import type { MachineReportSection } from './schematic-report';

import { describe, expect, it } from 'vitest';

import { buildMachineSchematicReportHtml } from './schematic-report';

describe('machine schematic report', () => {
  it('按结构模块分组，并在模块内保留机型顺序', () => {
    const sections: MachineReportSection[] = [
      {
        id: 1,
        name: '输送机构',
        displayName: '输送机构',
        sort: 1,
        kind: 'structure',
        scope: 'global',
        blocks: [
          {
            machineName: '中间翻板机',
            rows: [],
            images: [
              {
                dataUrl: 'data:image/png;base64,AAAA',
                fileName: '输送机构示意图.png',
                mimeType: 'image/png',
                size: 4,
              },
            ],
          },
          { machineName: '双边投板机', rows: [] },
        ],
      },
      {
        id: 2,
        name: '手臂机构',
        displayName: '手臂机构',
        sort: 2,
        kind: 'structure',
        scope: 'global',
        blocks: [{ machineName: '压合专用机', rows: [] }],
      },
    ];

    const html = buildMachineSchematicReportHtml(
      ['中间翻板机', '双边投板机', '压合专用机'],
      sections,
    );

    expect(html.indexOf('输送机构')).toBeLessThan(html.indexOf('手臂机构'));
    expect(html.indexOf('中间翻板机')).toBeLessThan(html.indexOf('双边投板机'));
    expect(html).toContain('已选机型：');
    expect(html).toContain('输送机构示意图.png');
    expect(html).toContain('report-structure-images');
  });
});
