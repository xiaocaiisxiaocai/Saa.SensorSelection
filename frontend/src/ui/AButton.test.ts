import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AButton from './AButton.vue';

describe('AButton', () => {
  it('renders a button with the plain medium defaults', () => {
    const wrapper = mount(AButton, { slots: { default: '取消' } });
    const button = wrapper.get('button');

    expect(button.attributes('type')).toBe('button');
    expect(button.classes()).toContain('a-button--plain');
    expect(button.classes()).toContain('a-button--medium');
    expect(button.text()).toBe('取消');
  });

  it('applies variant, size, and block modifiers', () => {
    const wrapper = mount(AButton, {
      props: { variant: 'filled', size: 'xlarge', block: true },
      slots: { default: '登 录' },
    });

    expect(wrapper.classes()).toContain('a-button--filled');
    expect(wrapper.classes()).toContain('a-button--xlarge');
    expect(wrapper.classes()).toContain('a-button--block');
  });

  it('does not emit click when disabled or loading', async () => {
    const disabled = mount(AButton, {
      props: { disabled: true },
      slots: { default: '保存' },
    });
    await disabled.trigger('click');
    expect(disabled.emitted('click')).toBeUndefined();

    const loading = mount(AButton, {
      props: { loading: true },
      slots: { default: '保存' },
    });
    expect(loading.attributes('aria-busy')).toBe('true');
    expect(loading.attributes('disabled')).toBeDefined();
    expect(loading.find('.a-spinner').exists()).toBe(true);
    await loading.trigger('click');
    expect(loading.emitted('click')).toBeUndefined();
  });
});
