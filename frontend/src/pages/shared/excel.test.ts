import { describe, expect, it } from 'vitest';

import { buildExcelWorkbook, readWorkbook } from './excel';

const encoder = new TextEncoder();

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function header(size: number, write: (view: DataView) => void) {
  const bytes = new Uint8Array(size);
  write(new DataView(bytes.buffer));
  return bytes;
}

async function zipArchive(
  files: { data: Uint8Array; name: string }[],
  method: 0 | 1 | 8,
) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const stored = file.data;
    const payload =
      method === 8
        ? new Uint8Array(
            await new Response(
              bytesBlob(stored)
                .stream()
                .pipeThrough(new CompressionStream('deflate-raw')),
            ).arrayBuffer(),
          )
        : stored;
    const name = encoder.encode(file.name);
    const local = header(30, (view) => {
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(8, method, true);
      view.setUint32(18, payload.length, true);
      view.setUint32(22, stored.length, true);
      view.setUint16(26, name.length, true);
    });
    localParts.push(concat([local, name, payload]));
    const central = header(46, (view) => {
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(10, method, true);
      view.setUint32(20, payload.length, true);
      view.setUint32(24, stored.length, true);
      view.setUint16(28, name.length, true);
      view.setUint32(42, offset, true);
    });
    centralParts.push(concat([central, name]));
    offset += local.length + name.length + payload.length;
  }
  const centralDirectory = concat(centralParts);
  const end = header(22, (view) => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, files.length, true);
    view.setUint16(10, files.length, true);
    view.setUint32(12, centralDirectory.length, true);
    view.setUint32(16, offset, true);
  });
  return concat([...localParts, centralDirectory, end]);
}

function bytesBlob(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy]);
}

function xml(value: string) {
  return encoder.encode(value);
}

const excelLikeFiles = [
  {
    name: 'xl/workbook.xml',
    data: xml(
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="型号" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
  },
  {
    name: 'xl/_rels/workbook.xml.rels',
    data: xml(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
  },
  {
    name: 'xl/sharedStrings.xml',
    data: xml(
      '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>料号</t></si><si><r><t>型</t></r><r><t>号</t></r></si><si><t>PN-1</t><rPh sb="0" eb="4"><t>skip</t></rPh></si></sst>',
    ),
  },
  {
    name: 'xl/worksheets/sheet1.xml',
    data: xml(
      '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>状态</t></is></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="B2"><v>42</v></c></row><row r="3"><c r="A3" t="e"><v>#REF!</v></c></row><row r="5"><c r="C5" t="s"><v>2</v></c></row></sheetData></worksheet>',
    ),
  },
];

const excelLikeRows = [
  ['料号', '状态', '型号'],
  ['', '42', ''],
  ['', '', ''],
  ['', '', ''],
  ['', '', 'PN-1'],
];

describe('excel workbook', () => {
  it('round-trips sheets written by this app', async () => {
    const bytes = buildExcelWorkbook(
      {
        sheets: [
          {
            headers: ['排序', '字典项名称'],
            name: "'要求分类'",
            rows: [
              ['1', '距离'],
              ['2', '—'],
            ],
          },
          { headers: ['A'], name: 'History', rows: [['x']] },
        ],
        title: '数据字典',
      },
      new Date(2026, 0, 2),
    );
    const sheets = await readWorkbook(bytes);
    expect(sheets.map((sheet) => sheet.sheetName)).toEqual([
      '要求分类',
      'History (1)',
    ]);
    expect(sheets[0]?.rows).toEqual([
      ['排序', '字典项名称'],
      ['1', '距离'],
      ['2', '—'],
    ]);
    expect(sheets[1]?.rows).toEqual([['A'], ['x']]);
  });

  it('reads shared strings, sparse cells and numeric values from an Excel-shaped file', async () => {
    const stored = await zipArchive(excelLikeFiles, 0);
    const deflated = await zipArchive(excelLikeFiles, 8);
    expect(await readWorkbook(stored)).toEqual([
      { rows: excelLikeRows, sheetName: '型号' },
    ]);
    expect(await readWorkbook(deflated)).toEqual([
      { rows: excelLikeRows, sheetName: '型号' },
    ]);
  });

  it('rejects empty, oversized, zip64 and unsupported compression without returning rows', async () => {
    await expect(readWorkbook(new Uint8Array())).rejects.toThrow(
      '无法读取该 Excel 文件',
    );
    await expect(
      readWorkbook(new Uint8Array(20 * 1024 * 1024 + 1)),
    ).rejects.toThrow('无法读取该 Excel 文件');
    const zip64 = new Uint8Array(22);
    new DataView(zip64.buffer).setUint32(0, 0x06054b50, true);
    new DataView(zip64.buffer).setUint16(10, 0xffff, true);
    await expect(readWorkbook(zip64)).rejects.toThrow('无法读取该 Excel 文件');
    const unsupported = await zipArchive(
      [{ data: xml('<workbook/>'), name: 'xl/workbook.xml' }],
      1,
    );
    await expect(readWorkbook(unsupported)).rejects.toThrow(
      '无法读取该 Excel 文件',
    );
  });
});
