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
                sensorIds: [1, 2, 3],
                sensorType: '',
                spec: '',
                purpose: '到位',
                name: '',
                desc: '',
                note: 'a & b',
              },
            ],
            sensors: [
              { id: 1, sensorType: '漫反射', brand: 'OMRON', model: 'E3Z-D61', spec: '检测距离 0~300mm' },
              { id: 2, sensorType: '对射', brand: 'OMRON', model: 'E3Z-T61', spec: '检测距离 0~10m' },
              { id: 3, sensorType: '静电容式', brand: 'OMRON', model: 'E2K-X4ME1', spec: '感应距离 4mm' },
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
    expect(html).toContain('class="report-structure-table"');
    expect(html).toContain('rowspan="3"');
    expect(html).toContain('<th>功能作用</th><th>传感器类型</th>');
    expect(html).toContain('检测距离 0~10m');
    expect(html).toContain('grid-template-columns: 1fr');
    expect(html).not.toContain('SAA · SENSOR SELECTION');
    expect(html).not.toContain('已选机型：');
    expect(html).not.toContain('按“结构模块 → 机型 → 传感器记录”拼接生成');

    const imageOverviewIndex = html.indexOf(
      '<section class="report-image-overview"',
    );
    const firstSectionIndex = html.indexOf('<section class="report-section">');
    expect(imageOverviewIndex).toBeGreaterThan(0);
    expect(imageOverviewIndex).toBeLessThan(firstSectionIndex);
    expect(html.match(/class="report-structure-image"/g)).toHaveLength(1);
  });
});
