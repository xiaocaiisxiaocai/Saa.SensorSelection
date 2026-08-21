import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BrandMark from './BrandMark.vue';

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
});
