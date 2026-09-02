import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AField from './AField.vue';
import AFormRow from './AFormRow.vue';

describe('AFormRow', () => {
  it('wires the label to the nested field and surfaces errors', () => {
    const wrapper = mount({
      components: { AField, AFormRow },
      template:
        '<AFormRow label="用户名" required error="请输入用户名"><AField modelValue="" /></AFormRow>',
    });

    const input = wrapper.get('input');
    const label = wrapper.get('label');
    const error = wrapper.get('.a-form-row__error');

    expect(label.text()).toContain('用户名');
    expect(label.attributes('for')).toBe(input.attributes('id'));
    expect(input.attributes('aria-invalid')).toBe('true');
    expect(input.attributes('aria-describedby')).toBe(error.attributes('id'));
    expect(error.text()).toBe('请输入用户名');
    expect(error.attributes('role')).toBe('alert');
  });

  it('spans the full grid when wide', () => {
    const wrapper = mount(AFormRow, {
      props: { label: '描述', wide: true },
    });
    expect(wrapper.classes()).toContain('a-form-row--wide');
  });
});
