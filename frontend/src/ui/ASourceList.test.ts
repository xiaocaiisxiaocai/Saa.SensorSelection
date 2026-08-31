import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import ASourceList from './ASourceList.vue';
import type { SourceGroup } from './source-list';

const groups: SourceGroup[] = [
  { name: '华东', items: ['景旺', '深南'] },
  { name: '华南', items: ['胜宏'] },
];

const storageKey = 'apple-frontend:test-source-list';

function mountList(
  props: Partial<{
    selected: string;
    checkedItems: string[];
    searchable: boolean;
    editable: boolean;
    sortable: boolean;
    minWidth: number;
    maxWidth: number;
    defaultWidth: number;
  }> = {},
) {
  return mount(ASourceList, {
    attachTo: document.body,
    props: {
      groups,
      selected: '景旺',
      groupLabel: '区域',
      itemLabel: '客户',
      storageKey,
      searchable: true,
      ...props,
    },
  });
}

describe('ASourceList', () => {
  afterEach(() => {
    localStorage.removeItem(storageKey);
    document.body.innerHTML = '';
  });

  it('expands the group that owns the selected item', () => {
    const wrapper = mountList({ selected: '胜宏' });
    const toggle = wrapper
      .findAll('[aria-expanded]')
      .find((node) => node.text().includes('华南'));

    expect(toggle?.attributes('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  it('quickly expands and collapses all visible groups', async () => {
    const wrapper = mountList();
    const expandedStates = () =>
      wrapper
        .findAll('.a-source-list__toggle')
        .map((node) => node.attributes('aria-expanded'));

    expect(expandedStates()).toEqual(['true', 'false']);
    expect(
      wrapper
        .get('.a-source-list__search')
        .find('[aria-label="展开全部区域"]')
        .exists(),
    ).toBe(true);
    expect(wrapper.text()).not.toContain('展开全部');

    await wrapper.get('[aria-label="展开全部区域"]').trigger('click');
    expect(expandedStates()).toEqual(['true', 'true']);

    await wrapper.get('[aria-label="折叠全部区域"]').trigger('click');
    expect(expandedStates()).toEqual(['false', 'false']);
    wrapper.unmount();
  });

  it('exposes a keyboard-adjustable width handle', async () => {
    const wrapper = mountList();
    const resizer = wrapper.get('[role="separator"]');

    expect(resizer.attributes('aria-valuemin')).toBe('160');
    expect(resizer.attributes('aria-valuemax')).toBe('320');
    expect(resizer.attributes('aria-valuenow')).toBe('220');

    await resizer.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.get('[role="separator"]').attributes('aria-valuenow')).toBe(
      '236',
    );
    wrapper.unmount();
  });

  it('uses custom default and max width', () => {
    const wrapper = mountList({
      minWidth: 260,
      defaultWidth: 260,
      maxWidth: 400,
    });
    const resizer = wrapper.get('[role="separator"]');
    expect(resizer.attributes('aria-valuemin')).toBe('260');
    expect(resizer.attributes('aria-valuenow')).toBe('260');
    expect(resizer.attributes('aria-valuemax')).toBe('400');
    wrapper.unmount();
  });

  it('filters items and emits select', async () => {
    const wrapper = mountList();
    await wrapper.get('input[type="search"]').setValue('胜宏');
    await nextTick();

    expect(wrapper.text()).toContain('胜宏');
    expect(wrapper.text()).not.toContain('景旺');

    const item = wrapper.findAll('button').find((node) => node.text() === '胜宏');
    if (!item) {
      throw new Error('expected filtered item 胜宏');
    }

    await item.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([
      { group: '华南', item: '胜宏' },
    ]);
    wrapper.unmount();
  });

  it('emits toggleCheck without selecting the row', async () => {
    const wrapper = mountList({ checkedItems: [] });
    await wrapper.get('[aria-label="选择景旺"]').trigger('click');

    expect(wrapper.emitted('toggleCheck')?.[0]).toEqual([
      { item: '景旺', checked: true },
    ]);
    expect(wrapper.emitted('select')).toBeUndefined();
    wrapper.unmount();
  });

  it('shows drag handles only when sortable and editable', () => {
    const hidden = mountList({ sortable: true, editable: false });
    expect(hidden.find('[aria-label="拖拽排序"]').exists()).toBe(false);
    hidden.unmount();

    const shown = mountList({ sortable: true, editable: true });
    expect(shown.findAll('[aria-label="拖拽排序"]').length).toBeGreaterThan(0);
    shown.unmount();
  });

  it('hides authoring actions unless editable', () => {
    const hidden = mountList({ editable: false });
    expect(hidden.find('[aria-label="新建区域"]').exists()).toBe(false);
    hidden.unmount();

    const shown = mountList({ editable: true });
    expect(shown.find('[aria-label="新建区域"]').exists()).toBe(true);
    shown.unmount();
  });

  it('shows a search empty state', async () => {
    const wrapper = mountList();
    await wrapper.get('input[type="search"]').setValue('不存在');
    await nextTick();

    expect(wrapper.text()).toContain('没有匹配“不存在”的结果');
    wrapper.unmount();
  });
});
