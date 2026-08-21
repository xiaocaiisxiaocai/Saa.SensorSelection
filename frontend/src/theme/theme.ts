export const THEME_STORAGE_KEY = 'apple-frontend:theme';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'light',
  'dark',
  'system',
];

export function isThemePreference(value: string): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

export function readStoredTheme(
  storage: Pick<Storage, 'getItem'> | null = globalThis.localStorage,
): ThemePreference {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return stored && isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') {
    return prefersDark ? 'dark' : 'light';
  }

  return preference;
}

export function applyResolvedTheme(
  resolved: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  if (resolved === 'dark') {
    root.setAttribute('data-theme', 'dark');
    return;
  }

  root.removeAttribute('data-theme');
}

export function persistTheme(
  preference: ThemePreference,
  storage: Pick<Storage, 'setItem'> | null = globalThis.localStorage,
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* private browsing */
  }
}
