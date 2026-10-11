import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ACheckbox from './ACheckbox.vue';

describe('ACheckbox', () => {
  it('toggles a boolean model from the checkbox input', async () => {
    const wrapper = mount(ACheckbox, {
      props: { modelValue: false, ariaLabel: '启用' },
      slots: { default: '启用' },
    });
    const input = wrapper.get<HTMLInputElement>('input[type="checkbox"]');

    expect(input.element.checked).toBe(false);
    expect(input.attributes('aria-label')).toBe('启用');
    expect(wrapper.text()).toContain('启用');

    await input.setValue(true);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
  });

  it('does not toggle when disabled', async () => {
    const wrapper = mount(ACheckbox, {
      props: { modelValue: false, disabled: true },
    });
    const input = wrapper.get<HTMLInputElement>('input[type="checkbox"]');

    expect(input.attributes('disabled')).toBeDefined();
    await input.setValue(true);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('marks an indeterminate model as mixed', () => {
    const wrapper = mount(ACheckbox, {
      props: { modelValue: 'indeterminate' },
    });
    const input = wrapper.get<HTMLInputElement>('input[type="checkbox"]');

    expect(input.element.checked).toBe(false);
    expect(input.attributes('aria-checked')).toBe('mixed');
    expect(wrapper.find('.ant-checkbox-indeterminate').exists()).toBe(true);
  });
});
