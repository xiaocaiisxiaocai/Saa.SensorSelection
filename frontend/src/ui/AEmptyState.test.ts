import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AEmptyState from './AEmptyState.vue';

describe('AEmptyState', () => {
  it('uses the title as the description when no description is given', () => {
    const wrapper = mount(AEmptyState, {
      props: { title: '暂无客户' },
    });

    expect(wrapper.classes()).toContain('a-empty-state');
    expect(wrapper.get('.ant-empty-description').text()).toBe('暂无客户');
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('renders the title and description together', () => {
    const wrapper = mount(AEmptyState, {
      props: {
        title: '暂无客户',
        description: '新建后会出现在这里。',
      },
    });

    const description = wrapper.get('.ant-empty-description');
    expect(description.text()).toContain('暂无客户');
    expect(description.text()).toContain('新建后会出现在这里。');
    expect(description.findAll('div').map((node) => node.text())).toEqual([
      '暂无客户',
      '新建后会出现在这里。',
    ]);
  });

  it('renders the action slot', () => {
    const wrapper = mount(AEmptyState, {
      props: { title: '暂无数据' },
      slots: { action: '<button type="button">新建</button>' },
    });

    expect(wrapper.get('.ant-empty-footer button').text()).toBe('新建');
  });
});
