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

    expect(wrapper.get('button').attributes('aria-label')).toBe('编辑');
    expect(wrapper.find('.icon-stub').exists()).toBe(true);
  });

  it('throws in development when the label is empty', () => {
    expect(() =>
      mount(AIconButton, {
        props: { icon: IconStub, label: '' },
      }),
    ).toThrow(/label/);
  });

  it('does not expand the hit area for the small table size', () => {
    const wrapper = mount(AIconButton, {
      props: { icon: IconStub, label: '删除', size: 'small' },
    });

    expect(wrapper.get('button').classes()).toContain('a-icon-button--small');
  });
});
