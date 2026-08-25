import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AField from './AField.vue';

describe('AField', () => {
  it('emits the typed value and marks invalid fields', async () => {
    const wrapper = mount(AField, {
      props: { modelValue: '', invalid: true, describedBy: 'name-error' },
    });
    const input = wrapper.get('input');

    expect(input.attributes('aria-invalid')).toBe('true');
    expect(input.attributes('aria-describedby')).toBe('name-error');

    await input.setValue('admin');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['admin']);
  });

  it('shows a clear button when focused with a value', async () => {
    const wrapper = mount(AField, { props: { modelValue: 'hello' } });

    expect(wrapper.find('[aria-label="清除"]').exists()).toBe(false);
    await wrapper.get('input').trigger('focus');
    expect(wrapper.find('[aria-label="清除"]').exists()).toBe(true);

    await wrapper.get('[aria-label="清除"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['']);
  });

  it('toggles password visibility', async () => {
    const wrapper = mount(AField, {
      props: { modelValue: 'secret', type: 'password' },
    });

    expect(wrapper.get('input').attributes('type')).toBe('password');
    await wrapper.get('[aria-label="显示密码"]').trigger('click');
    expect(wrapper.get('input').attributes('type')).toBe('text');
    expect(wrapper.find('[aria-label="隐藏密码"]').exists()).toBe(true);
  });

  it('forwards autocomplete to the native input', () => {
    const wrapper = mount(AField, {
      props: { modelValue: '', autocomplete: 'username' },
    });
    expect(wrapper.get('input').attributes('autocomplete')).toBe('username');
  });

  it('shows the character count when focused or over 80 percent', async () => {
    const wrapper = mount(AField, {
      props: { modelValue: 'abcd', maxlength: 5 },
    });

    expect(wrapper.text()).not.toContain('4/5');
    await wrapper.get('input').trigger('focus');
    expect(wrapper.text()).toContain('4/5');
  });

  it('can hide the character count while keeping the maxlength', async () => {
    const wrapper = mount(AField, {
      props: { modelValue: '', maxlength: 64, showCount: false },
    });

    await wrapper.get('input').trigger('focus');
    expect(wrapper.get('input').attributes('maxlength')).toBe('64');
    expect(wrapper.text()).not.toContain('0/64');
  });
});
