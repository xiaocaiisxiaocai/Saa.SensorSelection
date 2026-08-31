import type {
  MachineRowImage,
  MachineSectionItem,
  MachineSectionRow,
} from './types';
import { isStoredFileSource } from './normalize';

export interface MachineReportSensor {
  id: number;
  sensorType: string;
  brand: string;
  model: string;
  spec: string;
}

export interface MachineReportRow extends MachineSectionRow {
  processStepName?: string;
}

export interface MachineReportMachineBlock {
  machineName: string;
  rows: MachineReportRow[];
  images?: MachineRowImage[];
  sensors?: MachineReportSensor[];
}

export interface MachineReportSection extends Omit<MachineSectionItem, 'name'> {
  name: string;
  displayName: string;
  blocks: MachineReportMachineBlock[];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function imageMarkup(image: MachineRowImage): string {
  const dataUrl = image.dataUrl || '';
  if (!isStoredFileSource(dataUrl, 'data:image/')) {
    return '';
  }
  return `<img class="report-structure-image" src="${escapeHtml(dataUrl)}" alt="${escapeHtml(image.fileName || '结构示意图')}" />`;
}

function structureRowsMarkup(block: MachineReportMachineBlock): string {
  const rows = block.rows
    .flatMap((row, index) => {
      const sensors = (row.sensorIds ?? [])
        .map((id) => block.sensors?.find((sensor) => sensor.id === id))
        .filter((sensor): sensor is MachineReportSensor => Boolean(sensor));
      const displaySensors: Array<MachineReportSensor | null> =
        sensors.length > 0 ? sensors : [null];
      const rowSpan = displaySensors.length;

      return displaySensors.map((sensor, sensorIndex) => {
        const sensorType = sensor?.sensorType || row.sensorType || '-';
        const spec =
          sensor?.spec ||
          (sensor
            ? [sensor.brand, sensor.model].filter(Boolean).join(' ')
            : '') ||
          row.spec ||
          '-';
        const leadingCells =
          sensorIndex === 0
            ? `<td class="report-structure-table__serial" rowspan="${rowSpan}">${index + 1}</td><td class="report-structure-table__role" rowspan="${rowSpan}">${escapeHtml(row.role || sensorType || `记录 ${index + 1}`)}</td><td class="report-structure-table__process" rowspan="${rowSpan}">${escapeHtml(row.processStepName || '-')}</td>`
            : '';
        const trailingCells =
          sensorIndex === 0
            ? `<td class="report-structure-table__purpose" rowspan="${rowSpan}">${escapeHtml(row.purpose || '-')}</td><td class="report-structure-table__note" rowspan="${rowSpan}">${escapeHtml(row.note || '-')}</td>`
            : '';
        return `<tr>${leadingCells}<td class="report-structure-table__sensor">${escapeHtml(sensorType)}</td><td class="report-structure-table__spec">${escapeHtml(spec)}</td>${trailingCells}</tr>`;
      });
    })
    .join('');

  if (!rows) return '<p class="report-empty">此机型在该模块暂无记录。</p>';
  return `<table class="report-structure-table"><colgroup><col class="report-structure-table__serial-col" /><col class="report-structure-table__role-col" /><col class="report-structure-table__process-col" /><col class="report-structure-table__sensor-col" /><col class="report-structure-table__spec-col" /><col class="report-structure-table__purpose-col" /><col class="report-structure-table__note-col" /></colgroup><thead><tr><th class="report-structure-table__serial">序号</th><th>功能作用</th><th>工艺制程</th><th>传感器类型</th><th>规格</th><th>作用</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function notesRowsMarkup(block: MachineReportMachineBlock): string {
  const rows = block.rows
    .map(
      (row, index) => `
        <article class="report-note-row">
          <div class="report-row__index">${index + 1}</div>
          <div>
            <h4>${escapeHtml(row.name || row.role || `事项 ${index + 1}`)}</h4>
            <p>${escapeHtml(row.desc || '-')}</p>
            <small>${escapeHtml(row.note || '')}</small>
          </div>
        </article>`,
    )
    .join('');

  return rows || '<p class="report-empty">此机型在该模块暂无记录。</p>';
}

function renderSection(section: MachineReportSection): string {
  const blocks = section.blocks
    .map((block) => {
      const images = (block.images ?? [])
        .map((image) => imageMarkup(image))
        .filter(Boolean)
        .join('');
      const hasImages = images.length > 0;
      const layoutClass = hasImages
        ? 'report-machine-block__layout--with-image'
        : 'report-machine-block__layout--full';
      const imageColumn = hasImages
        ? `<div class="report-machine-block__images" aria-label="结构示意图">${images}</div>`
        : '';
      return `
        <article class="report-machine-block">
          <h3>${escapeHtml(block.machineName)}</h3>
          <div class="report-machine-block__layout ${layoutClass}">
            ${imageColumn}
            <div class="report-machine-block__content">
              ${section.kind === 'notes' ? notesRowsMarkup(block) : structureRowsMarkup(block)}
            </div>
          </div>
        </article>`;
    })
    .join('');

  return `
    <section class="report-section">
      <div class="report-section__heading">
        <span class="report-section__number">${section.sort}</span>
        <div>
          <h2>${escapeHtml(section.displayName)}</h2>
          <p>${section.blocks.length} 个机型</p>
        </div>
      </div>
      <div class="report-section__content">
        ${blocks || '<p class="report-empty">已选机型在此模块暂无内容。</p>'}
      </div>
    </section>`;
}

export function buildMachineSchematicReportHtml(
  _machineNames: string[],
  sections: MachineReportSection[],
): string {
  const sectionsMarkup = sections
    .map((section) => renderSection(section))
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>机型结构示意图报告</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      :root { color-scheme: light; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #172033; background: #fff; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; background: #eef2f6; }
      .report-shell { max-width: 1180px; margin: 0 auto; background: #fff; padding: 30px 34px 40px; box-shadow: 0 12px 38px rgba(19, 35, 58, .12); }
      .report-actions { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 18px; }
      .report-actions button { border: 0; border-radius: 6px; padding: 9px 16px; color: #fff; background: #b45309; cursor: pointer; font-size: 14px; }
      .report-actions button.secondary { color: #344054; background: #eef2f6; }
      .report-section { break-inside: avoid; margin: 0 0 26px; }
      .report-section__heading { display: flex; gap: 12px; align-items: flex-start; border-bottom: 1px solid #d8dee8; padding-bottom: 10px; }
      .report-section__number { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 50%; color: #fff; background: #b45309; font-size: 14px; font-weight: 700; }
      .report-section h2 { margin: 0; font-size: 20px; }
      .report-section__heading p { margin: 3px 0 0; color: #667085; font-size: 13px; }
      .report-section__content { padding-top: 12px; }
      .report-machine-block { margin-bottom: 18px; break-inside: avoid; }
      .report-machine-block > h3 { margin: 0; padding: 8px 12px; border-left: 3px solid #b45309; background: #fff7ed; color: #92400e; font-size: 16px; }
      .report-machine-block__layout { padding: 10px 12px 0; }
      .report-machine-block__layout--with-image { display: grid; grid-template-columns: minmax(220px, 0.8fr) minmax(0, 2fr); gap: 16px; align-items: start; }
      .report-machine-block__layout--full { display: block; }
      .report-machine-block__images { display: grid; gap: 8px; min-width: 0; }
      .report-machine-block__images img { display: block; width: 100%; max-height: 300px; object-fit: contain; border: 1px solid #e4e7ec; border-radius: 6px; background: #fafbfc; break-inside: avoid; }
      .report-machine-block__content { min-width: 0; }
      .report-structure-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 14px; }
      .report-structure-table th, .report-structure-table td { padding: 7px 8px; border-bottom: 1px solid #edf0f4; text-align: left; vertical-align: middle; line-height: 1.5; word-break: break-word; }
      .report-structure-table th { color: #667085; background: #f8fafc; font-weight: 600; }
      .report-structure-table__serial-col { width: 42px; }
      .report-structure-table__role-col { width: 13%; }
      .report-structure-table__process-col { width: 14%; }
      .report-structure-table__sensor-col { width: 12%; }
      .report-structure-table__spec-col { width: 22%; }
      .report-structure-table__purpose-col { width: 15%; }
      .report-structure-table__note-col { width: 17%; }
      .report-structure-table__serial { text-align: center !important; color: #98a2b3; }
      .report-structure-table tbody tr:last-child td { border-bottom-color: #d8dee8; }
      .report-row { display: grid; grid-template-columns: 30px 1fr; gap: 14px; border-bottom: 1px solid #edf0f4; padding: 12px 0; break-inside: avoid; }
      .report-row__index { color: #98a2b3; font-size: 13px; padding-top: 3px; text-align: center; }
      .report-row h4, .report-note-row h4 { margin: 0 0 7px; font-size: 15px; color: #172033; }
      dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 24px; margin: 0; }
      dl > div { display: grid; grid-template-columns: 72px 1fr; gap: 8px; font-size: 13px; line-height: 1.55; }
      dt { color: #98a2b3; } dd { margin: 0; color: #344054; word-break: break-word; }
      .report-note-row { display: grid; grid-template-columns: 30px 1fr; gap: 14px; border-bottom: 1px solid #edf0f4; padding: 12px 0; break-inside: avoid; }
      .report-note-row p { margin: 0 0 5px; color: #344054; font-size: 14px; line-height: 1.65; }
      .report-note-row small { color: #667085; }
      .report-muted, .report-empty { color: #98a2b3; font-size: 13px; }
      .report-empty { margin: 8px 0; }
      @media (max-width: 700px) {
        body { padding: 0; }
        .report-shell { padding: 20px; box-shadow: none; }
        .report-row { grid-template-columns: 24px 1fr; gap: 9px; }
        .report-machine-block__layout--with-image { grid-template-columns: 1fr; }
        .report-machine-block__images img { max-height: 240px; }
        .report-structure-table { font-size: 12px; }
        .report-structure-table th, .report-structure-table td { padding: 5px 6px; }
        dl { grid-template-columns: 1fr; }
      }
      @media print {
        body { padding: 0; background: #fff; }
        .report-shell { max-width: none; padding: 0; box-shadow: none; }
        .report-actions { display: none; }
        .report-structure-table { font-size: 14px; }
      }
    </style>
  </head>
  <body>
    <main class="report-shell">
      <div class="report-actions">
        <button class="secondary" type="button" onclick="window.close()">关闭</button>
        <button type="button" onclick="window.print()">打印 / 保存 PDF</button>
      </div>
      ${sectionsMarkup || '<p class="report-empty">暂无已选择的机型。</p>'}
    </main>
  </body>
</html>`;
}

export function openMachineSchematicReport(
  machineNames: string[],
  sections: MachineReportSection[],
): boolean {
  const currentScreen = window.screen as Screen & {
    readonly availLeft?: number;
    readonly availTop?: number;
  };
  const width = currentScreen.availWidth || window.innerWidth;
  const height = currentScreen.availHeight || window.innerHeight;
  const left = currentScreen.availLeft ?? 0;
  const top = currentScreen.availTop ?? 0;
  const features = [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');
  const reportWindow = window.open('', '_blank', features);
  if (!reportWindow) return false;
  reportWindow.moveTo(left, top);
  reportWindow.resizeTo(width, height);
  reportWindow.document.open();
  reportWindow.document.write(
    buildMachineSchematicReportHtml(machineNames, sections),
  );
  reportWindow.document.close();
  reportWindow.focus();
  return true;
}
