import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ASearchField from './ASearchField.vue';

describe('ASearchField', () => {
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
});
