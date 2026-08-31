import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { ATokenField } from '@/ui';
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

  it('filters customer requirements by any of multiple selected sources', async () => {
    window.localStorage.clear();
    const wrapper = await mountPage(true);
    const selectionStore = useSelectionStore();
    const customerName = selectionStore.entityGroups('customer')[0]?.items[0];
    const type = selectionStore.dictionaryNames('customer-req')[0];
    const sources = selectionStore
      .dictionaryNames('customer-req-source')
      .slice(0, 3);

    expect(customerName).toBeDefined();
    expect(type).toBeDefined();
    expect(sources).toHaveLength(3);
    if (!customerName || !type || sources.length < 3) return;

    sources.forEach((source, index) => {
      expect(
        selectionStore.saveCrud('customer-req', customerName, {
          content: `多来源筛选记录-${index + 1}`,
          machine: 'ALL',
          note: '',
          process: '',
          source,
          type,
        }).ok,
      ).toBe(true);
    });
    await flushPromises();

    const sourceFilter = wrapper
      .findAllComponents(ATokenField)
      .find((item) => item.props('placeholder') === '要求来源');
    expect(sourceFilter).toBeDefined();
    sourceFilter!.vm.$emit('update:modelValue', sources.slice(0, 2));
    await flushPromises();

    expect(wrapper.text()).toContain('多来源筛选记录-1');
    expect(wrapper.text()).toContain('多来源筛选记录-2');
    expect(wrapper.text()).not.toContain('多来源筛选记录-3');
    wrapper.unmount();
  });

  it('supports multi-select filters across customer requirement, process, and feedback tabs', async () => {
    window.localStorage.clear();
    const wrapper = await mountPage(true);
    const selectionStore = useSelectionStore();
    const customerName = selectionStore.entityGroups('customer')[0]?.items[0];
    const requirementTypes = selectionStore.dictionaryNames('customer-req').slice(0, 3);
    const requirementSource = selectionStore.dictionaryNames('customer-req-source')[0];
    const processTypes = selectionStore.dictionaryNames('customer-proc').slice(0, 3);
    const feedbackTypes = selectionStore
      .dictionaryNames('customer-feedback')
      .slice(0, 3);
    const feedbackStatuses = selectionStore
      .dictionaryNames('customer-feedback-status')
      .slice(0, 3);

    expect(customerName).toBeDefined();
    expect(requirementTypes).toHaveLength(3);
    expect(requirementSource).toBeDefined();
    expect(processTypes).toHaveLength(3);
    expect(feedbackTypes).toHaveLength(3);
    expect(feedbackStatuses).toHaveLength(3);
    if (
      !customerName ||
      !requirementSource ||
      requirementTypes.length < 3 ||
      processTypes.length < 3 ||
      feedbackTypes.length < 3 ||
      feedbackStatuses.length < 3
    ) {
      return;
    }

    requirementTypes.forEach((type, index) => {
      expect(
        selectionStore.saveCrud('customer-req', customerName, {
          content: `要求分类多选-${index + 1}`,
          machine: 'ALL',
          note: '',
          process: '',
          source: requirementSource,
          type,
        }).ok,
      ).toBe(true);
    });
    processTypes.forEach((type, index) => {
      expect(
        selectionStore.saveCrud('customer-proc', customerName, {
          feature: '验证多选筛选',
          note: '',
          role: `制程分类多选-${index + 1}`,
          sensorNote: '',
          type,
        }).ok,
      ).toBe(true);
    });
    feedbackTypes.forEach((type, index) => {
      expect(
        selectionStore.saveCrud('customer-feedback', customerName, {
          date: '2026-08-27',
          machine: '测试机型',
          measure: '验证多选筛选',
          problem: `反馈筛选多选-${index + 1}`,
          status: feedbackStatuses[index],
          type,
        }).ok,
      ).toBe(true);
    });
    await flushPromises();

    const findTokenFilter = (placeholder: string) => {
      const filter = wrapper
        .findAllComponents(ATokenField)
        .find((item) => item.props('placeholder') === placeholder);
      expect(filter).toBeDefined();
      return filter!;
    };
    const clickTab = async (label: string) => {
      const tab = wrapper
        .findAll('button')
        .find((button) => button.text().trim() === label);
      expect(tab).toBeDefined();
      await tab!.trigger('click');
      await flushPromises();
    };

    findTokenFilter('要求分类').vm.$emit(
      'update:modelValue',
      requirementTypes.slice(0, 2),
    );
    await flushPromises();
    expect(wrapper.text()).toContain('要求分类多选-1');
    expect(wrapper.text()).toContain('要求分类多选-2');
    expect(wrapper.text()).not.toContain('要求分类多选-3');
    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(findTokenFilter('要求分类').props('modelValue')).toEqual([]);
    expect(wrapper.text()).toContain('要求分类多选-3');

    await clickTab('制程注意事项');
    findTokenFilter('制程分类').vm.$emit(
      'update:modelValue',
      processTypes.slice(0, 2),
    );
    await flushPromises();
    expect(wrapper.text()).toContain('制程分类多选-1');
    expect(wrapper.text()).toContain('制程分类多选-2');
    expect(wrapper.text()).not.toContain('制程分类多选-3');
    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(findTokenFilter('制程分类').props('modelValue')).toEqual([]);
    expect(wrapper.text()).toContain('制程分类多选-3');

    await clickTab('厂外反馈问题项');
    findTokenFilter('问题分类').vm.$emit(
      'update:modelValue',
      feedbackTypes.slice(0, 2),
    );
    findTokenFilter('处理状态').vm.$emit(
      'update:modelValue',
      feedbackStatuses.slice(0, 2),
    );
    await flushPromises();
    expect(wrapper.text()).toContain('反馈筛选多选-1');
    expect(wrapper.text()).toContain('反馈筛选多选-2');
    expect(wrapper.text()).not.toContain('反馈筛选多选-3');
    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(findTokenFilter('问题分类').props('modelValue')).toEqual([]);
    expect(findTokenFilter('处理状态').props('modelValue')).toEqual([]);
    expect(wrapper.text()).toContain('反馈筛选多选-3');

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
    const selectionStore = useSelectionStore();
    const feedback = selectionStore.crudItems('customer-feedback', '庆鼎')[0];
    expect(feedback).toBeDefined();
    selectionStore.saveCrud(
      'customer-feedback',
      '庆鼎',
      {
        ...feedback,
        date: '2026-08-25',
        measure: '调整吸附节拍并增加负压检测。',
      },
      feedback!.id,
    );
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
    expect(dialog?.textContent).toContain('调整吸附节拍并增加负压检测。');
    expect(dialog?.textContent).toContain('2024-10-15');
    expect(dialog?.textContent).toContain('现行');
    expect(dialog?.textContent).toContain('已作废');
    expect(dialog?.querySelectorAll('.feedback-history__cell--center')).toHaveLength(9);
    const obsoleteMeasure = dialog?.querySelector(
      '.feedback-history__measure--obsolete',
    );
    expect(obsoleteMeasure?.textContent).toContain('更换快速响应型真空表头后恢复稳定。');
    expect(dialog?.textContent).not.toContain('版本序号');
    expect(dialog?.textContent).not.toContain('作废原因');
    expect(dialog?.textContent).not.toContain('操作人');
    wrapper.unmount();
  });

  it('shows feedback statuses in workflow order with the requested colors', async () => {
    window.localStorage.clear();
    const wrapper = await mountPage(true);
    const selectionStore = useSelectionStore();
    const prefixedStatuses = [
      '01 待处理',
      '02 处理中',
      '03 测试中',
      '04 已解决',
    ];
    const statuses = selectionStore.dictionaryItems('customer-feedback-status');
    statuses.forEach((status, index) => {
      expect(
        selectionStore.saveDictionaryItem(
          'customer-feedback-status',
          { name: prefixedStatuses[index], sort: status.sort },
          status.id,
        ).ok,
      ).toBe(true);
    });
    expect(
      selectionStore
        .dictionaryItems('customer-feedback-status')
        .map(({ name, sort }) => ({ name, sort })),
    ).toEqual([
      { name: '01 待处理', sort: 1 },
      { name: '02 处理中', sort: 2 },
      { name: '03 测试中', sort: 3 },
      { name: '04 已解决', sort: 4 },
    ]);

    for (const status of prefixedStatuses) {
      expect(
        selectionStore.saveCrud('customer-feedback', '庆鼎', {
          date: '2026-08-27',
          machine: '测试机型',
          measure: '验证状态颜色',
          problem: `状态颜色-${status}`,
          status,
          type: '感应器异常',
        }).ok,
      ).toBe(true);
    }

    const tab = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === '厂外反馈问题项');
    expect(tab).toBeDefined();
    await tab!.trigger('click');
    await flushPromises();

    const tonesByStatus = Object.fromEntries(
      wrapper
        .findAll('.a-badge')
        .filter((badge) => prefixedStatuses.includes(badge.text()))
        .map((badge) => [badge.text(), badge.classes()]),
    );
    expect(tonesByStatus).toMatchObject({
      '01 待处理': expect.arrayContaining(['a-badge--neutral']),
      '02 处理中': expect.arrayContaining(['a-badge--orange']),
      '03 测试中': expect.arrayContaining(['a-badge--orange']),
      '04 已解决': expect.arrayContaining(['a-badge--green']),
    });
    wrapper.unmount();
  });
});
