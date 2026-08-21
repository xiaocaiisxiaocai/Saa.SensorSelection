import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ATextArea from './ATextArea.vue';

describe('ATextArea', () => {
  it('uses three rows by default and emits updates', async () => {
    const wrapper = mount(ATextArea, { props: { modelValue: '' } });
    const area = wrapper.get('textarea');

    expect(area.attributes('rows')).toBe('3');
    await area.setValue('制程注意');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['制程注意']);
  });

  it('sets aria-invalid when the row is invalid', () => {
    const wrapper = mount(ATextArea, {
      props: { modelValue: '', invalid: true },
    });

    expect(wrapper.get('textarea').attributes('aria-invalid')).toBe('true');
  });
});
