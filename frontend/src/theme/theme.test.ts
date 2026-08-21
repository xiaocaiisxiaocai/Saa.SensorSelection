import { describe, expect, it } from 'vitest';

import {
  applyResolvedTheme,
  isThemePreference,
  readStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
} from './theme';

describe('theme', () => {
  it('accepts only light, dark, and system', () => {
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
  });

  it('follows the system preference when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('reads a stored preference and falls back to system', () => {
    const storage = {
      getItem: (key: string) =>
        key === THEME_STORAGE_KEY ? 'dark' : null,
    };

    expect(readStoredTheme(storage)).toBe('dark');
    expect(readStoredTheme({ getItem: () => 'nope' })).toBe('system');
  });

  it('toggles the document theme attribute', () => {
    const root = document.createElement('html');

    applyResolvedTheme('dark', root);
    expect(root.getAttribute('data-theme')).toBe('dark');

    applyResolvedTheme('light', root);
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});
