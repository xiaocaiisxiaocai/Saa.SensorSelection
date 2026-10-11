import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import APagination from './APagination.vue';

describe('APagination', () => {
  it('renders nothing when everything fits on one page', () => {
    const shorter = mount(APagination, {
      props: { page: 1, pageSize: 20, total: 12 },
    });
    const exact = mount(APagination, {
      props: { page: 1, pageSize: 20, total: 20 },
    });

    expect(shorter.find('nav').exists()).toBe(false);
    expect(exact.find('nav').exists()).toBe(false);
  });

  it('shows the total and marks the current page', () => {
    const wrapper = mount(APagination, {
      props: { page: 2, pageSize: 20, total: 80 },
    });

    expect(wrapper.get('nav').attributes('aria-label')).toBe('分页');
    expect(wrapper.text()).toContain('共 80 条');
    expect(wrapper.get('.ant-pagination-item-active').text()).toBe('2');
  });

  it('emits the requested page from the next button and a page item', async () => {
    const wrapper = mount(APagination, {
      props: { page: 1, pageSize: 20, total: 80 },
    });

    await wrapper.get('.ant-pagination-next').trigger('click');
    expect(wrapper.emitted('update:page')?.[0]).toEqual([2]);

    await wrapper.get('.ant-pagination-item-3').trigger('click');
    expect(wrapper.emitted('update:page')?.at(-1)).toEqual([3]);
  });

  it('emits the previous page', async () => {
    const wrapper = mount(APagination, {
      props: { page: 2, pageSize: 20, total: 80 },
    });

    await wrapper.get('.ant-pagination-prev').trigger('click');
    expect(wrapper.emitted('update:page')?.[0]).toEqual([1]);
  });

  it('disables the next button on the last page', async () => {
    const wrapper = mount(APagination, {
      props: { page: 4, pageSize: 20, total: 80 },
    });

    const next = wrapper.get('.ant-pagination-next');
    expect(next.classes()).toContain('ant-pagination-disabled');
    expect(next.attributes('aria-disabled')).toBe('true');
    expect((next.get('button').element as HTMLButtonElement).disabled).toBe(true);

    await next.trigger('click');
    expect(wrapper.emitted('update:page')).toBeUndefined();
  });

  it('disables the previous button on the first page', async () => {
    const wrapper = mount(APagination, {
      props: { page: 1, pageSize: 20, total: 80 },
    });

    const prev = wrapper.get('.ant-pagination-prev');
    expect(prev.classes()).toContain('ant-pagination-disabled');
    expect(prev.attributes('aria-disabled')).toBe('true');
    expect((prev.get('button').element as HTMLButtonElement).disabled).toBe(true);

    await prev.trigger('click');
    expect(wrapper.emitted('update:page')).toBeUndefined();
  });

  it('changes page size and clamps the current page to the new last page', async () => {
    const wrapper = mount(APagination, {
      props: { page: 4, pageSize: 20, total: 80 },
    });

    const select = wrapper.getComponent({ name: 'ASelect' });
    select.vm.$emit('change', '50');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('update:pageSize')?.[0]).toEqual([50]);
    expect(wrapper.emitted('update:page')?.at(-1)).toEqual([2]);
  });
});
