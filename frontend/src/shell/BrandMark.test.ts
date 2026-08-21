import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BrandMark from './BrandMark.vue';

describe('BrandMark', () => {
  it('renders a compact SAA mark for the toolbar', () => {
    const wrapper = mount(BrandMark);

    expect(wrapper.text()).toBe('SAA');
    expect(wrapper.classes()).toContain('brand-mark--toolbar');
    expect(wrapper.attributes('aria-hidden')).toBe('true');
  });

  it('scales up for the login card', () => {
    const wrapper = mount(BrandMark, { props: { size: 'login' } });

    expect(wrapper.classes()).toContain('brand-mark--login');
  });
});
