import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { theme } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';

import { appTheme, compactAppAlgorithm } from './theme';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..');
const read = (...parts: string[]) => readFileSync(join(src, ...parts), 'utf8');

const tokens = read('styles', 'tokens.css');
const globalCss = read('styles', 'global.css');
const appVue = read('App.vue');

/** tokens.css 里声明的自定义属性 → 原始值 */
const declared = Object.fromEntries(
  [...tokens.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [
    name,
    value!.replace(/\s+/g, ' ').trim(),
  ]),
);

/** antd 默认主题（defaultAlgorithm + defaultSeed）算出的 Map Token */
const antd = theme.defaultAlgorithm(theme.defaultSeed) as unknown as Record<
  string,
  string | number
>;

/** 应用实际使用的紧凑主题算出的 Map Token */
const app = compactAppAlgorithm(theme.defaultSeed) as unknown as Record<
  string,
  string | number
>;

/** 把 #rrggbb / rgb() / rgba() 统一成 [r, g, b, a] 便于比较 */
function rgba(color: string): number[] {
  const value = color.trim().toLowerCase();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).concat(1);
  }
  const parts = value
    .replace(/^rgba?\(/, '')
    .replace(/\)$/, '')
    .split(/[\s,/]+/)
    .filter(Boolean);
  const alpha = parts[3]
    ? parts[3].endsWith('%')
      ? Number(parts[3].slice(0, -1)) / 100
      : Number(parts[3])
    : 1;
  return [Number(parts[0]), Number(parts[1]), Number(parts[2]), alpha];
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return ['.vue', '.css'].includes(extname(path)) ? [path] : [];
  });
}

