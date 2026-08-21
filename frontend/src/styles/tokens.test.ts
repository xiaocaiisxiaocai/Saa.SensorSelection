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
});
