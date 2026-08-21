import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ATabBar from './ATabBar.vue';

const tabs = [
  { label: '标准输送段', value: 'conveyor' },
  { label: '本机工位', value: 'station', closable: true, renamable: true },
];

describe('ATabBar', () => {
  it('exposes tablist semantics and the selected tab', () => {
    const wrapper = mount(ATabBar, {
      props: { modelValue: 'station', tabs },
    });

    const items = wrapper.findAll('[role="tab"]');
    expect(items).toHaveLength(2);
    expect(items[1]?.attributes('aria-selected')).toBe('true');
  });

  it('emits the clicked tab', async () => {
    const wrapper = mount(ATabBar, {
      props: { modelValue: 'conveyor', tabs },
    });

    await wrapper.findAll('[role="tab"]')[1]?.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['station']);
  });

  it('emits rename, close, and add from the extra actions', async () => {
    const wrapper = mount(ATabBar, {
      props: { modelValue: 'station', tabs, addable: true },
    });

    await wrapper.get('[aria-label="重命名本机工位"]').trigger('click');
    await wrapper.get('[aria-label="删除本机工位"]').trigger('click');
    await wrapper.get('[aria-label="新增 Tab"]').trigger('click');

    expect(wrapper.emitted('rename')?.[0]).toEqual(['station']);
    expect(wrapper.emitted('close')?.[0]).toEqual(['station']);
    expect(wrapper.emitted('add')).toHaveLength(1);
  });

  it('keeps overflow nudges in the tab bar flow instead of overlaying tabs', () => {
    const wrapper = mount(ATabBar, {
      props: { modelValue: 'conveyor', tabs, addable: true },
    });

    const viewport = wrapper.get('.a-tab-bar__viewport');
    expect(viewport.element.querySelector('.a-tab-bar__scroller')).not.toBeNull();
    expect(wrapper.find('.a-tab-bar__nudge--start').exists()).toBe(false);
  });
});
