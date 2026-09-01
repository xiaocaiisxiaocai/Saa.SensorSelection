import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const tokens = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'),
  'utf8',
);
const controls = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'control.css'),
  'utf8',
);
const reset = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'reset.css'),
  'utf8',
);
const menu = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'menu.css'),
  'utf8',
);
const select = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'ASelect.vue'),
  'utf8',
);
const tokenField = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'ATokenField.vue'),
  'utf8',
);
const treeSelect = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'ATreeSelect.vue'),
  'utf8',
);
const datePicker = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'ADatePicker.vue'),
  'utf8',
);
const appShell = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'shell', 'AppShell.vue'),
  'utf8',
);
const selectionPage = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'pages',
    'shared',
    'selection-page.css',
  ),
  'utf8',
);
const tabBar = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'ATabBar.vue'),
  'utf8',
);
const machinePage = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'pages',
    'selection',
    'MachinePage.vue',
  ),
  'utf8',
);
const button = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'AButton.vue'),
  'utf8',
);
const formGrid = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'AFormGrid.vue'),
  'utf8',
);
const sheet = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'ASheet.vue'),
  'utf8',
);
const sourceList = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'ASourceList.vue'),
  'utf8',
);
const table = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'ATable.vue'),
  'utf8',
);

const requiredTokens = [
  '--sys-blue',
  '--sys-green',
  '--sys-red',
  '--sys-orange',
  '--sys-yellow',
  '--sys-teal',
  '--sys-indigo',
  '--sys-purple',
  '--sys-pink',
  '--sys-gray',
  '--label',
  '--label-2',
  '--label-3',
  '--label-placeholder',
  '--label-4',
  '--separator',
  '--separator-opaque',
  '--fill-1',
  '--bg-window',
  '--bg-content',
  '--material-sidebar-bg',
  '--material-toolbar-bg',
  '--material-blur',
  '--font-ui',
  '--text-display',
  '--text-control',
  '--text-field',
  '--text-toolbar',
  '--text-toolbar-em',
  '--text-caption',
  '--sidebar-width',
  '--toolbar-height',
  '--radius-md',
  '--shadow-1',
  '--dur-2',
  '--ease-sheet',
  '--control-height-md',
  '--label-on-color',
  '--touch-target',
  '--dur-spin',
  '--z-popover',
  '--z-overlay',
  '--z-toast',
  '--overlay',
  '--overlay-blur',
  '--switch-track-md-width',
  '--switch-inset',
  '--stepper-nudge-height',
];

