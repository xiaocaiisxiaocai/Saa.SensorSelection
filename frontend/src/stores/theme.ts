import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import {
  applyResolvedTheme,
  persistTheme,
  readStoredTheme,
  resolveTheme,
  type ThemePreference,
} from '@/theme/theme';

function readSystemDark() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>(readStoredTheme());
  const systemDark = ref(readSystemDark());

  const resolved = computed(() =>
    resolveTheme(preference.value, systemDark.value),
  );

  function setPreference(next: ThemePreference) {
    preference.value = next;
    persistTheme(next);
  }

  watch(
    resolved,
    (value) => {
      applyResolvedTheme(value);
    },
    { immediate: true },
  );

  // 保存 listener 引用，以便未来 SSR / 测试环境可随时移除
  if (typeof window !== 'undefined') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onColorSchemeChange = (event: MediaQueryListEvent) => {
      systemDark.value = event.matches;
    };
    mq.addEventListener('change', onColorSchemeChange);
  }

  return {
    preference,
    resolved,
    setPreference,
  };
});
