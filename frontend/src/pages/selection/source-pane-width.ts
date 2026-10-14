/**
 * 左侧目录面板（客户 / 机型）的可拖拽宽度：取值范围、键盘步长，
 * 以及记在本机的宽度（localStorage，按 storageKey 区分页面）。
 */
export const SOURCE_WIDTH_MIN = 200;
export const SOURCE_WIDTH_MAX = 400;
export const SOURCE_WIDTH_STEP = 16;

/** 限制在 [MIN, min(MAX, limit)] 内并取整；limit 是容器给的上限（如右侧内容至少留一半）。 */
export function clampSourceWidth(
  width: number,
  limit = SOURCE_WIDTH_MAX,
): number {
  const upper = Math.max(SOURCE_WIDTH_MIN, Math.min(SOURCE_WIDTH_MAX, limit));
  return Math.round(Math.min(upper, Math.max(SOURCE_WIDTH_MIN, width)));
}

export function readSourceWidth(storageKey: string, fallback: number): number {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return fallback;
    const width = Number(stored);
    return Number.isFinite(width) ? clampSourceWidth(width) : fallback;
  } catch {
    return fallback;
  }
}

export function writeSourceWidth(storageKey: string, width: number | null) {
  try {
    if (width === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, String(width));
  } catch {
    // 本地存储不可用时，本次会话内拖好的宽度仍然有效，静默忽略即可。
  }
}