describe('tokens.css', () => {
  it('defines tokens for light mode only', () => {
    expect(tokens).toContain('color-scheme: light;');
    expect(tokens).not.toMatch(/prefers-color-scheme|data-theme|dark/i);
  });

  it('uses the ant-design-vue default palette for every color token', () => {
    const colors: Array<[string, string]> = [
      ['--color-primary', 'colorPrimary'],
      ['--color-primary-hover', 'colorPrimaryHover'],
      ['--color-primary-bg', 'colorPrimaryBg'],
      ['--color-primary-bg-hover', 'colorPrimaryBgHover'],
      ['--color-primary-border', 'colorPrimaryBorder'],
      ['--color-success', 'colorSuccess'],
      ['--color-success-bg', 'colorSuccessBg'],
      ['--color-warning', 'colorWarning'],
      ['--color-warning-bg', 'colorWarningBg'],
      ['--color-error', 'colorError'],
      ['--color-error-bg', 'colorErrorBg'],
      ['--color-error-bg-hover', 'colorErrorBgHover'],
      ['--color-info', 'colorInfo'],
      ['--color-info-bg', 'colorInfoBg'],
      ['--color-text', 'colorText'],
      ['--color-text-secondary', 'colorTextSecondary'],
      ['--color-text-tertiary', 'colorTextTertiary'],
      ['--color-text-quaternary', 'colorTextQuaternary'],
      ['--color-border', 'colorBorder'],
      ['--color-border-secondary', 'colorBorderSecondary'],
      ['--color-fill', 'colorFill'],
      ['--color-fill-secondary', 'colorFillSecondary'],
      ['--color-fill-tertiary', 'colorFillTertiary'],
      ['--color-fill-quaternary', 'colorFillQuaternary'],
      ['--color-bg-layout', 'colorBgLayout'],
      ['--color-bg-container', 'colorBgContainer'],
      ['--color-bg-elevated', 'colorBgElevated'],
      ['--color-bg-mask', 'colorBgMask'],
    ];
    for (const [cssVar, antdToken] of colors) {
      expect(declared[cssVar], cssVar).toBeDefined();
      expect(rgba(declared[cssVar]!), cssVar).toEqual(
        rgba(String(antd[antdToken])),
      );
    }
  });

  it('uses the ant-design-vue default font, radius, control and motion scales', () => {
    const normalizeFont = (value: string) =>
      value.toLowerCase().replace(/['"\s]/g, '');
    expect(normalizeFont(declared['--font-family']!)).toBe(
      normalizeFont(String(antd.fontFamily)),
    );
    expect(declared['--font-body']).toContain(`${antd.fontSize}px/22px`);

    expect(
      ['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg'].map(
        (name) => declared[name],
      ),
    ).toEqual(
      [
        'borderRadiusXS',
        'borderRadiusSM',
        'borderRadius',
        'borderRadiusLG',
      ].map((name) => `${antd[name]}px`),
    );
    expect(
      ['--control-height-sm', '--control-height', '--control-height-lg'].map(
        (name) => declared[name],
      ),
    ).toEqual(
      ['controlHeightSM', 'controlHeight', 'controlHeightLG'].map(
        (name) => `${app[name]}px`,
      ),
    );
    const ms = (value: string) =>
      value.endsWith('ms')
        ? Number(value.slice(0, -2))
        : Number(value.slice(0, -1)) * 1000;
    expect(
      [
        '--motion-duration-fast',
        '--motion-duration-mid',
        '--motion-duration-slow',
      ].map((name) => ms(declared[name]!)),
    ).toEqual(
      ['motionDurationFast', 'motionDurationMid', 'motionDurationSlow'].map(
        (name) => ms(String(antd[name])),
      ),
    );
    expect(declared['--motion-ease-out']).toBe(
      String(antd.motionEaseOut).replace(/,\s*/g, ', '),
    );
    expect(declared['--motion-ease-in-out']).toBe(
      String(antd.motionEaseInOut).replace(/,\s*/g, ', '),
    );
  });
});

describe('ant-design-vue styling', () => {
  it('renders the app and static APIs with the compact theme', () => {
    expect(appVue).toContain('<a-config-provider');
    expect(appVue).toMatch(/:theme="appTheme"/);
    expect(read('main.ts')).toMatch(/theme: appTheme/);
    expect(appTheme.algorithm).toBe(compactAppAlgorithm);
  });

  it('tightens sizes like compactAlgorithm but keeps default typography', () => {
    const compact = theme.compactAlgorithm(
      theme.defaultSeed,
      theme.defaultAlgorithm(theme.defaultSeed),
    ) as unknown as Record<string, string | number>;
    expect(app.controlHeight).toBe(compact.controlHeight);
    expect(app.size).toBe(compact.size);
    expect(app.sizeLG).toBe(compact.sizeLG);
    for (const key of Object.keys(antd).filter((k) =>
      /^(fontSize|lineHeight)/.test(k),
    )) {
      expect(app[key], key).toBe(antd[key]);
    }
    // test:ui 要求可点控件不低于 24px
    expect(app.controlHeightSM).toBeGreaterThanOrEqual(24);
  });

  it('does not load extra web fonts on top of the antd font stack', () => {
    expect(globalCss).not.toContain('@fontsource');
  });

  it('keeps no Apple-style materials, hairlines or tracking in any stylesheet', () => {
    for (const file of sourceFiles(src)) {
      const text = readFileSync(file, 'utf8');
      const name = file.slice(src.length);
      expect(text, name).not.toMatch(/backdrop-filter/);
      expect(text, name).not.toMatch(/\b0\.5px\b/);
      expect(text, name).not.toMatch(/letter-spacing:\s*-/);
      expect(text, name).not.toMatch(/--(?:material|sys|tracking|label)-/);
      expect(text, name).not.toMatch(/SF Pro/);
    }
  });

  it('only keeps components in ui/ that ant-design-vue does not provide', () => {
    const components = readdirSync(join(src, 'ui')).filter((name) =>
      name.endsWith('.vue'),
    );
    expect(components.sort()).toEqual(['AHighlightText.vue', 'APdfViewer.vue']);
  });
});
