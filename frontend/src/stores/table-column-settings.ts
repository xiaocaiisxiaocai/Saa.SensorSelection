import { defineStore } from 'pinia';
import { ref } from 'vue';

import { ApiError, api } from '@/api';

export const TABLE_COLUMN_SETTINGS_KEY = 'table-columns:global';

interface TableColumnSetting {
  hidden: string[];
  tableId: string;
}

function normalizeSettings(source: unknown): TableColumnSetting[] {
  if (!Array.isArray(source)) return [];
  const settings = new Map<string, TableColumnSetting>();
  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.tableId !== 'string' || !record.tableId.trim()) continue;
    const hidden = Array.isArray(record.hidden)
      ? [...new Set(record.hidden.filter((key): key is string => typeof key === 'string'))]
      : [];
    settings.set(record.tableId, { tableId: record.tableId, hidden });
  }
  return [...settings.values()];
}

function cloneSettings(source: readonly TableColumnSetting[]): TableColumnSetting[] {
  return source.map((item) => ({ tableId: item.tableId, hidden: [...item.hidden] }));
}

export const useTableColumnSettingsStore = defineStore(
  'table-column-settings',
  () => {
    const settings = ref<TableColumnSetting[]>([]);
    const loaded = ref(false);
    let loadPromise: Promise<void> | null = null;
    let saveQueue: Promise<void> = Promise.resolve();

    function ensureLoaded(): Promise<void> {
      if (loaded.value) return Promise.resolve();
      if (loadPromise) return loadPromise;
      loadPromise = (async () => {
        try {
          settings.value = normalizeSettings(
            await api.getKey(TABLE_COLUMN_SETTINGS_KEY),
          );
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) {
            settings.value = [];
            return;
          }
          settings.value = [];
        }
        loaded.value = true;
      })().finally(() => {
        loadPromise = null;
      });
      return loadPromise;
    }

    function hiddenColumns(tableId: string): Set<string> {
      return new Set(settings.value.find((item) => item.tableId === tableId)?.hidden ?? []);
    }

    function setVisible(
      tableId: string,
      columnKey: string,
      visible: boolean,
    ): Promise<void> {
      const previous = cloneSettings(settings.value);
      const next = normalizeSettings(previous);
      const current = next.find((item) => item.tableId === tableId);
      const hidden = new Set(current?.hidden ?? []);
      if (visible) hidden.delete(columnKey);
      else hidden.add(columnKey);
      const updated = next.filter((item) => item.tableId !== tableId);
      updated.push({ tableId, hidden: [...hidden] });
      settings.value = updated;
      const snapshot = cloneSettings(updated);
      saveQueue = saveQueue
        .catch(() => undefined)
        .then(async () => {
          try {
            await api.putKey(TABLE_COLUMN_SETTINGS_KEY, snapshot);
          } catch (error) {
            if (JSON.stringify(settings.value) === JSON.stringify(snapshot)) {
              settings.value = previous;
            }
            throw error;
          }
        });
      return saveQueue;
    }

    function showAll(tableId: string): Promise<void> {
      const previous = cloneSettings(settings.value);
      settings.value = settings.value.filter((item) => item.tableId !== tableId);
      const snapshot = cloneSettings(settings.value);
      saveQueue = saveQueue
        .catch(() => undefined)
        .then(async () => {
          try {
            await api.putKey(TABLE_COLUMN_SETTINGS_KEY, snapshot);
          } catch (error) {
            if (JSON.stringify(settings.value) === JSON.stringify(snapshot)) {
              settings.value = previous;
            }
            throw error;
          }
        });
      return saveQueue;
    }

    return { ensureLoaded, hiddenColumns, loaded, setVisible, settings, showAll };
  },
);
