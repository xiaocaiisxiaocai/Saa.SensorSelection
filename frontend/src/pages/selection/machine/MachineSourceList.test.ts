import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import type { EntityGroup } from '@/domain';
import MachineSourceList from './MachineSourceList.vue';

const groups: EntityGroup[] = [
  {
    name: '分类甲',
    items: ['直属机型一', '直属机型二'],
    configurations: [
      { name: '配置甲', items: ['配置机型一', '配置机型二'] },
      { name: '配置乙', items: ['配置机型三'] },
    ],
  },
  { name: '分类乙', items: ['乙机型'], configurations: [] },
];

const storageKey = 'apple-frontend:test-machine-source-list';

function mountList(
  props: Partial<{
    groups: EntityGroup[];
    selected: string;
    selectedKey: string;
    checkedItems: string[];
    editable: boolean;
    sortable: boolean;
    minWidth: number;
    maxWidth: number;
    defaultWidth: number;
  }> = {},
) {
  return mount(MachineSourceList, {
    attachTo: document.body,
    props: {
      groups,
      selected: '配置机型一',
      storageKey,
      editable: true,
      sortable: true,
      minWidth: 260,
      maxWidth: 400,
      defaultWidth: 260,
      ...props,
    },
  });
}

function dataTransfer() {
  return {
    dropEffect: 'none',
    effectAllowed: 'none',
    setData() {},
  };
}

