import { describe, expect, it } from 'vitest';

import {
  buildMachineSchematicReportHtml,
  type MachineReportSection,
} from './schematic-report';

describe('buildMachineSchematicReportHtml', () => {
  it('escapes text and only inlines whitelisted image data URLs', () => {
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
            machineName: '<中间翻板机>',
            rows: [
              {
                id: 1,
                role: '进板检测',
                sensorIds: [1],
                sensorType: '漫反射',
                spec: 'E3Z-D61',
                purpose: '到位',
                name: '',
                desc: '',
                note: 'a & b',
              },
            ],
            images: [
              {
                dataUrl: 'javascript:alert(1)',
                fileName: 'bad.png',
                mimeType: 'image/png',
                size: 4,
              },
              {
                dataUrl: 'data:image/png;base64,AAAA',
                fileName: 'ok.png',
                mimeType: 'image/png',
                size: 4,
              },
            ],
          },
        ],
      },
    ];

    const html = buildMachineSchematicReportHtml(['<中间翻板机>'], sections);
    expect(html).toContain('&lt;中间翻板机&gt;');
    expect(html).not.toContain('javascript:alert(1)');
    expect(html).toContain('data:image/png;base64,AAAA');
    expect(html).toContain('ok.png');
    expect(html.indexOf('输送机构')).toBeGreaterThan(0);
  });
});
