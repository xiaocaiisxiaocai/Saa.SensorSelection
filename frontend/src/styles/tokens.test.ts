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
const alertHost = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'AAlertHost.vue'),
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
const machineSourceList = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'pages',
    'selection',
    'machine',
    'MachineSourceList.vue',
  ),
  'utf8',
);

const requiredTokens = [
  '--sys-blue',
  '--sys-blue-solid',
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
  '--control-stroke',
  '--scrollbar-thumb',
  '--scrollbar-thumb-hover',
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
  '--text-field-em',
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
  it('defines the design-system tokens for light mode only', () => {
    for (const token of requiredTokens) {
      expect(tokens).toContain(`${token}:`);
    }

    expect(tokens).toMatch(/color-scheme:\s*light/);
    expect(tokens).not.toContain("data-theme='dark'");
    expect(tokens).not.toMatch(/color-scheme:\s*dark/);
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
    expect(button).toContain('<AntButton');
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
      /\.a-form-grid\s*\{[^}]*gap:\s*var\(--space-2\) var\(--space-4\);/s,
    );
    expect(table).toContain('<AntTable');
    expect(sheet).toContain('<a-modal');
    expect(sourceList).toMatch(
      /\.a-source-list__search,\s*\.a-source-list__toolbar\s*\{[^}]*padding:\s*0 var\(--space-4\) var\(--space-3\) 0;/s,
    );
  });

  it('keeps the machine directory beside its content on medium desktop widths', () => {
    expect(machinePage).toContain(
      "'selection-split--machine': activeMachineView === 'browse'",
    );
    expect(machinePage).toMatch(
      /@media \(48rem < width <= 60rem\)[\s\S]*\.selection-split--machine\s*\{[\s\S]*grid-template-columns:[\s\S]*clamp\(200px, var\(--machine-source-width, 220px\), 220px\)[\s\S]*minmax\(0, 1fr\);/,
    );
  });

  it('frames shared data tables with Ant Design instead of a hand-drawn cell grid', () => {
    expect(table).toContain('<AntTable');
    expect(table).not.toMatch(/td\s*\{[^}]*border-right:/s);
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

  it('keeps secondary text readable on light content surfaces', () => {
    const light = tokens.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const match = light.match(
      /--label-2:\s*rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*(\d+)%\s*\)/,
    );
    expect(match).not.toBeNull();

    const alpha = Number(match?.[4] ?? 0) / 100;
    const channels = [1, 2, 3].map((index) => {
      const foreground = Number(match?.[index] ?? 0);
      return (foreground * alpha + 255 * (1 - alpha)) / 255;
    });
    const luminance = channels
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      )
      .reduce(
        (sum, value, index) => sum + [0.2126, 0.7152, 0.0722][index]! * value,
        0,
      );

    expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps accent text and filled controls readable', () => {
    expect(tokens).toMatch(/:root\s*\{[\s\S]*--sys-blue-solid:\s*#0066cc;/i);
    expect(button).toContain("return 'primary'");
    expect(appShell).toMatch(
      /\.search kbd\s*\{[^}]*color:\s*var\(--label-placeholder\);/s,
    );
    expect(machineSourceList).toMatch(
      /\.machine-tree-row__count\s*\{[^}]*color:\s*var\(--label-placeholder\);/s,
    );
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
    expect(tokens).toMatch(/--text-body:\s*400 15px\/22px/);
    expect(tokens).toMatch(/--text-headline:\s*600 15px\/22px/);
    expect(tokens).not.toMatch(
      /--text-(?:display|title-1|title-2|headline|body):[^;]*clamp\(/,
    );
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
    expect(select).toContain('<AntSelect');
    expect(tokenField).toContain('mode="multiple"');
    expect(treeSelect).toContain('<AntTreeSelect');
    expect(appShell).toMatch(
      /\.search input\s*\{[^}]*font:\s*var\(--text-field\);/s,
    );
  });

  it('gives dense filter toolbars a compact hierarchy without shrinking table copy', () => {
    expect(tokens).toMatch(/--text-toolbar:\s*400 12px\/18px/);
    expect(tokens).toMatch(/--text-toolbar-em:\s*600 12px\/18px/);
    expect(selectionPage).not.toMatch(
      /\.selection-toolbar\s+\.a-button\s*\{[^}]*font:\s*var\(--text-toolbar-em\);/s,
    );
    expect(selectionPage).toMatch(
      /\.machine-images h3\s*\{[^}]*font:\s*var\(--text-control-em\);/s,
    );
    expect(tabBar).toMatch(
      /\.a-tab-bar__tab\s*\{[^}]*font:\s*var\(--text-field\);/s,
    );
    expect(tabBar).toMatch(
      /\.a-tab-bar__tab--selected\s*\{[^}]*font-weight:\s*600;/s,
    );
    expect(machinePage).toMatch(
      /\.machine-catalog-tabs\s+:deep\(\.a-tab-bar__tab--selected\)\s*\{[^}]*font-weight:\s*600;/s,
    );
    expect(tokens).toMatch(/--text-control:\s*400 15px\/22px/);
    expect(selectionPage).toMatch(
      /\.selection-toolbar \.a-select\.selection-toolbar__filter\s*\{[^}]*flex:\s*0 1 10rem;[^}]*min-width:\s*7\.5rem;/s,
    );
    expect(selectionPage).toMatch(
      /\.selection-toolbar \.a-search-field\.selection-toolbar__filter\s*\{[^}]*flex:\s*1 1 16rem;[^}]*min-width:\s*12rem;/s,
    );
  });

  it('uses a dedicated readable color for field placeholders', () => {
    expect(tokens).toMatch(
      /:root\s*\{[\s\S]*--label-placeholder:\s*#[0-9a-f]{6};/i,
    );
    expect(controls).toMatch(
      /\.a-control__input::placeholder\s*\{[^}]*color:\s*var\(--label-placeholder\);/s,
    );
    expect(select).toContain('placeholder');
    expect(tokenField).toContain('placeholder');
    expect(treeSelect).toContain('placeholder');
    expect(datePicker).toContain('<AntDatePicker');
    expect(datePicker).toContain('<a-range-picker');
    expect(appShell).toMatch(
      /\.search input::placeholder\s*\{[^}]*color:\s*var\(--label-placeholder\);/s,
    );

    const light = tokens.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
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
  });

  it('centers icon-only buttons even though reset.css makes svg block-level', () => {
    // antd 按钮靠 text-align 居中，块级 svg 会贴左（24px 圆钮里偏 4px）。
    expect(controls).toMatch(
      /\.ant-btn\.a-icon-button\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s,
    );
  });

  it('keeps hover row actions as separate buttons on the row background', () => {
    // 悬停操作组不能再套白色卡片 + 阴影：两个按钮会被看成一个控件，
    // 在蓝色选中行上还是一块白补丁。
    for (const [source, selector] of [
      [sourceList, String.raw`\.a-source-list__actions`],
      [machineSourceList, String.raw`\.machine-tree-row__tools`],
    ] as const) {
      const block =
        source.match(new RegExp(String.raw`${selector}\s*\{([^}]*)\}`))?.[1] ?? '';
      expect(block).toMatch(/gap:\s*var\(--space-2\);/);
      expect(block).toMatch(/background:\s*var\(--row-bg/);
      expect(block).not.toMatch(/var\(--shadow-1\)/);
    }
  });

  it('keeps the global confirm alert above any already-open sheet', () => {
    // AAlertHost 常驻挂载在应用根部，DOM 位置天然早于后打开的 ASheet；
    // 必须用独立、更高的 z-index，否则 ASheet 的 confirmClose 场景下
    // 确认框会被已打开的表单弹窗盖住（回归自一次真实的 UI 缺陷）。
    const zAlertMatch = tokens.match(/--z-alert:\s*(\d+)/);
    const zOverlayMatch = tokens.match(/--z-overlay:\s*(\d+)/);
    expect(zAlertMatch).not.toBeNull();
    expect(Number(zAlertMatch?.[1])).toBeGreaterThan(Number(zOverlayMatch?.[1]));
    expect(alertHost).toMatch(/z-index:\s*var\(--z-alert\)/);
  });
});
