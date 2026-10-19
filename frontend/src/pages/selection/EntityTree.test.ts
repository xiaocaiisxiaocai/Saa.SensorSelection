import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import type { EntityGroup } from '@/domain';

import EntityTree from './EntityTree.vue';

const groups = [
  {
    name: '结构分类',
    items: ['机型A', '机型B'],
    configurations: [],
  },
] as EntityGroup[];

function mountTree(
  overrides: Partial<{
    compareEnabled: boolean;
    editable: boolean;
    selected: string;
    selectedKey: string;
  }> = {},
) {
  return mount(EntityTree, {
    props: {
      groups,
      selected: '机型A',
      groupLabel: '分类',
      itemLabel: '机型',
      selectableBranches: true,
      ...overrides,
    },
  });
}

function treeNode(wrapper: ReturnType<typeof mountTree>, item: string) {
  const node = wrapper
    .findAll('.entity-tree__node')
    .find((candidate) => candidate.attributes('data-item') === item);
  if (!node) throw new Error(`tree node "${item}" not found`);
  return node;
}

function contextMenuItem(label: string) {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent?.trim() === label,
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('EntityTree comparison context menu', () => {
  it('highlights matching directory names and clears marks when search is cleared', async () => {
    const wrapper = mountTree();
    const search = wrapper.get('input[aria-label="搜索分类或机型"]');
    await search.setValue('机型B');
    await flushPromises();
    expect(
      wrapper.findAll('.entity-tree__label mark').map((mark) => mark.text()),
    ).toEqual(['机型B']);
    expect(wrapper.text()).not.toContain('机型A');
    await search.setValue('');
    await flushPromises();
    expect(wrapper.find('mark').exists()).toBe(false);
    expect(wrapper.text()).toContain('机型A');
    wrapper.unmount();
  });
  it('keeps ordinary clicks selecting the clicked leaf', async () => {
    const wrapper = mountTree({ compareEnabled: true });

    await treeNode(wrapper, '机型B').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('select')).toEqual([
      [{ category: '结构分类', configuration: null, item: '机型B' }],
    ]);
    wrapper.unmount();
  });

  it('emits a target payload without selecting the right-clicked leaf', async () => {
    const wrapper = mountTree({ compareEnabled: true });

    await treeNode(wrapper, '机型B').trigger('contextmenu', {
      clientX: 40,
      clientY: 20,
    });
    await flushPromises();

    const item = contextMenuItem('与当前条目对比');
    expect(item).toBeDefined();
    item?.click();
    await flushPromises();

    expect(wrapper.emitted('compare')).toEqual([
      [{ category: '结构分类', configuration: null, item: '机型B' }],
    ]);
    expect(wrapper.emitted('select')).toBeUndefined();
    wrapper.unmount();
  });

  it('offers a picker for the current leaf without selecting or comparing it and preserves the admin menu', async () => {
    const wrapper = mountTree({
      compareEnabled: true,
      editable: true,
      selected: '机型A',
    });

    await treeNode(wrapper, '机型A').trigger('contextmenu', {
      clientX: 40,
      clientY: 20,
    });
    await flushPromises();
    const compareItem = contextMenuItem('选择其他机型对比…');
    expect(compareItem).toBeDefined();
    expect(compareItem?.getAttribute('aria-disabled')).not.toBe('true');
    compareItem?.click();
    await flushPromises();
    expect(wrapper.emitted('compare')).toBeUndefined();
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.emitted('chooseCompare')).toEqual([[]]);

    await treeNode(wrapper, '机型A')
      .get('button[aria-label="机型A 的更多操作"]')
      .trigger('click');
    await flushPromises();
    expect(contextMenuItem('编辑机型')).toBeDefined();
    expect(contextMenuItem('删除机型')).toBeDefined();
    wrapper.unmount();
  });

  it('does not add the comparison context menu when disabled', async () => {
    const wrapper = mountTree();

    await treeNode(wrapper, '机型B').trigger('contextmenu', {
      clientX: 40,
      clientY: 20,
    });
    await flushPromises();

    expect(contextMenuItem('与当前条目对比')).toBeUndefined();
    wrapper.unmount();
  });
});
