import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import ASearchField from './ASearchField.vue';

describe('ASearchField', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });
  it('renders a search input with an optional shortcut badge', async () => {
    const wrapper = mount(ASearchField, {
      props: {
        modelValue: '',
        placeholder: '搜索',
        shortcut: 'Ctrl+K',
        ariaLabel: '搜索传感器',
      },
    });

    const input = wrapper.get('input');
    expect(input.attributes('placeholder')).toBe('搜索');
    expect(input.attributes('aria-label')).toBe('搜索传感器');
    expect(wrapper.text()).toContain('Ctrl+K');

    await input.trigger('focus');
    expect(wrapper.text()).not.toContain('Ctrl+K');
  });

  it('clears the query from the trailing button', async () => {
    const wrapper = mount(ASearchField, {
      props: { ariaLabel: '搜索型号', modelValue: 'OMRON' },
    });

    await wrapper.get('[aria-label="清除"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['']);
  });

  it('focuses the input when the surrounding search surface is pressed', async () => {
    const wrapper = mount(ASearchField, {
      attachTo: document.body,
      props: { ariaLabel: '搜索型号', modelValue: '', placeholder: '搜索' },
    });

    await wrapper.get('.a-control').trigger('mousedown');
    expect(document.activeElement).toBe(wrapper.get('input').element);

    wrapper.unmount();
  });

  it('rejects standalone search fields without an accessible name in development', () => {
    expect(() => mount(ASearchField, { props: { modelValue: '' } })).toThrow(
      'ASearchField requires an ariaLabel or AFormRow label',
    );
  });
});
