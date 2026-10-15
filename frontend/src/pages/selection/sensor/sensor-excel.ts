import {
  buildExcelWorkbook,
  downloadExcelFile,
  formatExcelDate,
  XLSX_MIME_TYPE,
} from '@/pages/shared/excel';

export { XLSX_MIME_TYPE };

export interface SensorExcelInput {
  pageName: string;
  headers: string[];
  rows: string[][];
}

function safeFileName(value: string) {
  return (
    value
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || '全部'
  );
}

export function buildSensorExcelWorkbook(
  input: SensorExcelInput,
  now = new Date(),
) {
  return buildExcelWorkbook(
    {
      sheets: [
        {
          headers: input.headers,
          name: input.pageName || '全部',
          rows: input.rows,
        },
      ],
      title: 'Sensor 型号导出',
    },
    now,
  );
}

export function createSensorExcelFile(
  input: SensorExcelInput,
  now = new Date(),
) {
  const pageName = safeFileName(input.pageName || '全部');
  const bytes = buildSensorExcelWorkbook(input, now);
  return {
    blob: new Blob([bytes], { type: XLSX_MIME_TYPE }),
    bytes,
    fileName: `Sensor型号-${pageName}-${formatExcelDate(now)}.xlsx`,
  };
}

export function downloadSensorExcel(
  input: SensorExcelInput,
  now = new Date(),
) {
  const file = createSensorExcelFile(input, now);
  downloadExcelFile(file.fileName, file.bytes);
  return file;
}
