import type { Directive } from 'vue';

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerCanAccessDirective } from '../can-write';
import EntitySidebar from './EntitySidebar.vue';

// 侧栏的增删改按钮使用 v-can-write，未注册指令时 Vue 会告警且指令行为不被覆盖
const directives: Record<string, Directive> = {};
registerCanAccessDirective({
  directive: (name, directive) => {
    directives[name] = directive;
  },
});

const groups = [
  { name: '首组', items: ['默认项'] },
  { name: '目标组', items: ['目标项'] },
];

function mountSidebar(props: {
  groups: { items: string[]; name: string }[];
  kind: 'customer' | 'machine';
  label: string;
  selectable?: boolean;
  selected: string;
  selectedItems?: string[];
}) {
  return mount(EntitySidebar, { global: { directives }, props });
}

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
    const wrapper = mountSidebar({
      groups,
      kind: 'customer',
      label: '条目',
      selected: '目标项',
    });

    expect(groupToggle(wrapper, '目标组').attributes('aria-expanded')).toBe(
      'true',
    );
  });

  it('选中项切换到其他分类时自动展开该分类', async () => {
    const wrapper = mountSidebar({
      groups,
      kind: 'customer',
      label: '条目',
      selected: '默认项',
    });

    await wrapper.setProps({ selected: '目标项' });

    expect(groupToggle(wrapper, '目标组').attributes('aria-expanded')).toBe(
      'true',
    );
  });

  it('提供可访问的分类栏宽度调节控件', () => {
    const wrapper = mountSidebar({
      groups,
      kind: 'customer',
      label: '条目',
      selected: '默认项',
    });

    const resizer = wrapper.get('[role="separator"]');
    expect(resizer.attributes('aria-valuemin')).toBe('220');
    expect(resizer.attributes('aria-valuemax')).toBe('520');
    expect(resizer.attributes('aria-valuenow')).toBe('260');
  });

  it('机型侧栏支持勾选多个条目并单独发出选择事件', async () => {
    const wrapper = mountSidebar({
      groups,
      kind: 'machine',
      label: '机型',
      selected: '默认项',
      selectable: true,
      selectedItems: [],
    });

    const checkbox = wrapper.get('input[aria-label="选择默认项加入示意图"]');
    await checkbox.setValue(true);

    expect(wrapper.emitted('toggleSelect')?.[0]).toEqual([
      { item: '默认项', checked: true },
    ]);
    expect(wrapper.emitted('select')).toBeUndefined();
  });
});
