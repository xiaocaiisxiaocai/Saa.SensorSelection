import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import APagination from './APagination.vue';

describe('APagination', () => {
  it('renders nothing when everything fits on one page', () => {
    const wrapper = mount(APagination, {
      props: { page: 1, pageSize: 20, total: 12 },
    });

    expect(wrapper.find('nav').exists()).toBe(false);
  });

  it('shows the total and marks the current page', () => {
    const wrapper = mount(APagination, {
      props: { page: 2, pageSize: 20, total: 80 },
    });

    expect(wrapper.text()).toContain('共 80 条');
    expect(wrapper.get('[aria-current="page"]').text()).toBe('2');
  });

  it('emits the next page', async () => {
    const wrapper = mount(APagination, {
      props: { page: 1, pageSize: 20, total: 80 },
    });

    await wrapper.get('[aria-label="下一页"]').trigger('click');

    expect(wrapper.emitted('update:page')?.[0]).toEqual([2]);
  });

  it('does not go past the last page, and says why it is disabled', () => {
    const wrapper = mount(APagination, {
      props: { page: 4, pageSize: 20, total: 80 },
    });

    // 禁用态要把原因说清楚，不能只留一个通用的「下一页」标签。
    const next = wrapper.get('[aria-label="已经是最后一页"]');
    expect(next.attributes('disabled')).toBeDefined();
    expect(wrapper.find('[aria-label="下一页"]').exists()).toBe(false);
  });

  it('explains the disabled previous button on the first page', () => {
    const wrapper = mount(APagination, {
      props: { page: 1, pageSize: 20, total: 80 },
    });

    expect(
      wrapper.get('[aria-label="已经是第一页"]').attributes('disabled'),
    ).toBeDefined();
  });
});
