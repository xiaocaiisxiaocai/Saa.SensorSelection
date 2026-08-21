import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ASwitch from './ASwitch.vue';

describe('ASwitch', () => {
  it('toggles with switch semantics', async () => {
    const wrapper = mount(ASwitch, { props: { modelValue: false } });
    const root = wrapper.get('[role="switch"]');

    expect(root.attributes('aria-checked')).toBe('false');
    await root.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
  });

  it('renders the large track size', () => {
    const wrapper = mount(ASwitch, {
      props: { modelValue: true, size: 'large' },
    });

    expect(wrapper.get('[role="switch"]').classes()).toContain('a-switch--large');
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe(
      'true',
    );
  });
});
