import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ABadge from './ABadge.vue';

describe('ABadge', () => {
  it('renders the label in a status capsule', () => {
    const wrapper = mount(ABadge, { props: { label: '现用' } });

    expect(wrapper.text()).toBe('现用');
    expect(wrapper.classes()).toContain('a-badge--neutral');
  });

  it('maps semantic tones to system colors', () => {
    const wrapper = mount(ABadge, { props: { label: '停用', tone: 'orange' } });

    expect(wrapper.classes()).toContain('a-badge--orange');
  });
});
