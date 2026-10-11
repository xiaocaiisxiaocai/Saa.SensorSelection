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
    expect(wrapper.find('.ant-input-affix-wrapper-status-error').exists()).toBe(
      true,
    );

    await input.setValue('admin');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['admin']);
  });

  it('clears the value from the allow-clear control', async () => {
    const empty = mount(AField, { props: { modelValue: '' } });
    expect(empty.find('.ant-input-clear-icon-hidden').exists()).toBe(true);

    const wrapper = mount(AField, { props: { modelValue: 'hello' } });
    const clear = wrapper.get(
      '.ant-input-clear-icon:not(.ant-input-clear-icon-hidden)',
    );
    await clear.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['']);
  });

  it('toggles password visibility', async () => {
    const wrapper = mount(AField, {
      props: { modelValue: 'secret', type: 'password' },
    });

    expect(wrapper.get('input').attributes('type')).toBe('password');
    await wrapper.get('.ant-input-password-icon').trigger('click');
    expect(wrapper.get('input').attributes('type')).toBe('text');
    await wrapper.get('.ant-input-password-icon').trigger('click');
    expect(wrapper.get('input').attributes('type')).toBe('password');
  });

  it('forwards autocomplete to the native input', () => {
    const wrapper = mount(AField, {
      props: { modelValue: '', autocomplete: 'username' },
    });
    expect(wrapper.get('input').attributes('autocomplete')).toBe('username');
  });

  it('shows the character count while maxlength is set', () => {
    const wrapper = mount(AField, {
      props: { modelValue: 'abcd', maxlength: 5 },
    });

    expect(wrapper.get('input').attributes('maxlength')).toBe('5');
    expect(wrapper.get('.ant-input-show-count-suffix').text()).toBe('4 / 5');
  });

  it('can hide the character count while keeping the maxlength', () => {
    const wrapper = mount(AField, {
      props: { modelValue: '', maxlength: 64, showCount: false },
    });

    expect(wrapper.get('input').attributes('maxlength')).toBe('64');
    expect(wrapper.find('.ant-input-show-count-suffix').exists()).toBe(false);
  });

  it('focuses the input from the exposed method', () => {
    const wrapper = mount(AField, {
      attachTo: document.body,
      props: { modelValue: 'admin' },
    });

    wrapper.vm.focus();
    expect(document.activeElement).toBe(wrapper.get('input').element);
    wrapper.unmount();
  });

  it('does not offer a clear control when clearable is off', () => {
    const wrapper = mount(AField, {
      props: { modelValue: 'hello', clearable: false },
    });

    expect(wrapper.find('.ant-input-clear-icon').exists()).toBe(false);
  });
});
