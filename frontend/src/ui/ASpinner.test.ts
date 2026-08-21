import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ASpinner from './ASpinner.vue';

describe('ASpinner', () => {
  it('exposes a status role for screen readers', () => {
    const wrapper = mount(ASpinner);

    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.attributes('aria-label')).toBe('加载中');
  });

  it('renders eight spokes and the requested size', () => {
    const wrapper = mount(ASpinner, { props: { size: 24 } });

    expect(wrapper.findAll('.a-spinner__spoke')).toHaveLength(8);
    expect(wrapper.classes()).toContain('a-spinner--24');
  });
});
