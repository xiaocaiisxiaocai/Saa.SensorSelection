import type { TableColumnType } from 'ant-design-vue';
import { computed } from 'vue';

import { useAuthStore } from '@/stores/auth';
import { useTableColumnSettingsStore } from '@/stores/table-column-settings';

import { useResizableColumns } from './column-widths';

export interface ManagedColumnOption {
  key: string;
  label: string;
}

export function managedColumnKey(column: TableColumnType): string | null {
  const value = column.key ?? column.dataIndex;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const key = String(value);
  if (!key || key === 'actions' || key === 'selection') return null;
  return key;
}

export function useManagedTableColumns<T extends TableColumnType>(
  tableId: string | (() => string),
  source: () => T[],
) {
  const idOf = () => (typeof tableId === 'function' ? tableId() : tableId);
  const settings = useTableColumnSettingsStore();
  const auth = useAuthStore();
  void settings.ensureLoaded();

  const options = computed<ManagedColumnOption[]>(() => {
    const seen = new Set<string>();
    return source().flatMap((column) => {
      const key = managedColumnKey(column);
      if (!key || seen.has(key)) return [];
      seen.add(key);
      return [{ key, label: typeof column.title === 'string' ? column.title : key }];
    });
  });
  const hidden = computed(() => settings.hiddenColumns(idOf()));
  const visibleColumns = computed(() =>
    source().filter((column) => {
      const key = managedColumnKey(column);
      return key === null || !hidden.value.has(key);
    }),
  );
  const canManage = computed(
    () =>
      settings.loaded &&
      auth.isAuthenticated &&
      auth.roleCodes.includes('admin'),
  );
  const resizable = useResizableColumns(tableId, () => visibleColumns.value);

  async function setVisible(key: string, visible: boolean) {
    if (!canManage.value) return;
    await settings.setVisible(idOf(), key, visible);
  }

  async function showAll() {
    if (!canManage.value) return;
    await settings.showAll(idOf());
  }

  return {
    canManage,
    columns: resizable.columns,
    hidden,
    onResizeColumn: resizable.onResizeColumn,
    options,
    setVisible,
    showAll,
  };
}
