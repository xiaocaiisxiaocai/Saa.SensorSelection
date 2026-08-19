import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import EntitySidebar from './EntitySidebar.vue';

const groups = [
  { name: '首组', items: ['默认项'] },
  { name: '目标组', items: ['目标项'] },
];

function groupToggle(wrapper: ReturnType<typeof mount>, groupName: string) {
  const toggle = wrapper
    .findAll<HTMLButtonElement>('.entity-group__toggle')
    .find((button) => button.text().includes(groupName));

  if (!toggle) throw new Error(`找不到分类：${groupName}`);
  return toggle;
}

describe('entity sidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('重新挂载时展开当前选中项所属分类', () => {
    const wrapper = mount(EntitySidebar, {
      props: {
        groups,
        kind: 'customer',
        label: '条目',
        selected: '目标项',
      },
    });

    expect(groupToggle(wrapper, '目标组').attributes('aria-expanded')).toBe(
      'true',
    );
  });

  it('选中项切换到其他分类时自动展开该分类', async () => {
    const wrapper = mount(EntitySidebar, {
      props: {
        groups,
        kind: 'customer',
        label: '条目',
        selected: '默认项',
      },
    });

    await wrapper.setProps({ selected: '目标项' });

    expect(groupToggle(wrapper, '目标组').attributes('aria-expanded')).toBe(
      'true',
    );
  });

  it('提供可访问的分类栏宽度调节控件', () => {
    const wrapper = mount(EntitySidebar, {
      props: {
        groups,
        kind: 'customer',
        label: '条目',
        selected: '默认项',
      },
    });

    const resizer = wrapper.get('[role="separator"]');
    expect(resizer.attributes('aria-valuemin')).toBe('220');
    expect(resizer.attributes('aria-valuemax')).toBe('520');
    expect(resizer.attributes('aria-valuenow')).toBe('260');
  });

  it('机型侧栏支持勾选多个条目并单独发出选择事件', async () => {
    const wrapper = mount(EntitySidebar, {
      props: {
        groups,
        kind: 'machine',
        label: '机型',
        selected: '默认项',
        selectable: true,
        selectedItems: [],
      },
    });

    const checkbox = wrapper.get('input[aria-label="选择默认项加入示意图"]');
    await checkbox.setValue(true);

    expect(wrapper.emitted('toggleSelect')?.[0]).toEqual([
      { item: '默认项', checked: true },
    ]);
    expect(wrapper.emitted('select')).toBeUndefined();
  });
});
