import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildMachineSchematicReportHtml,
  openMachineSchematicReport,
  type MachineReportSection,
} from './schematic-report';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
                machineModelId: null,
                processStepId: 1,
                boardCharacteristicId: null,
                processStepName: '内层 · DES 显影',
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
              {
                id: 1,
                sensorType: '漫反射',
                brand: 'OMRON',
                model: 'E3Z-D61',
                spec: '检测距离 0~300mm',
              },
              {
                id: 2,
                sensorType: '对射',
                brand: 'OMRON',
                model: 'E3Z-T61',
                spec: '检测距离 0~10m',
              },
              {
                id: 3,
                sensorType: '静电容式',
                brand: 'OMRON',
                model: 'E2K-X4ME1',
                spec: '感应距离 4mm',
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
          {
            machineName: '无图机型',
            rows: [
              {
                id: 2,
                role: '出板检测',
                machineModelId: null,
                processStepId: null,
                boardCharacteristicId: null,
                sensorIds: [],
                sensorType: '光纤式',
                spec: '检测距离 4mm',
                purpose: '确认出板',
                name: '',
                desc: '',
                note: '',
              },
            ],
            images: [],
          },
        ],
      },
    ];

    const html = buildMachineSchematicReportHtml(
      ['<中间翻板机>', '无图机型'],
      sections,
    );
    expect(html).toContain('&lt;中间翻板机&gt;');
    expect(html).not.toContain('javascript:alert(1)');
    expect(html).toContain('data:image/png;base64,AAAA');
    expect(html).toContain('ok.png');
    expect(html.indexOf('输送机构')).toBeGreaterThan(0);
    expect(html).toContain('class="report-structure-table"');
    expect(html).toContain('<th>工艺制程</th>');
    expect(html).toContain('内层 · DES 显影');
    expect(html).toContain('rowspan="3"');
    expect(html).toContain(
      '<th>功能作用</th><th>工艺制程</th><th>传感器类型</th>',
    );
    expect(html).toContain('检测距离 0~10m');
    expect(html).toContain(
      '<tr><td class="report-structure-table__sensor">对射</td><td class="report-structure-table__spec">检测距离 0~10m</td></tr>',
    );
    expect(html).toContain(
      'class="report-structure-table__serial" rowspan="3"',
    );
    expect(html).toContain(
      '<col class="report-structure-table__sensor-col" />',
    );
    expect(html).not.toContain('.report-structure-table td:nth-child(1)');
    expect(html).toContain('report-machine-block__layout--with-image');
    expect(html).toContain('report-machine-block__layout--full');
    expect(html).toContain(
      'grid-template-columns: minmax(220px, 0.8fr) minmax(0, 2fr);',
    );
    expect(html).toContain(
      '.report-machine-block__images img { display: block; width: 100%;',
    );
    expect(html).toContain(
      '.report-structure-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 14px; }',
    );
    expect(html).toContain(
      '.report-structure-table th, .report-structure-table td { padding: 7px 8px;',
    );
    expect(html).toContain('vertical-align: middle;');
    expect(html).not.toContain('vertical-align: top;');
    expect(html).toContain('line-height: 1.5;');
    expect(html).toContain('@media print {');
    expect(html).toContain(
      ':root { color-scheme: light; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #172033; background: #fff; }',
    );
    expect(html).toContain(
      'body { margin: 0; padding: 24px; background: #eef2f6; }',
    );
    expect(html).toContain('.report-structure-table { font-size: 14px; }');
    expect(html).not.toContain('SAA · SENSOR SELECTION');
    expect(html).not.toContain('已选机型：');
    expect(html).not.toContain('按“结构模块 → 机型 → 传感器记录”拼接生成');

    expect(html).not.toContain('report-image-overview');
    const firstMachineIndex = html.indexOf('&lt;中间翻板机&gt;');
    const imageIndex = html.indexOf('class="report-structure-image"');
    const firstTableIndex = html.indexOf('class="report-structure-table"');
    expect(firstMachineIndex).toBeGreaterThan(0);
    expect(imageIndex).toBeGreaterThan(firstMachineIndex);
    expect(firstTableIndex).toBeGreaterThan(imageIndex);
    expect(html.match(/class="report-structure-image"/g)).toHaveLength(1);
  });

  it('keeps independently stored image URLs in report previews', () => {
    const html = buildMachineSchematicReportHtml(
      ['机型'],
      [
        {
          id: 1,
          name: '输送机构',
          displayName: '输送机构',
          sort: 1,
          kind: 'structure',
          scope: 'global',
          blocks: [
            {
              machineName: '机型',
              rows: [],
              images: [
                {
                  dataUrl:
                    '/api/files/44444444-4444-4444-4444-444444444444/content',
                  fileName: '结构图.png',
                  mimeType: 'image/png',
                  size: 12,
                },
              ],
            },
          ],
        },
      ],
    );

    expect(html).toContain(
      'src="/api/files/44444444-4444-4444-4444-444444444444/content"',
    );
  });
});

describe('openMachineSchematicReport', () => {
  it('fills and centers on the current screen work area', () => {
    vi.stubGlobal('screen', {
      availWidth: 1600,
      availHeight: 900,
      availLeft: 1920,
      availTop: 40,
    });
    const reportWindow = {
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      },
      focus: vi.fn(),
      moveTo: vi.fn(),
      resizeTo: vi.fn(),
    } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(reportWindow);

    expect(openMachineSchematicReport([], [])).toBe(true);

    expect(open).toHaveBeenCalledWith(
      '',
      '_blank',
      [
        'popup=yes',
        'width=1600',
        'height=900',
        'left=1920',
        'top=40',
        'resizable=yes',
        'scrollbars=yes',
      ].join(','),
    );
    expect(reportWindow.moveTo).toHaveBeenCalledWith(1920, 40);
    expect(reportWindow.resizeTo).toHaveBeenCalledWith(1600, 900);
    expect(reportWindow.focus).toHaveBeenCalledOnce();
  });
});
