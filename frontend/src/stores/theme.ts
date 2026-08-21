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

  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (event) => {
      systemDark.value = event.matches;
    });

  return {
    preference,
    resolved,
    setPreference,
  };
});
