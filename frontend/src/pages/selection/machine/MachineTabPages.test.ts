import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import type { MachineTab } from '@/domain';
import {
  TAB_MACHINE_DRAG,
  TREE_ITEM_DRAG,
} from '@/pages/selection/entity/entity-drag';

import MachineTabMembers from './MachineTabMembers.vue';

const tab: MachineTab = {
  id: 7,
  catalog: 'mechanism',
  name: '输送机构',
  sort: 1,
  kind: 'structure',
  machines: ['A', 'B', 'C'],
};

/** happy-dom 的拖放事件没有 dataTransfer，自己挂一个最小实现 */
function dragEvent(type: string, data: Record<string, string>, clientX = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    dataTransfer: {
      value: {
        dropEffect: 'none',
        effectAllowed: 'all',
        getData: (kind: string) => data[kind] ?? '',
        setData: (kind: string, value: string) => {
          data[kind] = value;
        },
        types: Object.keys(data),
      },
    },
  });
  return event;
}

function mountMembers(writable = true) {
  return mount(MachineTabMembers, {
    props: {
      tab,
      active: 'A',
      writable,
      checkable: false,
      checked: new Set<string>(),
    },
  });
}

// happy-dom 的元素尺寸都是 0：clientX < 0 落在左半（前面），否则算右半（后面）
const BEFORE = -1;
const AFTER = 1;

describe('MachineTabMembers', () => {
  it('reorders inside the tab by dropping before or after another tag', async () => {
    const wrapper = mountMembers();
    const chips = wrapper.findAll('.machine-sub-tab');
    chips[0]!.element.dispatchEvent(
      dragEvent('drop', { [TAB_MACHINE_DRAG]: 'C' }, BEFORE),
    );
    chips[1]!.element.dispatchEvent(
      dragEvent('drop', { [TAB_MACHINE_DRAG]: 'A' }, AFTER),
    );
    // 位置按去掉被拖机型后的列表算：C 到 A 前 → 0；A 到 B 后 → [B, C] 中的 1
    expect(wrapper.emitted('place')).toEqual([
      ['C', 0],
      ['A', 1],
    ]);
  });

  it('accepts machines dragged from the tree, on a tag or on the empty row', async () => {
    const wrapper = mountMembers();
    wrapper
      .findAll('.machine-sub-tab')[2]!
      .element.dispatchEvent(
        dragEvent('drop', { [TREE_ITEM_DRAG]: '新机型' }, BEFORE),
      );
    wrapper
      .get('.machine-tab-members')
      .element.dispatchEvent(dragEvent('drop', { [TREE_ITEM_DRAG]: '另一台' }));
    expect(wrapper.emitted('place')).toEqual([['新机型', 2], ['另一台']]);
  });

  it('ignores drops for read-only users and unrelated drags', async () => {
    const readOnly = mountMembers(false);
    readOnly
      .get('.machine-tab-members')
      .element.dispatchEvent(dragEvent('drop', { [TREE_ITEM_DRAG]: 'X' }));
    expect(readOnly.emitted('place')).toBeUndefined();
    expect(readOnly.get('.machine-sub-tab').attributes('draggable')).toBe('false');

    const writable = mountMembers();
    writable
      .get('.machine-tab-members')
      .element.dispatchEvent(dragEvent('drop', { 'text/plain': 'X' }));
    expect(writable.emitted('place')).toBeUndefined();
  });
});
