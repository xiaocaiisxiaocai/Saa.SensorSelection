import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { TAB_MACHINE_DRAG, TREE_ITEM_DRAG } from './entity-drag';
import EntityTreeNode from './EntityTreeNode.vue';
import type { EntityNode } from './entity-tree-data';

function dropEvent(data: Record<string, string>, clientY = 0) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientY: { value: clientY },
    dataTransfer: {
      value: {
        getData: (kind: string) => data[kind] ?? '',
        types: Object.keys(data),
      },
    },
  });
  return event;
}

const node = (kind: EntityNode['kind']): EntityNode => ({
  key: kind,
  title: kind === 'item' ? '02 机型' : '输送机构',
  kind,
  category: '输送机构',
  configuration: null,
  item: kind === 'item' ? '02 机型' : undefined,
  selectable: kind === 'item',
  checkable: kind === 'item',
});

function mountNode(kind: EntityNode['kind'], acceptsDrop = true) {
  return mount(EntityTreeNode, {
    props: { node: node(kind), editable: true, actions: [], acceptsDrop },
  });
}

describe('EntityTreeNode drops from machine tabs', () => {
  it('puts a machine into a group, or before / after a machine', () => {
    const group = mountNode('group');
    group.element.dispatchEvent(dropEvent({ [TAB_MACHINE_DRAG]: 'X' }));
    expect(group.emitted('externalDrop')).toEqual([['X', 'inside']]);

    // happy-dom 尺寸为 0：clientY < 0 是上半（前面），否则下半（后面）
    const item = mountNode('item');
    item.element.dispatchEvent(dropEvent({ [TAB_MACHINE_DRAG]: 'X' }, -1));
    item.element.dispatchEvent(dropEvent({ [TAB_MACHINE_DRAG]: 'Y' }, 1));
    expect(item.emitted('externalDrop')).toEqual([
      ['X', 'before'],
      ['Y', 'after'],
    ]);
  });

  it('leaves drags that started in the tree to the tree itself', () => {
    const item = mountNode('item');
    item.element.dispatchEvent(dropEvent({ [TREE_ITEM_DRAG]: 'X' }));
    expect(item.emitted('externalDrop')).toBeUndefined();

    const readOnly = mountNode('group', false);
    readOnly.element.dispatchEvent(dropEvent({ [TAB_MACHINE_DRAG]: 'X' }));
    expect(readOnly.emitted('externalDrop')).toBeUndefined();
  });
});
