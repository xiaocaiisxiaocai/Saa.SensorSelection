import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ASwitch from './ASwitch.vue';

describe('ASwitch', () => {
  it('toggles a boolean model with switch semantics', async () => {
    const wrapper = mount(ASwitch, {
      props: { modelValue: false, ariaLabel: '启用' },
    });
    const control = wrapper.get('[role="switch"]');

    expect(control.attributes('aria-checked')).toBe('false');
    expect(control.attributes('aria-label')).toBe('启用');

    await control.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);

    await wrapper.setProps({ modelValue: true });
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe(
      'true',
    );
  });

  it('does not toggle when disabled', async () => {
    const wrapper = mount(ASwitch, {
      props: { modelValue: false, disabled: true },
    });
    const control = wrapper.get('[role="switch"]');

    expect(control.attributes('disabled')).toBeDefined();
    await control.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
