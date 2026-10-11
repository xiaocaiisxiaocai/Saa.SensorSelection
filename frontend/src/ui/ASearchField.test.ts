import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AFormRow from './AFormRow.vue';
import ASearchField from './ASearchField.vue';

describe('ASearchField', () => {
  it('names the field and shows the shortcut and search icon', async () => {
    const wrapper = mount(ASearchField, {
      props: {
        modelValue: '',
        placeholder: '搜索',
        shortcut: 'Ctrl+K',
        ariaLabel: '搜索传感器',
      },
    });
    const input = wrapper.get('input');

    expect(wrapper.get('.a-search-field').classes()).not.toContain('a-control');
    expect(wrapper.find('svg.lucide-search').exists()).toBe(true);
    expect(input.attributes('placeholder')).toBe('搜索');
    expect(input.attributes('aria-label')).toBe('搜索传感器');
    expect(wrapper.text()).toContain('Ctrl+K');

    await input.trigger('focus');
    expect(wrapper.text()).toContain('Ctrl+K');
  });

  it('falls back to the placeholder when no ariaLabel is passed', () => {
    const wrapper = mount(ASearchField, {
      props: { modelValue: '', placeholder: '搜索型号' },
    });

    expect(wrapper.get('input').attributes('aria-label')).toBe('搜索型号');
  });

  it('uses the visible form label instead of an aria-label', () => {
    const wrapper = mount({
      components: { AFormRow, ASearchField },
      template:
        '<AFormRow label="型号"><ASearchField placeholder="搜索型号" /></AFormRow>',
    });
    const input = wrapper.get('input');

    expect(input.attributes('aria-label')).toBeUndefined();
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'));
  });

  it('clears the query from the allow-clear control', async () => {
    const wrapper = mount(ASearchField, {
      props: { ariaLabel: '搜索型号', modelValue: 'OMRON' },
    });

    await wrapper
      .get('.ant-input-clear-icon:not(.ant-input-clear-icon-hidden)')
      .trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['']);
  });

  it('marks invalid and disabled fields', () => {
    const wrapper = mount(ASearchField, {
      props: {
        ariaLabel: '搜索型号',
        modelValue: 'OMRON',
        invalid: true,
        describedBy: 'search-error',
        disabled: true,
      },
    });
    const input = wrapper.get('input');

    expect(input.attributes('aria-invalid')).toBe('true');
    expect(input.attributes('aria-describedby')).toBe('search-error');
    expect(input.attributes('disabled')).toBeDefined();
  });
});
