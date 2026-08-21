import type { MachineRowImage, MachineSectionItem, MachineSectionRow } from './types';

export interface MachineReportMachineBlock {
  machineName: string;
  rows: MachineSectionRow[];
  images?: MachineRowImage[];
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
    return '<span class="report-muted">-</span>';
  }
  return `<img class="report-structure-image" src="${escapeHtml(dataUrl)}" alt="${escapeHtml(image.fileName || '结构示意图')}" />`;
}

function structureRowsMarkup(block: MachineReportMachineBlock): string {
  const rows = block.rows
    .map(
      (row, index) => `
        <article class="report-row">
          <div class="report-row__index">${index + 1}</div>
          <div class="report-row__body">
            <h4>${escapeHtml(row.role || row.sensorType || `记录 ${index + 1}`)}</h4>
            <dl>
              <div><dt>传感器类型</dt><dd>${escapeHtml(row.sensorType || '-')}</dd></div>
              <div><dt>规格</dt><dd>${escapeHtml(row.spec || '-')}</dd></div>
              <div><dt>作用</dt><dd>${escapeHtml(row.purpose || '-')}</dd></div>
              <div><dt>备注</dt><dd>${escapeHtml(row.note || '-')}</dd></div>
            </dl>
          </div>
        </article>`,
    )
    .join('');

  return rows || '<p class="report-empty">此机型在该模块暂无记录。</p>';
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
            ${section.kind === 'structure' && block.images?.length ? `<div class="report-structure-images">${block.images.map((image) => imageMarkup(image)).join('')}</div>` : ''}
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
  machineNames: string[],
  sections: MachineReportSection[],
): string {
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
      .report-header { border-bottom: 2px solid #b45309; padding-bottom: 18px; margin-bottom: 24px; }
      .report-kicker { color: #b45309; font-size: 13px; letter-spacing: .08em; }
      h1 { margin: 6px 0 8px; font-size: 28px; }
      .report-meta { margin: 0; color: #667085; font-size: 14px; line-height: 1.7; }
      .report-meta strong { color: #172033; }
      .report-section { break-inside: avoid; margin: 0 0 26px; }
      .report-section__heading { display: flex; gap: 12px; align-items: flex-start; border-bottom: 1px solid #d8dee8; padding-bottom: 10px; }
      .report-section__number { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 50%; color: #fff; background: #b45309; font-size: 14px; font-weight: 700; }
      .report-section h2 { margin: 0; font-size: 20px; }
      .report-section__heading p { margin: 3px 0 0; color: #667085; font-size: 13px; }
      .report-section__content { padding-top: 12px; }
      .report-machine-block { margin-bottom: 18px; break-inside: avoid; }
      .report-machine-block > h3 { margin: 0; padding: 8px 12px; border-left: 3px solid #b45309; background: #fff7ed; color: #92400e; font-size: 16px; }
      .report-machine-block__content { padding: 0 12px; }
      .report-row { display: grid; grid-template-columns: 30px 1fr; gap: 14px; border-bottom: 1px solid #edf0f4; padding: 12px 0; break-inside: avoid; }
      .report-row__index { color: #98a2b3; font-size: 13px; padding-top: 3px; text-align: center; }
      .report-structure-images { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 12px 0; }
      .report-structure-images img { display: block; width: 100%; height: 180px; object-fit: contain; border: 1px solid #e4e7ec; border-radius: 6px; background: #fafbfc; }
      .report-row h4, .report-note-row h4 { margin: 0 0 7px; font-size: 15px; color: #172033; }
      dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 24px; margin: 0; }
      dl > div { display: grid; grid-template-columns: 72px 1fr; gap: 8px; font-size: 13px; line-height: 1.55; }
      dt { color: #98a2b3; } dd { margin: 0; color: #344054; word-break: break-word; }
      .report-note-row { display: grid; grid-template-columns: 30px 1fr; gap: 14px; border-bottom: 1px solid #edf0f4; padding: 12px 0; break-inside: avoid; }
      .report-note-row p { margin: 0 0 5px; color: #344054; font-size: 14px; line-height: 1.65; }
      .report-note-row small { color: #667085; }
      .report-muted, .report-empty { color: #98a2b3; font-size: 13px; }
      .report-empty { margin: 8px 0; }
      .report-footer { margin-top: 30px; color: #98a2b3; font-size: 12px; text-align: right; }
      @media (max-width: 700px) {
        body { padding: 0; }
        .report-shell { padding: 20px; box-shadow: none; }
        .report-row { grid-template-columns: 24px 1fr; gap: 9px; }
        .report-structure-images { grid-template-columns: 1fr; }
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
      <header class="report-header">
        <div class="report-kicker">SAA · SENSOR SELECTION</div>
        <h1>机型结构示意图报告</h1>
        <p class="report-meta">已选机型：<strong>${machineNames.map((name) => escapeHtml(name)).join('、')}</strong><br />按“结构模块 → 机型 → 传感器记录”拼接生成 · 共 ${machineNames.length} 个机型、${sections.length} 个模块</p>
      </header>
      ${sectionsMarkup || '<p class="report-empty">暂无已选择的机型。</p>'}
      <footer class="report-footer">生成时间：${escapeHtml(new Date().toLocaleString('zh-CN'))}</footer>
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
