export const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface SensorExcelInput {
  pageName: string;
  headers: string[];
  rows: string[][];
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

export function buildSensorExcelWorkbook(
  input: SensorExcelInput,
  now = new Date(),
) {
  const sheetName = safeSheetName(input.pageName || '全部');
  const rowCount = input.rows.length + 1;
  const lastColumn = columnName(Math.max(1, input.headers.length));
  const sheetRange = `A1:${lastColumn}${Math.max(1, rowCount)}`;
  const widths = input.headers.map((header, columnIndex) => {
    const longest = input.rows.reduce(
      (length, row) => Math.max(length, displayWidth(row[columnIndex] || '')),
      displayWidth(header),
    );
    return Math.min(42, Math.max(12, longest + 2));
  });
  const worksheet = worksheetXml(input.headers, input.rows, widths, sheetRange);
  const createdAt = now.toISOString();
  const entries: ZipEntry[] = [
    xmlEntry('[Content_Types].xml', contentTypesXml()),
    xmlEntry('_rels/.rels', rootRelationshipsXml()),
    xmlEntry('docProps/app.xml', appPropertiesXml()),
    xmlEntry('docProps/core.xml', corePropertiesXml(createdAt)),
    xmlEntry('xl/workbook.xml', workbookXml(sheetName)),
    xmlEntry('xl/_rels/workbook.xml.rels', workbookRelationshipsXml()),
    xmlEntry('xl/styles.xml', stylesXml()),
    xmlEntry('xl/worksheets/sheet1.xml', worksheet),
  ];

  return createZip(entries, now);
}

export function createSensorExcelFile(
  input: SensorExcelInput,
  now = new Date(),
) {
  const pageName = safeFileName(input.pageName || '全部');
  const date = formatDate(now);
  const bytes = buildSensorExcelWorkbook(input, now);
  return {
    blob: new Blob([bytes], { type: XLSX_MIME_TYPE }),
    bytes,
    fileName: `Sensor型号-${pageName}-${date}.xlsx`,
  };
}

export function downloadSensorExcel(
  input: SensorExcelInput,
  now = new Date(),
) {
  const file = createSensorExcelFile(input, now);
  const url = URL.createObjectURL(file.blob);
  const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => revokeObjectUrl(url), 0);
  return file;
}

function worksheetXml(
  headers: string[],
  rows: string[][],
  widths: number[],
  range: string,
) {
  const columnXml = widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join('');
  const allRows = [headers, ...rows];
  const rowXml = allRows
    .map((row, rowIndex) => {
      const cells = headers
        .map((_, columnIndex) => {
          const coordinate = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
          const value = row[columnIndex] || '';
          return `<c r="${coordinate}" s="${rowIndex === 0 ? 1 : 2}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}" ht="${rowIndex === 0 ? 26 : 34}" customHeight="1">${cells}</row>`;
    })
    .join('');

  return `${xmlDeclaration()}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${columnXml}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="${range}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}

function contentTypesXml() {
  return `${xmlDeclaration()}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
}

function rootRelationshipsXml() {
  return `${xmlDeclaration()}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function workbookRelationshipsXml() {
  return `${xmlDeclaration()}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function workbookXml(sheetName: string) {
  return `${xmlDeclaration()}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function appPropertiesXml() {
  return `${xmlDeclaration()}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>SAA 感应器选型</Application><AppVersion>1.0</AppVersion></Properties>`;
}

function corePropertiesXml(createdAt: string) {
  return `${xmlDeclaration()}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>SAA 感应器选型</dc:creator><dc:title>Sensor 型号导出</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified></cp:coreProperties>`;
}

function stylesXml() {
  return `${xmlDeclaration()}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Microsoft YaHei"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1677FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9E1EC"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function createZip(entries: ZipEntry[], now: Date) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const { date, time } = dosDateTime(now);

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const localHeader = binaryHeader(30, (view) => {
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, time, true);
      view.setUint16(12, date, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, entry.data.length, true);
      view.setUint32(22, entry.data.length, true);
      view.setUint16(26, name.length, true);
      view.setUint16(28, 0, true);
    });
    const localEntry = concatBytes([localHeader, name, entry.data]);
    localParts.push(localEntry);

    const centralHeader = binaryHeader(46, (view) => {
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, time, true);
      view.setUint16(14, date, true);
      view.setUint32(16, crc, true);
      view.setUint32(20, entry.data.length, true);
      view.setUint32(24, entry.data.length, true);
      view.setUint16(28, name.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, offset, true);
    });
    centralParts.push(concatBytes([centralHeader, name]));
    offset += localEntry.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = binaryHeader(22, (view) => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, entries.length, true);
    view.setUint16(10, entries.length, true);
    view.setUint32(12, centralDirectory.length, true);
    view.setUint32(16, offset, true);
    view.setUint16(20, 0, true);
  });
  return concatBytes([...localParts, centralDirectory, end]);
}

function xmlEntry(name: string, value: string): ZipEntry {
  return { name, data: encoder.encode(value) };
}

function binaryHeader(size: number, write: (view: DataView) => void) {
  const bytes = new Uint8Array(size);
  write(new DataView(bytes.buffer));
  return bytes;
}

function concatBytes(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(value: Date) {
  const year = Math.max(1980, value.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | (value.getSeconds() >> 1),
  };
}

function columnName(index: number) {
  let value = index;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function displayWidth(value: string) {
  return [...value].reduce(
    (width, character) => width + (character.charCodeAt(0) > 0xff ? 2 : 1),
    0,
  );
}

function escapeXml(value: string) {
  return [...String(value)]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeSheetName(value: string) {
  return value.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || '全部';
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || '全部';
}

function formatDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function xmlDeclaration() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
}
