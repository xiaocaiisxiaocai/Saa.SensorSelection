import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ACheckbox from './ACheckbox.vue';

describe('ACheckbox', () => {
  it('toggles a boolean model and exposes checkbox semantics', async () => {
    const wrapper = mount(ACheckbox, { props: { modelValue: false } });
    const root = wrapper.get('[role="checkbox"]');

    expect(root.attributes('aria-checked')).toBe('false');
    await root.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
  });

  it('does not toggle when disabled', async () => {
    const wrapper = mount(ACheckbox, {
      props: { modelValue: false, disabled: true },
    });

    await wrapper.get('[role="checkbox"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
