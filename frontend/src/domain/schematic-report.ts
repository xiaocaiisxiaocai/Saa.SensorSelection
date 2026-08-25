import type {
  MachineRowImage,
  MachineSectionItem,
  MachineSectionRow,
} from './types';

export interface MachineReportSensor {
  id: number;
  sensorType: string;
  brand: string;
  model: string;
  spec: string;
}

export interface MachineReportMachineBlock {
  machineName: string;
  rows: MachineSectionRow[];
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
  if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(dataUrl)) {
    return '';
  }
  return `<img class="report-structure-image" src="${escapeHtml(dataUrl)}" alt="${escapeHtml(image.fileName || '结构示意图')}" />`;
}

function imageOverviewMarkup(sections: MachineReportSection[]): string {
  const images = sections
    .filter((section) => section.kind === 'structure')
    .flatMap((section) => section.blocks)
    .flatMap((block) => block.images ?? [])
    .map((image) => imageMarkup(image))
    .filter(Boolean)
    .join('');

  return images
    ? `<section class="report-image-overview" aria-label="结构示意图">${images}</section>`
    : '';
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
          (sensor ? [sensor.brand, sensor.model].filter(Boolean).join(' ') : '') ||
          row.spec ||
          '-';
        const leadingCells =
          sensorIndex === 0
            ? `<td rowspan="${rowSpan}">${index + 1}</td><td rowspan="${rowSpan}">${escapeHtml(row.role || sensorType || `记录 ${index + 1}`)}</td>`
            : '';
        const trailingCells =
          sensorIndex === 0
            ? `<td rowspan="${rowSpan}">${escapeHtml(row.purpose || '-')}</td><td rowspan="${rowSpan}">${escapeHtml(row.note || '-')}</td>`
            : '';
        return `<tr>${leadingCells}<td>${escapeHtml(sensorType)}</td><td>${escapeHtml(spec)}</td>${trailingCells}</tr>`;
      });
    })
    .join('');

  if (!rows) return '<p class="report-empty">此机型在该模块暂无记录。</p>';
  return `<table class="report-structure-table"><thead><tr><th>序号</th><th>功能作用</th><th>传感器类型</th><th>规格</th><th>作用</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    .map(
      (block) => `
        <article class="report-machine-block">
          <h3>${escapeHtml(block.machineName)}</h3>
          <div class="report-machine-block__content">
            ${section.kind === 'notes' ? notesRowsMarkup(block) : structureRowsMarkup(block)}
          </div>
        </article>`,
    )
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
  const imageOverview = imageOverviewMarkup(sections);
  const sectionsMarkup = sections.map((section) => renderSection(section)).join('');

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>机型结构示意图报告</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      :root { color-scheme: light; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #172033; background: #eef2f6; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; }
      .report-shell { max-width: 1180px; margin: 0 auto; background: #fff; padding: 30px 34px 40px; box-shadow: 0 12px 38px rgba(19, 35, 58, .12); }
      .report-actions { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 18px; }
      .report-actions button { border: 0; border-radius: 6px; padding: 9px 16px; color: #fff; background: #b45309; cursor: pointer; font-size: 14px; }
      .report-actions button.secondary { color: #344054; background: #eef2f6; }
      .report-image-overview { display: grid; grid-template-columns: 1fr; gap: 8px; margin: 0 12px 22px; }
      .report-image-overview img { display: block; width: 100%; height: 180px; object-fit: contain; border: 1px solid #e4e7ec; border-radius: 6px; background: #fafbfc; break-inside: avoid; }
      .report-section { break-inside: avoid; margin: 0 0 26px; }
      .report-section__heading { display: flex; gap: 12px; align-items: flex-start; border-bottom: 1px solid #d8dee8; padding-bottom: 10px; }
      .report-section__number { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 50%; color: #fff; background: #b45309; font-size: 14px; font-weight: 700; }
      .report-section h2 { margin: 0; font-size: 20px; }
      .report-section__heading p { margin: 3px 0 0; color: #667085; font-size: 13px; }
      .report-section__content { padding-top: 12px; }
      .report-machine-block { margin-bottom: 18px; break-inside: avoid; }
      .report-machine-block > h3 { margin: 0; padding: 8px 12px; border-left: 3px solid #b45309; background: #fff7ed; color: #92400e; font-size: 16px; }
      .report-machine-block__content { padding: 0 12px; }
      .report-structure-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
      .report-structure-table th, .report-structure-table td { padding: 7px 9px; border-bottom: 1px solid #edf0f4; text-align: left; vertical-align: middle; line-height: 1.45; word-break: break-word; }
      .report-structure-table th { color: #667085; background: #f8fafc; font-weight: 600; }
      .report-structure-table th:nth-child(1), .report-structure-table td:nth-child(1) { width: 42px; text-align: center; color: #98a2b3; }
      .report-structure-table th:nth-child(2), .report-structure-table td:nth-child(2) { width: 15%; }
      .report-structure-table th:nth-child(3), .report-structure-table td:nth-child(3) { width: 14%; }
      .report-structure-table th:nth-child(4), .report-structure-table td:nth-child(4) { width: 26%; }
      .report-structure-table th:nth-child(5), .report-structure-table td:nth-child(5) { width: 17%; }
      .report-structure-table th:nth-child(6), .report-structure-table td:nth-child(6) { width: 18%; }
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
        .report-structure-table { font-size: 12px; }
        .report-structure-table th, .report-structure-table td { padding: 6px; }
        dl { grid-template-columns: 1fr; }
      }
      @media print {
        body { padding: 0; background: #fff; }
        .report-shell { max-width: none; padding: 0; box-shadow: none; }
        .report-actions { display: none; }
      }
    </style>
  </head>
  <body>
    <main class="report-shell">
      <div class="report-actions">
        <button class="secondary" type="button" onclick="window.close()">关闭</button>
        <button type="button" onclick="window.print()">打印 / 保存 PDF</button>
      </div>
      ${imageOverview}
      ${sectionsMarkup || '<p class="report-empty">暂无已选择的机型。</p>'}
    </main>
  </body>
</html>`;
}

export function openMachineSchematicReport(
  machineNames: string[],
  sections: MachineReportSection[],
): boolean {
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) return false;
  reportWindow.document.open();
  reportWindow.document.write(
    buildMachineSchematicReportHtml(machineNames, sections),
  );
  reportWindow.document.close();
  return true;
}
