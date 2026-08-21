import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
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
    ],
  },
];

describe('ATreeSelect', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('selects a nested node after expanding', async () => {
    const wrapper = mount(ATreeSelect, {
      attachTo: document.body,
      props: { nodes, placeholder: '所属组织' },
    });

    await wrapper.get('[role="combobox"]').trigger('click');
    await nextTick();

    document
      .querySelector<HTMLButtonElement>('[aria-label="展开"]')
      ?.click();
    await nextTick();

    const option = [...document.querySelectorAll('[role="option"]')].find(
      (node) => node.textContent?.includes('华东'),
    );
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([2]);
    wrapper.unmount();
  });

  it('expands matching ancestors when searching', async () => {
    const wrapper = mount(ATreeSelect, {
      attachTo: document.body,
      props: { nodes, placeholder: '所属组织' },
    });

    await wrapper.get('[role="combobox"]').trigger('click');
    await nextTick();

    const input = document.querySelector<HTMLInputElement>('input[type="search"]');
    expect(input).not.toBeNull();
    input!.value = '上海';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    expect(document.body.textContent).toContain('上海办');
    expect(document.body.textContent).toContain('总部');
    wrapper.unmount();
  });
});
