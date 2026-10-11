import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ASegmentedControl from './ASegmentedControl.vue';

const segments = [
  { label: '要求', value: 'req' },
  { label: '制程', value: 'proc', badge: 3 },
  { label: '文档', value: 'docs' },
];

describe('ASegmentedControl', () => {
  it('renders the native segmented options, the selected item, and its badge', () => {
    const wrapper = mount(ASegmentedControl, {
      props: { ariaLabel: '客户资料分类', modelValue: 'proc', segments },
    });
    const items = wrapper.findAll('.ant-segmented-item');

    expect(wrapper.get('.a-segmented').attributes('aria-label')).toBe(
      '客户资料分类',
    );
    expect(items).toHaveLength(3);
    expect(items[0]?.classes()).not.toContain('ant-segmented-item-selected');
    expect(items[1]?.classes()).toContain('ant-segmented-item-selected');
    expect(items[1]?.text()).toContain('制程');
    expect(items[1]?.text()).toContain('3');
    expect(items[2]?.classes()).not.toContain('ant-segmented-item-selected');
  });

  it('emits the clicked segment', async () => {
    const wrapper = mount(ASegmentedControl, {
      props: { modelValue: 'req', segments },
    });
    const docs = wrapper
      .findAll('.ant-segmented-item')
      .find((item) => item.text().includes('文档'));

    await docs!.get('input').trigger('change');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['docs']);
  });

  it('stamps option ids from the id prop and exposes tab and panel ids', () => {
    const wrapper = mount(ASegmentedControl, {
      props: { id: 'demo-tabs', modelValue: 'proc', segments },
    });

    expect(wrapper.vm.tabId('proc')).toBe('demo-tabs-tab-proc');
    expect(wrapper.vm.panelId('docs')).toBe('demo-tabs-panel-docs');

    for (const segment of segments) {
      const tabId = `demo-tabs-tab-${segment.value}`;
      const owned = wrapper.get(`#${tabId}`);
      const item = wrapper
        .findAll('.ant-segmented-item')
        .find((node) => node.text().includes(segment.label));
      expect(item?.element.contains(owned.element)).toBe(true);
    }
  });

  it('keeps exposed ids aligned with the rendered options when no id is passed', () => {
    const wrapper = mount(ASegmentedControl, {
      props: { modelValue: 'req', segments },
    });

    for (const segment of segments) {
      const tabId = wrapper.vm.tabId(segment.value);
      expect(tabId.endsWith(`-tab-${segment.value}`)).toBe(true);
      expect(wrapper.vm.panelId(segment.value).endsWith(`-panel-${segment.value}`)).toBe(
        true,
      );
      expect(wrapper.find(`#${CSS.escape(tabId)}`).exists()).toBe(true);
    }
  });
});
