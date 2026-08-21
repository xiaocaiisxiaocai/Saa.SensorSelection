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

  it('does not go past the last page', async () => {
    const wrapper = mount(APagination, {
      props: { page: 4, pageSize: 20, total: 80 },
    });

    expect(
      wrapper.get('[aria-label="下一页"]').attributes('disabled'),
    ).toBeDefined();
  });
});
