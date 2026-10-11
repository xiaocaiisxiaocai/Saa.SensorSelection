import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import ATreeSelect from './ATreeSelect.vue';
import type { TreeNode } from './tree-select';

const nodes: TreeNode[] = [
  {
    id: 1,
    label: '总部',
    children: [
      {
        id: 2,
        label: '华东',
        children: [{ id: 3, label: '上海办' }],
      },
      { id: 4, label: '华南' },
      { id: 5, label: '停用办', disabled: true },
      { id: 6, label: '研发', hint: 'R&D' },
    ],
  },
];

function titles(): string[] {
  return [...document.querySelectorAll('.ant-select-tree-title')].map(
    (node) => node.textContent?.trim() ?? '',
  );
}

async function openTree(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('.ant-select-selector').trigger('mousedown');
  await flushPromises();
}

describe('ATreeSelect', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('maps id and label into the tree and updates the model from a nested node', async () => {
    const wrapper = mount(ATreeSelect, {
      attachTo: document.body,
      props: { nodes, placeholder: '所属组织' },
    });

    expect(wrapper.get('.a-tree-select').classes()).toContain('a-tree-select');
    expect(wrapper.get('.ant-select-selection-placeholder').text()).toBe('所属组织');

    await openTree(wrapper);
    expect(titles()).toEqual(
      expect.arrayContaining(['总部', '华东', '上海办', '华南', '研发（R&D）']),
    );

    const east = [...document.querySelectorAll('.ant-select-tree-title')].find(
      (node) => node.textContent?.trim() === '华东',
    );
    east?.closest<HTMLElement>('.ant-select-tree-node-content-wrapper')?.click();
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([2]);
    wrapper.unmount();
  });

  it('shows the selected node label', () => {
    const wrapper = mount(ATreeSelect, {
      props: { nodes, modelValue: 3 },
    });

    expect(wrapper.get('.ant-select-selection-item').text()).toContain('上海办');
  });

  it('does not select a disabled node', async () => {
    const wrapper = mount(ATreeSelect, {
      attachTo: document.body,
      props: { nodes, placeholder: '所属组织' },
    });

    await openTree(wrapper);
    const disabled = [...document.querySelectorAll('.ant-select-tree-title')].find(
      (node) => node.textContent?.trim() === '停用办',
    );
    disabled?.closest<HTMLElement>('.ant-select-tree-node-content-wrapper')?.click();
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });

  it('filters by title and keeps matching nested labels', async () => {
    const wrapper = mount(ATreeSelect, {
      attachTo: document.body,
      props: { nodes, placeholder: '所属组织' },
    });

    await openTree(wrapper);
    await wrapper.get('input[role="combobox"]').setValue('上海');
    await flushPromises();

    const shown = titles();
    expect(shown.some((title) => title.includes('上海办'))).toBe(true);
    expect(shown.some((title) => title.includes('华南'))).toBe(false);
    wrapper.unmount();
  });

  it('clears the selected id', async () => {
    const wrapper = mount(ATreeSelect, {
      props: { nodes, modelValue: 3 },
    });

    await wrapper.get('.ant-select-clear').trigger('mousedown');
    // Ant Design TreeSelect clears with undefined; the wrapper does not coerce it to null.
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([undefined]);
  });

  it('does not open when disabled', async () => {
    const wrapper = mount(ATreeSelect, {
      attachTo: document.body,
      props: { nodes, disabled: true, placeholder: '所属组织' },
    });

    expect(wrapper.get('input').attributes('disabled')).toBeDefined();
    await openTree(wrapper);
    expect(titles()).toHaveLength(0);
    wrapper.unmount();
  });
});
