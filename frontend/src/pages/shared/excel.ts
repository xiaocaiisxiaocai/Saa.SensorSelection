import { sanitizeExcelSheetName } from '@/domain/sheet-name';

export const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MAX_XLSX_BYTES = 20 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;

export interface ExcelSheetInput {
  name: string;
  headers: string[];
  rows: string[][];
}

export interface ExcelSheetData {
  sheetName: string;
  rows: string[][];
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

interface ZipCentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

export function formatExcelDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildExcelWorkbook(
  input: { sheets: ExcelSheetInput[]; title?: string },
  now = new Date(),
) {
  const used = new Set<string>();
  const sheets = input.sheets.map((sheet, index) => {
    let name = sanitizeExcelSheetName(sheet.name || `Sheet${index + 1}`);
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      const extra = ` (${suffix})`;
      name = `${sanitizeExcelSheetName(sheet.name || `Sheet${index + 1}`).slice(0, 31 - extra.length)}${extra}`;
      suffix += 1;
    }
    used.add(name.toLowerCase());
    return { ...sheet, name };
  });
  const createdAt = now.toISOString();
  const entries: ZipEntry[] = [
    xmlEntry('[Content_Types].xml', contentTypesXml(sheets.length)),
    xmlEntry('_rels/.rels', rootRelationshipsXml()),
    xmlEntry('docProps/app.xml', appPropertiesXml()),
    xmlEntry('docProps/core.xml', corePropertiesXml(createdAt, input.title)),
    xmlEntry('xl/workbook.xml', workbookXml(sheets.map((sheet) => sheet.name))),
    xmlEntry(
      'xl/_rels/workbook.xml.rels',
      workbookRelationshipsXml(sheets.length),
    ),
    xmlEntry('xl/styles.xml', stylesXml()),
  ];
  sheets.forEach((sheet, index) => {
    entries.push(
      xmlEntry(
        `xl/worksheets/sheet${index + 1}.xml`,
        worksheetXml(sheet.headers, sheet.rows),
      ),
    );
  });
  return createZip(entries, now);
}

export function downloadExcelFile(fileName: string, bytes: Uint8Array) {
  const blob = bytesBlob(bytes, XLSX_MIME_TYPE);
  const url = URL.createObjectURL(blob);
  const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => revokeObjectUrl(url), 1000);
  return { blob, bytes, fileName };
}

export async function readWorkbook(bytes: Uint8Array): Promise<ExcelSheetData[]> {
  if (bytes.length === 0 || bytes.length > MAX_XLSX_BYTES) {
    throw new Error('无法读取该 Excel 文件');
  }
  const entries = readCentralDirectory(bytes);
  const files = new Map<string, ZipCentralEntry>();
  for (const entry of entries) files.set(entry.name.toLowerCase(), entry);
  const workbook = await readXmlEntry(bytes, files, 'xl/workbook.xml');
  const rels = await readXmlEntry(bytes, files, 'xl/_rels/workbook.xml.rels');
  const targets = new Map<string, string>();
  for (const rel of childrenNamed(rels.documentElement, 'Relationship')) {
    const id = attribute(rel, 'Id');
    const type = attribute(rel, 'Type');
    const target = attribute(rel, 'Target');
    if (!type.endsWith('/worksheet') || !id || !target) continue;
    targets.set(id, resolveWorksheet(target));
  }
  const shared = files.has('xl/sharedstrings.xml')
    ? sharedStrings(await readXmlEntry(bytes, files, 'xl/sharedStrings.xml'))
    : [];
  const sheets: ExcelSheetData[] = [];
  for (const sheet of childrenNamed(workbook.documentElement, 'sheets').flatMap(
    (node) => childrenNamed(node, 'sheet'),
  )) {
    const name = attribute(sheet, 'name');
    const id = attribute(sheet, 'id');
    const path = targets.get(id);
    if (!path) throw new Error('无法读取该 Excel 文件');
    const xml = await readXmlEntry(bytes, files, path);
    sheets.push({ sheetName: name, rows: sheetRows(xml, shared) });
  }
  return sheets;
}

