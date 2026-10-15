import type { DictionaryRestoreSheet } from '@/domain';
import type { ExcelSheetData } from '@/pages/shared/excel';

export const DICTIONARY_EXPORT_HEADERS = ['排序', '字典项名称'] as const;

/** 按表头文字读入每个工作表。排序列可以没有，名称列没有时交给领域层整表拒绝。 */
export function mapDictionaryWorkbook(
  sheets: readonly ExcelSheetData[],
): DictionaryRestoreSheet[] {
  return sheets.map((sheet) => {
    const headers = (sheet.rows[0] ?? []).map((cell) => cell.trim());
    const nameIndex = headers.indexOf('字典项名称');
    const sortIndex = headers.indexOf('排序');
    return {
      hasNameColumn: nameIndex >= 0,
      name: sheet.sheetName,
      rows: sheet.rows.slice(1).map((row, index) => ({
        name: nameIndex >= 0 ? (row[nameIndex] ?? '') : '',
        rowNumber: index + 2,
        sort: sortIndex >= 0 ? (row[sortIndex] ?? '') : '',
      })),
    };
  });
}
