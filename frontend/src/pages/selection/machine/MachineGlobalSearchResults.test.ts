import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import MachineGlobalSearchResults from './MachineGlobalSearchResults.vue';

describe('MachineGlobalSearchResults', () => {
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
