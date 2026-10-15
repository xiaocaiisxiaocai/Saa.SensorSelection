function trimSheetNameEdges(value: string) {
  return value.trim().replace(/^'+|'+$/g, '').trim();
}

/**
 * Excel 工作表名：不能含 \ / * ? : [ ]，不能以单引号开头或结尾，最长 31 个
 * 字符，且 History 是保留名。导出和导入必须用同一套规则，工作表才对得上。
 */
export function sanitizeExcelSheetName(value: string, fallback = '全部') {
  const name = trimSheetNameEdges(
    trimSheetNameEdges(value.replace(/[\\/*?:[\]]/g, ' ')).slice(0, 31),
  );
  if (!name) return fallback;
  return name.toLowerCase() === 'history' ? `${name} (1)` : name;
}
