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
    expect(wrapper.find('button button').exists()).toBe(false);
  });

  it('keeps overflow nudges in the tab bar flow instead of overlaying tabs', () => {
    const wrapper = mount(ATabBar, {
      props: { modelValue: 'conveyor', tabs, addable: true },
    });

    const viewport = wrapper.get('.a-tab-bar__viewport');
    expect(viewport.element.querySelector('.a-tab-bar__scroller')).not.toBeNull();
    expect(wrapper.find('.a-tab-bar__nudge--start').exists()).toBe(false);
  });

  it('wires tab/tabpanel ids from the id prop so callers can associate their content', () => {
    const wrapper = mount(ATabBar, {
      props: { id: 'demo-tabs', modelValue: 'station', tabs },
    });

    const items = wrapper.findAll('[role="tab"]');
    expect(items[1]?.attributes('id')).toBe('demo-tabs-tab-station');
    expect(items[1]?.attributes('aria-controls')).toBe('demo-tabs-panel-station');
  });

  it('omits id/aria-controls entirely when no id prop is given', () => {
    const wrapper = mount(ATabBar, {
      props: { modelValue: 'station', tabs },
    });

    const items = wrapper.findAll('[role="tab"]');
    expect(items[1]?.attributes('id')).toBeUndefined();
    expect(items[1]?.attributes('aria-controls')).toBeUndefined();
  });

  it('keeps every tablist child owned by the tablist or hidden from it', () => {
    const wrapper = mount(ATabBar, {
      props: {
        ariaLabel: '机型内容分区',
        modelValue: 'station',
        tabs: [{ ...tabs[0]!, renamable: true, closable: true }, tabs[1]!],
      },
    });

    const tablist = wrapper.get('[role="tablist"]');
    expect(tablist.attributes('aria-label')).toBe('机型内容分区');

    // tablist 的直接子元素只能是 tab 本身、presentation 包装层，或对无障碍
    // 树隐藏的装饰元素；混入普通 div 会切断 tablist → tab 的所有权关系。
    const strays = [...tablist.element.children].filter(
      (child) =>
        child.getAttribute('role') !== 'tab' &&
        child.getAttribute('role') !== 'presentation' &&
        child.getAttribute('aria-hidden') !== 'true',
    );
    expect(strays).toHaveLength(0);
  });
});
