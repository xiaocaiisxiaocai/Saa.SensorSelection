import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import MachineGlobalSearchResults from './MachineGlobalSearchResults.vue';

describe('MachineGlobalSearchResults', () => {
  it('highlights the matched path and actual record content without changing the selected target', async () => {
    const result = {
      boardCharacteristicNames: ['平板'],
      category: '输送机构',
      configuration: 'SFC',
      machineModelNames: [],
      machineName: '单段',
      matchCount: 1,
      processStepNames: [],
      rowIds: [8],
      sectionId: 11,
      sectionName: '输送机构',
    };
    const document = {
      ...result,
      boardCharacteristicId: 1,
      boardCharacteristicName: '平板',
      machineModelId: null,
      machineModelName: '',
      processStepId: null,
      processStepName: '',
      rowId: 8,
      searchableText: '入口检知 SICK WS12-3D2430',
    };
    const wrapper = mount(MachineGlobalSearchResults, {
      props: {
        results: [result],
        filtered: true,
        query: 'ws12',
        documents: [document],
      },
    });
    expect(
      wrapper.get('.machine-global-search-results__match mark').text(),
    ).toBe('WS12');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('select')).toEqual([[result]]);
    await wrapper.setProps({ query: '输送' });
    expect(wrapper.findAll('mark').map((mark) => mark.text())).toEqual([
      '输送',
      '输送',
    ]);
    await wrapper.setProps({ query: '' });
    expect(wrapper.find('mark').exists()).toBe(false);
    expect(wrapper.find('.machine-global-search-results__match').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });
  it('tells "no records yet" apart from "nothing matched"', () => {
    // 没设条件时结果就是全部结构：空了是还没有记录，不能叫人「换个条件」
    const empty = mount(MachineGlobalSearchResults, {
      props: { results: [], filtered: false },
    });
    expect(empty.text()).toContain('还没有任何结构记录');
    expect(empty.text()).not.toContain('换个条件');
    empty.unmount();

    const missed = mount(MachineGlobalSearchResults, {
      props: { results: [], filtered: true },
    });
    expect(missed.text()).toContain('没有找到符合条件的结构，换个条件试试');
    missed.unmount();
  });
});
