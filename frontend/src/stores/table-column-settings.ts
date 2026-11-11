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
      ? [
          ...new Set(
            record.hidden.filter(
              (key): key is string => typeof key === 'string',
            ),
          ),
        ]
      : [];
    settings.set(record.tableId, { tableId: record.tableId, hidden });
  }
  return [...settings.values()];
}

function cloneSettings(
  source: readonly TableColumnSetting[],
): TableColumnSetting[] {
  return source.map((item) => ({
    tableId: item.tableId,
    hidden: [...item.hidden],
  }));
}

export const useTableColumnSettingsStore = defineStore(
  'table-column-settings',
  () => {
    const settings = ref<TableColumnSetting[]>([]);
    const loaded = ref(false);
    let loadPromise: Promise<void> | null = null;
    let saveQueue: Promise<void> = Promise.resolve();
    let confirmedSettings: TableColumnSetting[] = [];
    let confirmedRemote: unknown[] | null = null;
    let saveGeneration = 0;

    function ensureLoaded(): Promise<void> {
      if (loaded.value) return Promise.resolve();
      if (loadPromise) return loadPromise;
      loadPromise = (async () => {
        try {
          const remote = await api.getKey(TABLE_COLUMN_SETTINGS_KEY);
          settings.value = normalizeSettings(remote);
          confirmedRemote = remote;
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) {
            settings.value = [];
            return;
          }
          settings.value = [];
          confirmedRemote = null;
        }
        confirmedSettings = cloneSettings(settings.value);
        loaded.value = true;
      })().finally(() => {
        loadPromise = null;
      });
      return loadPromise;
    }

    function hiddenColumns(tableId: string): Set<string> {
      return new Set(
        settings.value.find((item) => item.tableId === tableId)?.hidden ?? [],
      );
    }

    async function refreshConfirmedSettings() {
      try {
        const remote = await api.getKey(TABLE_COLUMN_SETTINGS_KEY);
        confirmedRemote = remote;
        confirmedSettings = normalizeSettings(remote);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) return false;
        confirmedRemote = null;
        confirmedSettings = [];
      }
      settings.value = cloneSettings(confirmedSettings);
      return true;
    }

    function saveSnapshot(snapshot: TableColumnSetting[]): Promise<void> {
      const generation = saveGeneration;
      saveQueue = saveQueue
        .catch(() => undefined)
        .then(async () => {
          if (generation !== saveGeneration) {
            throw new ApiError(
              'error',
              '列设置已被其他用户修改，请基于最新设置重试',
              409,
            );
          }
          try {
            const stored = await api.putKey(
              TABLE_COLUMN_SETTINGS_KEY,
              snapshot,
              undefined,
              confirmedRemote,
            );
            confirmedRemote = stored;
            confirmedSettings = normalizeSettings(stored);
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              // 当前任务和已经排在它后面的乐观快照都基于过期版本。先让旧队列
              // 全部失效，再读取一次最新值；刷新期间产生的操作也在结束时失效，
              // 避免拿新 expected 重放旧 snapshot 覆盖别人的修改。
              saveGeneration += 1;
              const refreshed = await refreshConfirmedSettings();
              if (!refreshed) {
                settings.value = cloneSettings(confirmedSettings);
              }
              saveGeneration += 1;
            } else if (
              JSON.stringify(settings.value) === JSON.stringify(snapshot)
            ) {
              settings.value = cloneSettings(confirmedSettings);
            }
            throw error;
          }
        });
      return saveQueue;
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
      return saveSnapshot(snapshot);
    }

    function showAll(tableId: string): Promise<void> {
      settings.value = settings.value.filter(
        (item) => item.tableId !== tableId,
      );
      const snapshot = cloneSettings(settings.value);
      return saveSnapshot(snapshot);
    }

    return {
      ensureLoaded,
      hiddenColumns,
      loaded,
      setVisible,
      settings,
      showAll,
    };
  },
);
