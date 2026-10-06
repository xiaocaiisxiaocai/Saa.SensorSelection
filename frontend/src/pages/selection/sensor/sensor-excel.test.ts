import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildSensorExcelWorkbook, downloadSensorExcel } from './sensor-excel';

// 工作簿用 stored（不压缩）的 zip 打包，直接按 UTF-8 解码即可读到 XML 正文。
function workbookText(pageName: string, rows: string[][] = []) {
  return new TextDecoder().decode(
    buildSensorExcelWorkbook({ headers: ['型号'], pageName, rows }),
  );
}

function sheetName(text: string) {
  return /<sheet name="([^"]*)"/.exec(text)?.[1];
}

describe('sensor-excel', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('drops characters that are not legal in XML 1.0', () => {
    const text = workbookText('全部', [
      [`A￾B￿C\uD800D\uDC00E\u0001F😀G`],
    ]);
    expect(text).toContain('ABCDEF😀G');
  });

  it('strips edge apostrophes and avoids the reserved History sheet name', () => {
    expect(sheetName(workbookText("'备选'"))).toBe('备选');
    expect(sheetName(workbookText('History'))).toBe('History (1)');
    expect(sheetName(workbookText("''"))).toBe('全部');
  });

  it('revokes the object URL only after the download has had time to start', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    const NativeUrl = URL;
    class DownloadTestUrl extends NativeUrl {
      static createObjectURL() {
        return 'blob:sensor-excel-test';
      }

      static revokeObjectURL(url: string) {
        revoke(url);
      }
    }
    vi.stubGlobal('URL', DownloadTestUrl);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadSensorExcel({ headers: ['型号'], pageName: '全部', rows: [] });
    vi.advanceTimersByTime(999);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith('blob:sensor-excel-test');
  });
});
