import type { TableColumnType } from 'ant-design-vue';
import { computed, reactive } from 'vue';

/**
 * 表格列宽拖拽：拖表头右边缘调宽窄，拖过的宽度按「表格 → 列」记在本机浏览器，
 * 刷新后保留（只是个人偏好，不进后端）。只有定了数字宽度的列能拖；
 * 操作列宽度按按钮个数算好，不让拖。
 */
export const COLUMN_WIDTHS_STORAGE_KEY = 'symtek_column_widths';
export const MIN_COLUMN_WIDTH = 64;
export const MAX_COLUMN_WIDTH = 800;

type WidthMap = Record<string, Record<string, number>>;

function loadWidths(): WidthMap {
  try {
    const raw = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: WidthMap = {};
    for (const [table, columns] of Object.entries(parsed)) {
      if (!columns || typeof columns !== 'object') continue;
      const widths: Record<string, number> = {};
      for (const [key, width] of Object.entries(columns)) {
        if (typeof width === 'number' && Number.isFinite(width)) {
          widths[key] = clampWidth(width);
        }
      }
      result[table] = widths;
    }
    return result;
  } catch {
    // 无痕窗口、禁用站点数据等读不到时按默认宽度显示
    return {};
  }
}

const saved = reactive<WidthMap>(loadWidths());

function persist() {
  try {
    localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // 写不进去就只在当前页面有效
  }
}

function clampWidth(width: number) {
  return Math.round(
    Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)),
  );
}

function isResizable(column: TableColumnType): boolean {
  return (
    typeof column.width === 'number' &&
    column.key !== undefined &&
    column.key !== 'actions'
  );
}

/**
 * `tableId` 在全站唯一；同一个组件按类型显示不同列时传函数，按类型分开记。
 */
export function useResizableColumns<T extends TableColumnType>(
  tableId: string | (() => string),
  source: () => T[],
) {
  const idOf = () => (typeof tableId === 'function' ? tableId() : tableId);
  const columns = computed<T[]>(() =>
    source().map((column) => {
      if (!isResizable(column)) return column;
      const stored = saved[idOf()]?.[String(column.key)];
      return {
        ...column,
        width: stored ?? column.width,
        resizable: true,
        minWidth: Math.min(MIN_COLUMN_WIDTH, column.width as number),
        maxWidth: MAX_COLUMN_WIDTH,
      };
    }),
  );

  function onResizeColumn(width: number, column: { key?: unknown }) {
    if (column.key === undefined || column.key === null) return;
    const id = idOf();
    const widths = saved[id] ?? (saved[id] = {});
    widths[String(column.key)] = clampWidth(width);
    persist();
  }

  return { columns, onResizeColumn };
}

/** 全部表格恢复默认列宽 */
export function resetColumnWidths() {
  for (const table of Object.keys(saved)) delete saved[table];
  try {
    localStorage.removeItem(COLUMN_WIDTHS_STORAGE_KEY);
  } catch {
    // 读写受限时内存里已经清掉了
  }
}

export function hasCustomColumnWidths() {
  return Object.values(saved).some(
    (widths) => Object.keys(widths).length > 0,
  );
}
