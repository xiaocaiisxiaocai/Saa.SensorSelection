import { mount } from '@vue/test-utils';
import { defineComponent, markRaw } from 'vue';
import { describe, expect, it } from 'vitest';

import AIconButton from './AIconButton.vue';

const IconStub = markRaw(
  defineComponent({
    name: 'IconStub',
    template: '<svg class="icon-stub" />',
  }),
);

describe('AIconButton', () => {
  it('requires a label as the accessible name', () => {
    const wrapper = mount(AIconButton, {
      props: { icon: IconStub, label: '编辑' },
    });
    const button = wrapper.get('button');

    expect(button.attributes('aria-label')).toBe('编辑');
    expect(button.classes()).toContain('a-icon-button');
    expect(button.find('.icon-stub').exists()).toBe(true);
  });

  it('throws in development when the label is empty', () => {
    expect(() =>
      mount(AIconButton, {
        props: { icon: IconStub, label: '' },
      }),
    ).toThrow(/label/);
  });

  it('keeps a reasoned disabled action focusable and inert', async () => {
    const wrapper = mount(AIconButton, {
      props: {
        icon: IconStub,
        label: '删除',
        disabled: true,
        disabledReason: '系统内置角色，不可删除',
      },
    });
    const button = wrapper.get('button');

    expect(button.attributes('disabled')).toBeUndefined();
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(button.attributes('aria-label')).toBe('删除（系统内置角色，不可删除）');
    await button.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('keeps native disabled when no reason is given', async () => {
    const wrapper = mount(AIconButton, {
      props: { icon: IconStub, label: '上一页', disabled: true },
    });
    const button = wrapper.get('button');

    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('aria-disabled')).toBeUndefined();
    await button.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('emits click and maps size onto the button', async () => {
    const wrapper = mount(AIconButton, {
      props: { icon: IconStub, label: '删除', size: 'small' },
    });
    const button = wrapper.get('button');

    expect(button.classes()).toContain('ant-btn-sm');
    await button.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });
});