function worksheetXml(headers: string[], rows: string[][]) {
  const rowCount = rows.length + 1;
  const lastColumn = columnName(Math.max(1, headers.length));
  const range = `A1:${lastColumn}${Math.max(1, rowCount)}`;
  const widths = headers.map((header, columnIndex) => {
    const longest = rows.reduce(
      (length, row) => Math.max(length, displayWidth(row[columnIndex] || '')),
      displayWidth(header),
    );
    return Math.min(42, Math.max(12, longest + 2));
  });
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
        .map((_, index) => {
          const coordinate = `${columnName(index + 1)}${rowIndex + 1}`;
          const value = row[index] || '';
          return `<c r="${coordinate}" s="${rowIndex === 0 ? 1 : 2}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}" ht="${rowIndex === 0 ? 26 : 34}" customHeight="1">${cells}</row>`;
    })
    .join('');
  return `${xmlDeclaration()}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${columnXml}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="${range}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}

function contentTypesXml(sheetCount: number) {
  const sheets = Array.from({ length: Math.max(sheetCount, 1) }, (_, index) => {
    return `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }).join('');
  return `${xmlDeclaration()}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
}

function rootRelationshipsXml() {
  return `${xmlDeclaration()}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function workbookRelationshipsXml(sheetCount: number) {
  const count = Math.max(sheetCount, 1);
  const sheets = Array.from({ length: count }, (_, index) => {
    return `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`;
  }).join('');
  return `${xmlDeclaration()}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function workbookXml(names: string[]) {
  const labels = names.length > 0 ? names : ['全部'];
  const sheets = labels
    .map(
      (name, index) =>
        `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  return `${xmlDeclaration()}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${sheets}</sheets></workbook>`;
}

function appPropertiesXml() {
  return `${xmlDeclaration()}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>SAA 感应器选型</Application><AppVersion>1.0</AppVersion></Properties>`;
}

function corePropertiesXml(createdAt: string, title = 'Sensor 型号导出') {
  return `${xmlDeclaration()}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>SAA 感应器选型</dc:creator><dc:title>${escapeXml(title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified></cp:coreProperties>`;
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

function readCentralDirectory(bytes: Uint8Array): ZipCentralEntry[] {
  const eocd = findEocd(bytes);
  const entries: ZipCentralEntry[] = [];
  let offset = eocd.offset;
  for (let index = 0; index < eocd.count; index += 1) {
    if (offset + 46 > bytes.length) throw new Error('无法读取该 Excel 文件');
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 46);
    if (view.getUint32(0, true) !== 0x02014b50) {
      throw new Error('无法读取该 Excel 文件');
    }
    const method = view.getUint16(10, true);
    const compressedSize = view.getUint32(20, true);
    const uncompressedSize = view.getUint32(24, true);
    const nameLength = view.getUint16(28, true);
    const extraLength = view.getUint16(30, true);
    const commentLength = view.getUint16(32, true);
    const localOffset = view.getUint32(42, true);
    const nameStart = offset + 46;
    const name = new TextDecoder()
      .decode(bytes.subarray(nameStart, nameStart + nameLength))
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEocd(bytes: Uint8Array) {
  const min = Math.max(0, bytes.length - (22 + 65535));
  for (let offset = bytes.length - 22; offset >= min; offset -= 1) {
    if (
      bytes[offset] !== 0x50 ||
      bytes[offset + 1] !== 0x4b ||
      bytes[offset + 2] !== 0x05 ||
      bytes[offset + 3] !== 0x06
    ) {
      continue;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 22);
    const count = view.getUint16(10, true);
    const size = view.getUint32(12, true);
    const start = view.getUint32(16, true);
    if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) {
      throw new Error('无法读取该 Excel 文件');
    }
    return { count, offset: start };
  }
  throw new Error('无法读取该 Excel 文件');
}

async function readXmlEntry(
  bytes: Uint8Array,
  files: Map<string, ZipCentralEntry>,
  name: string,
) {
  const entry = files.get(name.toLowerCase());
  if (!entry) throw new Error('无法读取该 Excel 文件');
  const xml = new TextDecoder().decode(await inflateEntry(bytes, entry));
  return parseXml(xml);
}

async function inflateEntry(bytes: Uint8Array, entry: ZipCentralEntry) {
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error('无法读取该 Excel 文件');
  }
  if (entry.uncompressedSize > MAX_UNCOMPRESSED_BYTES) {
    throw new Error('无法读取该 Excel 文件');
  }
  const local = entry.localOffset;
  if (local + 30 > bytes.length) throw new Error('无法读取该 Excel 文件');
  const view = new DataView(bytes.buffer, bytes.byteOffset + local, 30);
  if (view.getUint32(0, true) !== 0x04034b50) {
    throw new Error('无法读取该 Excel 文件');
  }
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const dataStart = local + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length) throw new Error('无法读取该 Excel 文件');
  const compressed = bytes.subarray(dataStart, dataEnd);
  if (entry.method === 0) return compressed;
  if (typeof DecompressionStream !== 'function') {
    throw new Error('无法读取该 Excel 文件');
  }
  const stream = bytesBlob(compressed)
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const inflated = new Uint8Array(await new Response(stream).arrayBuffer());
  if (inflated.length > MAX_UNCOMPRESSED_BYTES) {
    throw new Error('无法读取该 Excel 文件');
  }
  return inflated;
}

function parseXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('无法读取该 Excel 文件');
  }
  return document;
}

function childrenNamed(parent: ParentNode, name: string) {
  return [...parent.children].filter((child) => child.localName === name);
}

function attribute(element: Element, name: string) {
  const wanted = name.toLowerCase();
  for (const attr of element.attributes) {
    // 浏览器把 r:id 的 localName 收成 id；happy-dom 保留成 r:id。
    const local = attr.localName.toLowerCase();
    if (local === wanted || local.endsWith(`:${wanted}`)) return attr.value;
  }
  return '';
}

function resolveWorksheet(target: string) {
  const clean = target.replace(/\\/g, '/').replace(/^\/+/, '');
  if (clean.toLowerCase().startsWith('xl/')) return clean;
  return `xl/${clean.replace(/^\.\//, '')}`;
}

function sharedStrings(document: Document) {
  return childrenNamed(document.documentElement, 'si').map((item) =>
    textsUnder(item),
  );
}

function textsUnder(element: Element) {
  let text = '';
  const walk = (node: Element) => {
    for (const child of node.children) {
      if (child.localName === 'rPh' || child.localName === 'phoneticPr') {
        continue;
      }
      if (child.localName === 't') text += child.textContent ?? '';
      else walk(child);
    }
  };
  walk(element);
  return text;
}

function sheetRows(document: Document, strings: string[]) {
  const sheetData = childrenNamed(document.documentElement, 'sheetData')[0];
  if (!sheetData) return [];
  const grid = new Map<number, Map<number, string>>();
  let maxRow = -1;
  let maxColumn = -1;
  let fallbackRow = 0;
  for (const row of childrenNamed(sheetData, 'row')) {
    const declared = Number(row.getAttribute('r'));
    const rowIndex =
      Number.isInteger(declared) && declared > 0 ? declared - 1 : fallbackRow;
    fallbackRow = rowIndex + 1;
    let nextColumn = 0;
    for (const cell of childrenNamed(row, 'c')) {
      const ref = cell.getAttribute('r') ?? '';
      const column = /^[A-Z]+/i.test(ref) ? columnIndex(ref) : nextColumn;
      nextColumn = column + 1;
      const columns = grid.get(rowIndex) ?? new Map<number, string>();
      columns.set(column, cellValue(cell, strings));
      grid.set(rowIndex, columns);
      maxRow = Math.max(maxRow, rowIndex);
      maxColumn = Math.max(maxColumn, column);
    }
  }
  if (maxRow < 0) return [];
  return Array.from({ length: maxRow + 1 }, (_, rowIndex) => {
    const columns = grid.get(rowIndex);
    return Array.from({ length: maxColumn + 1 }, (__, columnIndex) => {
      return columns?.get(columnIndex) ?? '';
    });
  });
}

function cellValue(cell: Element, strings: string[]) {
  const type = cell.getAttribute('t') ?? '';
  if (type === 'inlineStr') return textsUnder(cell);
  if (type === 's') {
    const index = Number(directText(cell, 'v'));
    return strings[index] ?? '';
  }
  if (type === 'e') return '';
  return directText(cell, 'v');
}

function directText(element: Element, name: string) {
  return (
    [...element.children].find((child) => child.localName === name)
      ?.textContent ?? ''
  );
}

function columnIndex(ref: string) {
  const letters = /^[A-Z]+/i.exec(ref)?.[0] ?? '';
  let value = 0;
  for (const character of letters.toUpperCase()) {
    value = value * 26 + (character.charCodeAt(0) - 64);
  }
  return value - 1;
}

function bytesBlob(bytes: Uint8Array, type?: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], type ? { type } : undefined);
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
  const result = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  );
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
    date:
      ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
    time:
      (value.getHours() << 11) |
      (value.getMinutes() << 5) |
      (value.getSeconds() >> 1),
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

function isXmlChar(code: number) {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

function escapeXml(value: string) {
  return [...String(value)]
    .filter((character) => isXmlChar(character.codePointAt(0) ?? 0))
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlDeclaration() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
}
