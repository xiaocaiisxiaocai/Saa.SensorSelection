import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { dialogs } from '@/pages/shared/confirm';
import {
  chooseSelect,
  clickTab,
  clickTreeNode,
  columnWidths,
  findButton,
  findSelect,
  tabCount,
  tagColor,
} from '@/test-helpers';
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
    expect(wrapper.get('h1.visually-hidden').text()).toBe('客户管理');
    expect(wrapper.text()).toContain('客户通用要求');
    expect(wrapper.text()).toContain('制程注意事项');
    expect(wrapper.text()).toContain('感应器选用标准');
    expect(wrapper.text()).toContain('厂外反馈问题项');
    expect(wrapper.text()).toMatch(/庆鼎|区域/);
    wrapper.unmount();
  });

  it('keeps the selected customer available to assistive tech and shows per-tab counts', async () => {
    const wrapper = await mountPage();
    const store = useSelectionStore();
    const group = store.entityGroups('customer')[0]!;
    const item = group.items[0]!;
    const category = group.name;

    const heading = wrapper.get('.selection-panel > h2');
    expect(heading.classes()).toContain('visually-hidden');
    expect(heading.text()).toContain(item);
    expect(heading.text()).toContain(category);
    expect(tabCount(wrapper, '客户通用要求')).toBe(
      String(store.crudItems('customer-req', item).length),
    );
    wrapper.unmount();
  });

  it('asks before discarding unsaved input in the sidebar create region dialog', async () => {
    const wrapper = await mountPage(true);
    // EntitySource 的“新建/编辑区域”弹窗必须带未保存确认，否则 Esc/点
    // 遮罩会静默丢弃输入（回归自一次真实缺口：这个共享侧栏组件
    // 之前完全没接未保存确认）。
    const confirm = vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    await wrapper.get('button[aria-label="新建区域"]').trigger('click');
    await flushPromises();
    const input = document.querySelector<HTMLInputElement>(
      '#entity-source-name input, input#entity-source-name',
    );
    expect(input).not.toBeNull();
    input!.value = '新区域';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();

    const cancel = [...document.querySelectorAll('.ant-modal button')].find(
      (button) => button.textContent?.trim() === '取消',
    ) as HTMLButtonElement;
    cancel.click();
    await flushPromises();
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: '放弃未保存的修改？' }),
    );
    // 用户选择继续编辑，弹窗保持打开
    expect(
      document.querySelector('.ant-modal-wrap')?.getAttribute('style') ?? '',
    ).not.toContain('display: none');
    confirm.mockRestore();
    wrapper.unmount();
  });

  it('switches the panel content with each customer tab', async () => {
    const wrapper = await mountPage(true);
    const expected = [
      ['客户通用要求', '新增要求'],
      ['制程注意事项', '新增'],
      ['感应器选用标准', '点击或将文件拖到此处上传'],
      ['厂外反馈问题项', '问题点'],
    ] as const;
    for (const [label, content] of expected) {
      await clickTab(wrapper, label);
      expect(wrapper.get('.ant-tabs-tab-active').text()).toContain(label);
      const panel = wrapper.get('.ant-tabs-tabpane-active');
      expect(panel.attributes('role')).toBe('tabpanel');
      expect(panel.text()).toContain(content);
    }
    wrapper.unmount();
  });

  it('gives short fields less width and descriptive fields more width', async () => {
    const wrapper = await mountPage(true);
    const widths = columnWidths(wrapper);

    expect(widths['备注']).toBe(140);
    expect(widths['来源']).toBe(108);
    expect(widths['操作']).toBe(96);
    expect(widths['要求内容']).toBe(230);
    expect(widths['要求分类']).toBe(136);
    expect(widths['适用制程']).toBe(130);
    expect(widths['适用机型']).toBe(90);
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

    await chooseSelect(wrapper, '要求来源', sources.slice(0, 2));

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
    const requirementTypes = selectionStore
      .dictionaryNames('customer-req')
      .slice(0, 3);
    const requirementSource = selectionStore.dictionaryNames(
      'customer-req-source',
    )[0];
    const processTypes = selectionStore
      .dictionaryNames('customer-proc')
      .slice(0, 3);
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

    await chooseSelect(wrapper, '要求分类', requirementTypes.slice(0, 2));
    expect(wrapper.text()).toContain('要求分类多选-1');
    expect(wrapper.text()).toContain('要求分类多选-2');
    expect(wrapper.text()).not.toContain('要求分类多选-3');
    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(findSelect(wrapper, '要求分类').props('value')).toEqual([]);
    expect(wrapper.text()).toContain('要求分类多选-3');

    await clickTab(wrapper, '制程注意事项');
    await chooseSelect(wrapper, '制程分类', processTypes.slice(0, 2));
    expect(wrapper.text()).toContain('制程分类多选-1');
    expect(wrapper.text()).toContain('制程分类多选-2');
    expect(wrapper.text()).not.toContain('制程分类多选-3');
    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(findSelect(wrapper, '制程分类').props('value')).toEqual([]);
    expect(wrapper.text()).toContain('制程分类多选-3');

    await clickTab(wrapper, '厂外反馈问题项');
    chooseSelect(wrapper, '问题分类', feedbackTypes.slice(0, 2));
    await chooseSelect(wrapper, '处理状态', feedbackStatuses.slice(0, 2));
    expect(wrapper.text()).toContain('反馈筛选多选-1');
    expect(wrapper.text()).toContain('反馈筛选多选-2');
    expect(wrapper.text()).not.toContain('反馈筛选多选-3');
    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(findSelect(wrapper, '问题分类').props('value')).toEqual([]);
    expect(findSelect(wrapper, '处理状态').props('value')).toEqual([]);
    expect(wrapper.text()).toContain('反馈筛选多选-3');

    wrapper.unmount();
  });

  it('prioritizes descriptive columns in process notes and feedback tables', async () => {
    const wrapper = await mountPage(true);
    const readWidths = () => columnWidths(wrapper);

    await clickTab(wrapper, '制程注意事项');
    const processWidths = readWidths();
    expect(processWidths['备注']).toBe(130);
    expect(processWidths['操作']).toBe(96);
    expect(processWidths['制程作用']).toBe(150);
    expect(processWidths['制程分类']).toBe(104);
    expect(processWidths['制程特性']).toBe(150);
    expect(processWidths['sensor使用注意事项']).toBe(190);

    await clickTab(wrapper, '厂外反馈问题项');
    const feedbackWidths = readWidths();
    expect(feedbackWidths['反馈时间']).toBe(120);
    expect(feedbackWidths['处理状态']).toBe(90);
    expect(feedbackWidths['操作']).toBe(96);
    expect(feedbackWidths['改善对策']).toBe(205);
    expect(feedbackWidths['适用机型']).toBe(90);
    expect(feedbackWidths['问题分类']).toBe(168);
    expect(feedbackWidths['问题点']).toBe(205);
    wrapper.unmount();
  });

  it('discards customer-specific panel state when switching customers', async () => {
    const wrapper = await mountPage(true);
    const search = wrapper
      .findAll('input')
      .find((input) => input.attributes('placeholder')?.startsWith('搜索分类'));
    expect(search).toBeDefined();
    await search!.setValue('庆鼎筛选');

    const addButton = findButton(wrapper, '新增要求');
    expect(addButton).toBeDefined();
    await addButton!.trigger('click');
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    await clickTreeNode(wrapper, '健鼎');

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
    await clickTab(wrapper, '厂外反馈问题项');

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
    // 2 条历史（现行 + 已作废）× 3 列
    expect(
      dialog?.querySelectorAll('.feedback-history__table tbody td'),
    ).toHaveLength(6);
    const obsoleteMeasure = dialog?.querySelector(
      '.feedback-history__table del',
    );
    expect(obsoleteMeasure?.textContent).toContain(
      '更换快速响应型真空表头后恢复稳定。',
    );
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

    await clickTab(wrapper, '厂外反馈问题项');

    const colorsByStatus = Object.fromEntries(
      wrapper
        .findAll('.ant-tag')
        .filter((tag) => prefixedStatuses.includes(tag.text()))
        .map((tag) => [tag.text(), tagColor(tag.element)]),
    );
    expect(colorsByStatus).toEqual({
      '01 待处理': 'default',
      '02 处理中': 'orange',
      '03 测试中': 'orange',
      '04 已解决': 'green',
    });
    wrapper.unmount();
  });
});
