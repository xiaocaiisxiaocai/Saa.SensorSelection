import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const tokens = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'),
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
          value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4,
        );
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    };
    const contrastOnWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

    for (const name of ['--sys-blue', '--sys-green', '--sys-red', '--sys-orange']) {
      expect(contrastOnWhite(getHex(name)), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});
