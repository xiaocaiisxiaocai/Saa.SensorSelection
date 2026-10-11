import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AButton from './AButton.vue';

describe('AButton', () => {
  it('renders a button with the plain medium defaults', () => {
    const wrapper = mount(AButton, { slots: { default: '取消' } });
    const button = wrapper.get('button');

    expect(button.attributes('type')).toBe('button');
    expect(button.classes()).toEqual(
      expect.arrayContaining(['a-button', 'a-button--plain', 'a-button--medium']),
    );
    // Ant Design inserts a space between a two-character CJK label.
    expect(button.text().replace(/\s/g, '')).toBe('取消');
  });

  it('applies variant, size, and block modifiers', () => {
    const wrapper = mount(AButton, {
      props: { variant: 'filled', size: 'xlarge', block: true },
      slots: { default: '登录' },
    });
    const button = wrapper.get('button');

    expect(button.classes()).toEqual(
      expect.arrayContaining([
        'a-button--filled',
        'a-button--xlarge',
        'a-button--block',
      ]),
    );
  });

  it('uses the submit html type when asked', () => {
    const wrapper = mount(AButton, {
      props: { type: 'submit' },
      slots: { default: '保存' },
    });

    expect(wrapper.get('button').attributes('type')).toBe('submit');
  });

  it('emits click from the button and ignores disabled or loading clicks', async () => {
    const enabled = mount(AButton, { slots: { default: '保存' } });
    await enabled.get('button').trigger('click');
    expect(enabled.emitted('click')).toHaveLength(1);

    const disabled = mount(AButton, {
      props: { disabled: true },
      slots: { default: '保存' },
    });
    const disabledButton = disabled.get('button');
    expect(disabledButton.attributes('disabled')).toBeDefined();
    await disabledButton.trigger('click');
    expect(disabled.emitted('click')).toBeUndefined();

    const loading = mount(AButton, {
      props: { loading: true },
      slots: { default: '保存' },
    });
    const loadingButton = loading.get('button');
    expect(loadingButton.attributes('aria-busy')).toBe('true');
    await loadingButton.trigger('click');
    expect(loading.emitted('click')).toBeUndefined();
  });
});
