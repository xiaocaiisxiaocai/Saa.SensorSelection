import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ASpinner from './ASpinner.vue';

describe('ASpinner', () => {
  it('renders a busy ant spin', () => {
    const wrapper = mount(ASpinner);

    expect(wrapper.classes()).toContain('a-spinner');
    expect(wrapper.classes()).toContain('ant-spin');
    expect(wrapper.classes()).toContain('ant-spin-spinning');
    expect(wrapper.attributes('aria-live')).toBe('polite');
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.find('.ant-spin-dot').exists()).toBe(true);
  });

  it('maps pixel sizes onto ant spin sizes', () => {
    expect(mount(ASpinner, { props: { size: 12 } }).classes()).toContain(
      'ant-spin-sm',
    );
    expect(mount(ASpinner, { props: { size: 32 } }).classes()).toContain(
      'ant-spin-lg',
    );
  });
});