describe('tokens.css', () => {
  it('defines the design-system tokens for light and dark', () => {
    for (const token of requiredTokens) {
      expect(tokens).toContain(`${token}:`);
    }

    expect(tokens).toContain(":root[data-theme='dark']");
    expect(tokens).toContain("'Inter'");
    expect(tokens).toContain("'Noto Sans SC'");
  });

  it('keeps both expanded and collapsed navigation compact', () => {
    expect(tokens).toMatch(/--sidebar-width:\s*152px/);
    expect(tokens).toMatch(/--sidebar-collapsed-width:\s*56px/);
  });

  it('defines one compact desktop density scale while preserving coarse-pointer targets', () => {
    expect(tokens).toMatch(/--toolbar-height:\s*52px/);
    expect(tokens).toMatch(/--row-height:\s*36px/);
    expect(tokens).toMatch(/--row-height-loose:\s*44px/);
    expect(tokens).toMatch(/--control-height-sm:\s*26px/);
    expect(tokens).toMatch(/--control-height-md:\s*30px/);
    expect(tokens).toMatch(/--control-height-lg:\s*34px/);
    expect(tokens).toMatch(/--control-height-xl:\s*42px/);
    expect(tokens).toMatch(/--control-pad-md:\s*10px/);
    expect(tokens).toMatch(/--control-pad-lg:\s*12px/);
    expect(tokens).toMatch(
      /@media \(pointer:\s*coarse\)\s*\{[\s\S]*--control-height-lg:\s*44px/,
    );
    expect(button).toMatch(
      /\.a-button--large\s*\{[^}]*height:\s*var\(--control-height-lg\);/s,
    );
  });

  it('applies compact spacing through shared shells, forms, tables, sheets and source lists', () => {
    expect(appShell).toMatch(
      /\.content\s*\{[^}]*padding:\s*var\(--space-5\);/s,
    );
    expect(selectionPage).toMatch(
      /\.selection-page\s*\{[^}]*gap:\s*var\(--space-4\);/s,
    );
    expect(selectionPage).toMatch(
      /\.selection-panel\s*\{[^}]*gap:\s*var\(--space-3\);/s,
    );
    expect(formGrid).toMatch(
      /\.a-form-grid\s*\{[^}]*gap:\s*var\(--space-4\);/s,
    );
    expect(table).toMatch(
      /th,\s*td\s*\{[^}]*padding:\s*var\(--space-1\) var\(--space-3\);/s,
    );
    expect(sheet).toMatch(
      /\.a-sheet__body\s*\{[^}]*padding:\s*var\(--space-5\);/s,
    );
    expect(sourceList).toMatch(
      /\.a-source-list__search,\s*\.a-source-list__toolbar\s*\{[^}]*padding:\s*var\(--space-3\);/s,
    );
  });

  it('keeps light-theme semantic colors readable on white surfaces', () => {
    const light = tokens.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const getHex = (name: string) =>
      light.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1] ?? '';
    const luminance = (hex: string) => {
      const channels = hex
        .slice(1)
        .match(/.{2}/g)!
        .map((part) => Number.parseInt(part, 16) / 255)
        .map((value) =>
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        );
      return (
        0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
      );
    };
    const contrastOnWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

    for (const name of [
      '--sys-blue',
      '--sys-green',
      '--sys-red',
      '--sys-orange',
    ]) {
      expect(contrastOnWhite(getHex(name)), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses the compact caption scale consistently for small controls', () => {
    expect(controls).toMatch(
      /\.a-control--small\s*\{[^}]*font:\s*var\(--text-caption\);/s,
    );
    expect(controls).toMatch(
      /\.a-control--small \.a-control__input\s*\{[^}]*font:\s*inherit;/s,
    );
  });

  it('keeps body copy unchanged while compacting fields and dropdown options', () => {
    expect(tokens).toMatch(/--text-control:\s*400 15px\/22px/);
    expect(tokens).toMatch(/--text-field:\s*400 13px\/18px/);
    expect(reset).toMatch(/html\s*\{[^}]*font:\s*var\(--text-control\);/s);
    expect(controls).toMatch(
      /\.a-control\s*\{[^}]*font:\s*var\(--text-field\);/s,
    );
    expect(controls).toMatch(
      /\.a-control__input\s*\{[^}]*font:\s*var\(--text-field\);/s,
    );
    expect(menu).toMatch(
      /\.a-menu-item\s*\{[^}]*font:\s*var\(--text-field\);/s,
    );
    expect(select).toMatch(
      /\.a-select__filter\s*\{[^}]*font:\s*var\(--text-field\);/s,
    );
    expect(tokenField).toMatch(
      /\.a-select__filter\s*\{[^}]*font:\s*var\(--text-field\);/s,
    );
    expect(treeSelect).toMatch(
      /\.a-tree-select__option\s*\{[^}]*font:\s*var\(--text-field\);/s,
    );
    expect(appShell).toMatch(
      /\.search input\s*\{[^}]*font:\s*var\(--text-field\);/s,
    );
  });

  it('gives dense filter toolbars a compact hierarchy without shrinking table copy', () => {
    expect(tokens).toMatch(/--text-toolbar:\s*400 12px\/18px/);
    expect(tokens).toMatch(/--text-toolbar-em:\s*600 12px\/18px/);
    expect(selectionPage).toMatch(
      /\.selection-toolbar \.a-control,[\s\S]*?\.selection-toolbar \.a-token-field__chip\s*\{[^}]*font:\s*var\(--text-toolbar\);/,
    );
    expect(selectionPage).toMatch(
      /\.selection-toolbar\s+\.a-button\s*\{[^}]*font:\s*var\(--text-toolbar-em\);/s,
    );
    expect(selectionPage).toMatch(
      /\.machine-images h3\s*\{[^}]*font:\s*var\(--text-control-em\);/s,
    );
    expect(tabBar).toMatch(
      /\.a-tab-bar__tab\s*\{[^}]*font:\s*var\(--text-caption\);/s,
    );
    expect(tabBar).toMatch(
      /\.a-tab-bar__tab--selected\s*\{[^}]*font-weight:\s*600;/s,
    );
    expect(machinePage).toMatch(
      /\.machine-catalog-tabs\s+:deep\(\.a-tab-bar__tab--selected\)\s*\{[^}]*font-weight:\s*600;/s,
    );
    expect(tokens).toMatch(/--text-control:\s*400 15px\/22px/);
  });

  it('uses a dedicated readable color for field placeholders in both themes', () => {
    expect(tokens).toMatch(
      /:root\s*\{[\s\S]*--label-placeholder:\s*#[0-9a-f]{6};/i,
    );
    expect(tokens).toMatch(
      /:root\[data-theme='dark'\]\s*\{[\s\S]*--label-placeholder:\s*#[0-9a-f]{6};/i,
    );
    expect(controls).toMatch(
      /\.a-control__input::placeholder\s*\{[^}]*color:\s*var\(--label-placeholder\);/s,
    );
    expect(select).toMatch(
      /\.a-select__value\[data-placeholder\]\s*\{[^}]*color:\s*var\(--label-placeholder\);/s,
    );
    expect(tokenField).toMatch(
      /\.a-token-field__placeholder\s*\{[^}]*color:\s*var\(--label-placeholder\);/s,
    );
    expect(treeSelect).toMatch(
      /\.a-tree-select__value\[data-placeholder\]\s*\{[^}]*color:\s*var\(--label-placeholder\);/s,
    );
    expect(datePicker).toMatch(
      /\.a-date-picker__value\[data-placeholder\]\s*\{[^}]*color:\s*var\(--label-placeholder\);/s,
    );
    expect(appShell).toMatch(
      /\.search input::placeholder\s*\{[^}]*color:\s*var\(--label-placeholder\);/s,
    );

    const light = tokens.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const dark =
      tokens.match(/:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const getHex = (block: string, name: string) =>
      block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1] ?? '';
    const luminance = (hex: string) => {
      const channels = hex
        .slice(1)
        .match(/.{2}/g)!
        .map((part) => Number.parseInt(part, 16) / 255)
        .map((value) =>
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        );
      return (
        0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
      );
    };
    const contrast = (foreground: string, background: string) => {
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      return (
        (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
      );
    };

    expect(
      contrast(getHex(light, '--label-placeholder'), '#ebebed'),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(getHex(dark, '--label-placeholder'), '#2c2c2e'),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
