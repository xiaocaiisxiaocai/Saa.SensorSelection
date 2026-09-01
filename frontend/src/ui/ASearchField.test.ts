import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import ASearchField from './ASearchField.vue';

describe('ASearchField', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });
  it('renders a search input with an optional shortcut badge', async () => {
    const wrapper = mount(ASearchField, {
      props: { modelValue: '', placeholder: '搜索', shortcut: 'Ctrl+K' },
    });

    const input = wrapper.get('input');
    expect(input.attributes('placeholder')).toBe('搜索');
    expect(wrapper.text()).toContain('Ctrl+K');

    await input.trigger('focus');
    expect(wrapper.text()).not.toContain('Ctrl+K');
  });

  it('clears the query from the trailing button', async () => {
    const wrapper = mount(ASearchField, { props: { modelValue: 'OMRON' } });

    await wrapper.get('[aria-label="清除"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['']);
  });

  it('focuses the input when the surrounding search surface is pressed', async () => {
    const wrapper = mount(ASearchField, {
      attachTo: document.body,
      props: { modelValue: '', placeholder: '搜索' },
    });

    await wrapper.get('.a-control').trigger('mousedown');
    expect(document.activeElement).toBe(wrapper.get('input').element);

    wrapper.unmount();
  });
});
