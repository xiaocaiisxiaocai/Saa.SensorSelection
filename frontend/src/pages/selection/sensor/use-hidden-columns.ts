import { computed, ref } from 'vue';

/**
 * 表格列的显示/隐藏，选择记在本机（localStorage，按 storageKey 区分表格）。
 * 只认 allowed 里的列，存储里的未知列名和坏数据一律忽略。
 */
export function useHiddenColumns(
  storageKey: string,
  allowed: readonly { key: string }[],
) {
  const allowedKeys = new Set(allowed.map((column) => column.key));
  const hidden = ref<Set<string>>(restore());

  function restore(): Set<string> {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return new Set();
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(
        parsed.filter(
          (key): key is string =>
            typeof key === 'string' && allowedKeys.has(key),
        ),
      );
    } catch {
      return new Set();
    }
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...hidden.value]));
    } catch {
      // 本地存储不可用时，本次会话内的选择仍然有效，静默忽略即可。
    }
  }

  function setVisible(key: string, visible: boolean) {
    const next = new Set(hidden.value);
    if (visible) next.delete(key);
    else next.add(key);
    hidden.value = next;
    persist();
  }

  return {
    hidden,
    hiddenCount: computed(() => hidden.value.size),
    setVisible,
  };
}