describe('MachineSourceList', () => {
  afterEach(() => {
    localStorage.removeItem(storageKey);
    document.body.innerHTML = '';
  });

  it('supports persisted keyboard width adjustment', async () => {
    const wrapper = mountList();
    const resizer = wrapper.get('[role="separator"]');

    expect(resizer.attributes('aria-valuemin')).toBe('260');
    expect(resizer.attributes('aria-valuemax')).toBe('400');
    expect(resizer.attributes('aria-valuenow')).toBe('260');

    await resizer.trigger('keydown', { key: 'ArrowRight' });

    expect(wrapper.get('[role="separator"]').attributes('aria-valuenow')).toBe(
      '276',
    );
    expect(wrapper.get('aside').attributes('style')).toContain('width: 276px');
    expect(localStorage.getItem(storageKey)).toBe('276');
    wrapper.unmount();
  });

  it('quickly collapses and expands every category and configuration', async () => {
    const wrapper = mountList();

    expect(
      wrapper
        .get('.machine-source__search-row')
        .find('[aria-label="折叠全部分类"]')
        .exists(),
    ).toBe(true);
    expect(wrapper.text()).not.toContain('折叠全部');

    await wrapper.get('[aria-label="折叠全部分类"]').trigger('click');
    expect(wrapper.findAll('[aria-expanded="true"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-node-kind="configuration"]')).toHaveLength(0);

    await wrapper.get('[aria-label="展开全部分类"]').trigger('click');
    expect(wrapper.findAll('[aria-expanded="true"]')).toHaveLength(4);
    expect(wrapper.findAll('[data-node-kind="configuration"]')).toHaveLength(2);
    wrapper.unmount();
  });

  it('supports pointer dragging to widen and narrow the tree', async () => {
    const wrapper = mountList();
    const resizer = wrapper.get('[role="separator"]');

    await resizer.trigger('pointerdown', {
      button: 0,
      clientX: 260,
      pointerId: 1,
    });
    await resizer.trigger('pointermove', { clientX: 330, pointerId: 1 });
    await resizer.trigger('pointerup', { pointerId: 1 });

    expect(wrapper.get('aside').attributes('style')).toContain('width: 330px');
    expect(localStorage.getItem(storageKey)).toBe('330');

    await resizer.trigger('pointerdown', {
      button: 0,
      clientX: 330,
      pointerId: 2,
    });
    await resizer.trigger('pointermove', { clientX: 180, pointerId: 2 });
    await resizer.trigger('pointerup', { pointerId: 2 });

    expect(wrapper.get('aside').attributes('style')).toContain('width: 260px');
    expect(localStorage.getItem(storageKey)).toBe('260');
    wrapper.unmount();
  });

  it('shows drag handles only when sorting is authorized', () => {
    const hidden = mountList({ editable: false });
    expect(hidden.find('[aria-label="拖拽排序分类 分类甲"]').exists()).toBe(
      false,
    );
    hidden.unmount();

    const shown = mountList();
    expect(shown.find('[aria-label="拖拽排序分类 分类甲"]').exists()).toBe(
      true,
    );
    expect(shown.find('[aria-label="拖拽排序配置 配置甲"]').exists()).toBe(
      true,
    );
    expect(shown.find('[aria-label="拖拽排序机型 配置机型一"]').exists()).toBe(
      true,
    );
    shown.unmount();
  });

  it('keeps drag and row action affordances out of the normal tab sequence', () => {
    const wrapper = mountList();

    expect(
      wrapper
        .findAll('[aria-label^="拖拽排序"]')
        .every((handle) => handle.attributes('tabindex') === '-1'),
    ).toBe(true);
    expect(
      wrapper
        .findAll('.machine-tree-row--item .machine-tree-row__tools button')
        .every((button) => button.attributes('tabindex') === '-1'),
    ).toBe(true);
    expect(
      wrapper.findAll('[data-node-kind="item"][tabindex="0"]'),
    ).toHaveLength(1);
    wrapper.unmount();
  });

  it('supports selecting and checking a machine from its keyboard row', async () => {
    const wrapper = mountList({ checkedItems: [] });
    const row = wrapper.get(
      '[data-node-kind="item"][data-category="分类甲"][data-configuration="配置甲"][data-item="配置机型一"]',
    );

    await row.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('select')?.at(-1)).toEqual([
      {
        category: '分类甲',
        configuration: '配置甲',
        item: '配置机型一',
      },
    ]);

    await row.trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('toggleCheck')?.at(-1)).toEqual([
      {
        category: '分类甲',
        configuration: '配置甲',
        item: '配置机型一',
        checked: true,
      },
    ]);
    wrapper.unmount();
  });

  it('reorders sibling machines with Alt plus arrow keys', async () => {
    const wrapper = mountList();
    const row = wrapper.get(
      '[data-node-kind="item"][data-category="分类甲"][data-configuration="配置甲"][data-item="配置机型一"]',
    );

    await row.trigger('keydown', { key: 'ArrowDown', altKey: true });
    expect(wrapper.emitted('reorderItems')?.at(-1)).toEqual([
      {
        category: '分类甲',
        configuration: '配置甲',
        oldIndex: 0,
        newIndex: 1,
      },
    ]);
    wrapper.unmount();
  });

  it('emits exact source and target indexes for every hierarchy level', async () => {
    const wrapper = mountList();
    const transfer = dataTransfer();

    await wrapper
      .get('[aria-label="拖拽排序分类 分类甲"]')
      .trigger('dragstart', { dataTransfer: transfer });
    await wrapper
      .get('[data-node-kind="group"][data-category="分类乙"]')
      .trigger('drop', { dataTransfer: transfer });
    expect(wrapper.emitted('reorderGroups')?.[0]).toEqual([
      { oldIndex: 0, newIndex: 1 },
    ]);

    await wrapper
      .get('[aria-label="拖拽排序配置 配置甲"]')
      .trigger('dragstart', { dataTransfer: transfer });
    await wrapper
      .get(
        '[data-node-kind="configuration"][data-category="分类甲"][data-configuration="配置乙"]',
      )
      .trigger('drop', { dataTransfer: transfer });
    expect(wrapper.emitted('reorderConfigurations')?.[0]).toEqual([
      { category: '分类甲', oldIndex: 0, newIndex: 1 },
    ]);

    await wrapper
      .get('[aria-label="拖拽排序机型 配置机型一"]')
      .trigger('dragstart', { dataTransfer: transfer });
    await wrapper
      .get(
        '[data-node-kind="item"][data-category="分类甲"][data-configuration="配置甲"][data-item="配置机型二"]',
      )
      .trigger('drop', { dataTransfer: transfer });
    expect(wrapper.emitted('reorderItems')?.[0]).toEqual([
      {
        category: '分类甲',
        configuration: '配置甲',
        oldIndex: 0,
        newIndex: 1,
      },
    ]);
    wrapper.unmount();
  });

  it('keeps equal machine names in different configurations independently checked', async () => {
    const duplicateGroups: EntityGroup[] = [
      {
        name: '分类甲',
        items: [],
        configurations: [
          { name: '配置甲', items: ['同名机型'] },
          { name: '配置乙', items: ['同名机型'] },
        ],
      },
    ];
    const firstKey = JSON.stringify(['分类甲', '配置甲', '同名机型']);
    const wrapper = mountList({
      groups: duplicateGroups,
      selected: '同名机型',
      selectedKey: firstKey,
      checkedItems: [firstKey],
    });
    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    const duplicateRows = wrapper.findAll('[data-item="同名机型"]');

    expect(
      checkboxes.map(
        (checkbox) => (checkbox.element as HTMLInputElement).checked,
      ),
    ).toEqual([true, false]);
    expect(duplicateRows.map((row) => row.classes('is-selected'))).toEqual([
      true,
      false,
    ]);

    await checkboxes[1]?.setValue(true);
    expect(wrapper.emitted('toggleCheck')?.at(-1)).toEqual([
      {
        category: '分类甲',
        configuration: '配置乙',
        item: '同名机型',
        checked: true,
      },
    ]);
    wrapper.unmount();
  });
});
