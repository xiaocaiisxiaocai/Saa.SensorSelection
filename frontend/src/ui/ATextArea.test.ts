import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ATextArea from './ATextArea.vue';

describe('ATextArea', () => {
  it('uses three rows by default and emits updates', async () => {
    const wrapper = mount(ATextArea, {
      props: { modelValue: '', placeholder: '备注' },
    });
    const area = wrapper.get('textarea');

    expect(area.attributes('rows')).toBe('3');
    expect(area.attributes('placeholder')).toBe('备注');
    expect(wrapper.find('.a-control').exists()).toBe(false);

    await area.setValue('制程注意');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['制程注意']);
  });

  it('honors a rows override', () => {
    const wrapper = mount(ATextArea, {
      props: { modelValue: '', rows: 6 },
    });

    expect(wrapper.get('textarea').attributes('rows')).toBe('6');
  });

  it('sets aria-invalid when the field is invalid', () => {
    const wrapper = mount(ATextArea, {
      props: { modelValue: '', invalid: true, describedBy: 'note-error' },
    });
    const area = wrapper.get('textarea');

    expect(area.attributes('aria-invalid')).toBe('true');
    expect(area.attributes('aria-describedby')).toBe('note-error');
    expect(wrapper.find('.ant-input-status-error').exists()).toBe(true);
  });

  it('shows a character count and limits input to maxlength', async () => {
    const wrapper = mount(ATextArea, {
      props: { modelValue: '制程注意', maxlength: 10 },
    });

    expect(wrapper.get('textarea').element.parentElement?.getAttribute('data-count')).toBe(
      '4 / 10',
    );

    await wrapper.get('textarea').setValue('123456789012345');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['1234567890']);
  });

  it('focuses the textarea from the exposed method', () => {
    const wrapper = mount(ATextArea, {
      attachTo: document.body,
      props: { modelValue: '' },
    });

    wrapper.vm.focus();
    expect(document.activeElement).toBe(wrapper.get('textarea').element);
    wrapper.unmount();
  });

  it('does not accept edits when disabled', () => {
    const wrapper = mount(ATextArea, {
      props: { modelValue: '只读', disabled: true },
    });

    expect(wrapper.get('textarea').attributes('disabled')).toBeDefined();
  });
});
