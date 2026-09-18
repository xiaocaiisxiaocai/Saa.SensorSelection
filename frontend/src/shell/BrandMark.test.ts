import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BrandMark from './BrandMark.vue';

const source = readFileSync(
  fileURLToPath(import.meta.url).replace(/\.test\.ts$/, '.vue'),
  'utf8',
);

describe('BrandMark', () => {
  it('renders the SAA mark for the toolbar', () => {
    const wrapper = mount(BrandMark);

    expect(wrapper.element.tagName).toBe('IMG');
    expect(wrapper.attributes('src') ?? '').toMatch(/logo-saa\.png|image\/png/);
    expect(wrapper.classes()).toContain('brand-mark--toolbar');
    expect(wrapper.attributes('aria-hidden')).toBe('true');
  });

  it('scales up for the login card', () => {
    const wrapper = mount(BrandMark, { props: { size: 'login' } });

    expect(wrapper.classes()).toContain('brand-mark--login');
  });

  it('reverses the dark-blue mark to white on the dark theme', () => {
    expect(source).toMatch(
      /:root\[data-theme='dark'\] \.brand-mark\s*\{[^}]*filter:\s*brightness\(0\) invert\(1\);/,
    );
  });
});
