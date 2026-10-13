import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import type { MachineTab } from '@/domain';

import MachineTabPages from './MachineTabPages.vue';

const node = { category: '输送机构', configuration: '空配置', item: null };

const tab: MachineTab = {
  id: 7,
  catalog: 'mechanism',
  name: '输送机构',
  sort: 1,
  kind: 'structure',
  pages: [
    { id: 1, name: 'A', node },
    { id: 2, name: 'B', node },
  ],
};

function mountPages(props: Partial<{ tab: MachineTab; writable: boolean }>) {
  return mount(MachineTabPages, {
    props: {
      tab,
      pages: (props.tab ?? tab).pages,
      nodeName: '空配置',
      activePageId: 1,
      writable: true,
      checkable: false,
      checked: new Set<number>(),
      ...props,
    },
  });
}

describe('MachineTabPages', () => {
  it('shows one second-level tab per page, with no drag handles', () => {
    const wrapper = mountPages({});
    const names = wrapper.findAll('.machine-sub-tab__name');
    expect(names.map((name) => name.text())).toEqual(['A', 'B']);
    expect(wrapper.find('[draggable="true"]').exists()).toBe(false);
  });

  it('offers 新建 and the page menu only to writers', () => {
    const writer = mountPages({});
    expect(writer.find('[aria-label="新建二级 Tab"]').exists()).toBe(true);
    expect(writer.findAll('.machine-sub-tab__more')).toHaveLength(2);

    const reader = mountPages({ writable: false });
    expect(reader.find('[aria-label="新建二级 Tab"]').exists()).toBe(false);
    expect(reader.find('.machine-sub-tab__more').exists()).toBe(false);
  });

  it('asks to create the first page when the tab is empty', async () => {
    const wrapper = mountPages({ tab: { ...tab, pages: [] } });
    expect(wrapper.text()).toContain('「空配置」在「输送机构」下还没有二级 Tab');
    await wrapper.get('.machine-tab-pages__empty button').trigger('click');
    expect(wrapper.emitted('add')).toEqual([[]]);
  });
});
