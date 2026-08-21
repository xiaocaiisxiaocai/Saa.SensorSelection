import { Inbox } from 'lucide-vue-next';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AEmptyState from './AEmptyState.vue';

describe('AEmptyState', () => {
  it('renders a centered title and optional description', () => {
    const wrapper = mount(AEmptyState, {
      props: {
        title: '暂无客户',
        description: '新建后会出现在这里。',
      },
    });

    expect(wrapper.text()).toContain('暂无客户');
    expect(wrapper.text()).toContain('新建后会出现在这里。');
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('renders the action slot', () => {
    const wrapper = mount(AEmptyState, {
      props: { title: '暂无数据', icon: Inbox },
      slots: { action: '<button type="button">新建</button>' },
    });

    expect(wrapper.get('button').text()).toBe('新建');
  });
});
