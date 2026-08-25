import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import { useAuthStore } from '@/stores/auth';
import CustomerPage from './CustomerPage.vue';

async function mountPage(authenticated = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/selection/customer', component: CustomerPage }],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  if (authenticated) {
    useAuthStore().applyProfile({
      displayName: '管理员',
      orgUnit: null,
      permissions: ['selection:write'],
      roles: [{ code: 'admin', id: 1, name: '系统管理员' }],
      username: 'admin',
    });
  }
  await router.push('/selection/customer');
  await router.isReady();
  return mount(CustomerPage, { global: { plugins: [pinia, router] } });
}

describe('CustomerPage', () => {
  it('shows the four customer tabs and a seeded customer', async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain('客户通用要求');
    expect(wrapper.text()).toContain('制程注意事项');
    expect(wrapper.text()).toContain('感应器选用标准');
    expect(wrapper.text()).toContain('厂外反馈问题项');
    expect(wrapper.text()).toMatch(/庆鼎|区域/);
    wrapper.unmount();
  });

  it('gives short fields less width and descriptive fields more width', async () => {
    const wrapper = await mountPage(true);
    const widths = Object.fromEntries(
      wrapper.findAll('th').map((header) => [
        header.text(),
        header.attributes('style'),
      ]),
    );

    expect(widths).toMatchObject({
      备注: 'width: 140px;',
      来源: 'width: 90px;',
      操作: 'width: 96px;',
      要求内容: 'width: 230px;',
      要求分类: 'width: 90px;',
      适用制程: 'width: 130px;',
      适用机型: 'width: 90px;',
    });
    wrapper.unmount();
  });

  it('prioritizes descriptive columns in process notes and feedback tables', async () => {
    const wrapper = await mountPage(true);
    const clickTab = async (label: string) => {
      const tab = wrapper
        .findAll('button')
        .find((button) => button.text().trim() === label);
      expect(tab).toBeDefined();
      await tab!.trigger('click');
    };
    const readWidths = () =>
      Object.fromEntries(
        wrapper.findAll('th').map((header) => [
          header.text(),
          header.attributes('style'),
        ]),
      );

    await clickTab('制程注意事项');
    expect(readWidths()).toMatchObject({
      备注: 'width: 130px;',
      操作: 'width: 96px;',
      制程作用: 'width: 150px;',
      制程分类: 'width: 90px;',
      制程特性: 'width: 150px;',
      sensor使用注意事项: 'width: 190px;',
    });

    await clickTab('厂外反馈问题项');
    expect(readWidths()).toMatchObject({
      反馈时间: 'width: 100px;',
      处理状态: 'width: 90px;',
      操作: 'width: 96px;',
      改善对策: 'width: 205px;',
      适用机型: 'width: 90px;',
      问题分类: 'width: 100px;',
      问题点: 'width: 205px;',
    });
    wrapper.unmount();
  });

  it('discards customer-specific panel state when switching customers', async () => {
    const wrapper = await mountPage(true);
    const search = wrapper
      .findAll('input')
      .find((input) => input.attributes('placeholder')?.startsWith('搜索分类'));
    expect(search).toBeDefined();
    await search!.setValue('庆鼎筛选');

    const addButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === '新增要求');
    expect(addButton).toBeDefined();
    await addButton!.trigger('click');
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    const nextCustomer = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === '健鼎');
    expect(nextCustomer).toBeDefined();
    await nextCustomer!.trigger('click');
    await flushPromises();

    const nextSearch = wrapper
      .findAll('input')
      .find((input) => input.attributes('placeholder')?.startsWith('搜索分类'));
    expect(nextSearch?.element.value).toBe('');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    wrapper.unmount();
  });

  it('shows countermeasure history without version, reason, or operator fields', async () => {
    const wrapper = await mountPage();
    const tab = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === '厂外反馈问题项');
    expect(tab).toBeDefined();
    await tab!.trigger('click');
    await flushPromises();

    const historyButton = wrapper.find('button[aria-label="查看改善对策历史"]');
    expect(historyButton.exists()).toBe(true);
    await historyButton.trigger('click');
    await flushPromises();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('改善对策历史');
    expect(dialog?.textContent).toContain('更换快速响应型真空表头后恢复稳定。');
    expect(dialog?.textContent).toContain('2024-10-15');
    expect(dialog?.textContent).toContain('现行');
    expect(dialog?.textContent).not.toContain('版本序号');
    expect(dialog?.textContent).not.toContain('作废原因');
    expect(dialog?.textContent).not.toContain('操作人');
    wrapper.unmount();
  });
});
