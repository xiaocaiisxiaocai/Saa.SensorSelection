import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, type AuditLogItem } from '@/api';
import { chooseColumnFilter, findColumn } from '@/test-helpers';
import AuditLogPage from './AuditLogPage.vue';
import { ACTION_LABELS } from './audit/audit-actions';

const here = dirname(fileURLToPath(import.meta.url));
const auditCss = readFileSync(join(here, 'AuditLogPage.css'), 'utf8');

const log: AuditLogItem = {
  action: 'auth.login',
  detail:
    '登录成功；账号：admin；显示名：管理员；角色：系统管理员；权限：selection:read、selection:write；组织：未分配',
  error: null,
  id: 1,
  ip: '127.0.0.1',
  result: true,
  target: 'admin',
  timestamp: '2026-08-24T09:21:25.000Z',
  username: 'admin',
};

describe('AuditLogPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('opens full audit details from a compact view button', async () => {
    vi.spyOn(api, 'listAuditLogs').mockResolvedValue({
      items: [log],
      total: 1,
    });
    const wrapper = mount(AuditLogPage, { attachTo: document.body });

    await vi.waitFor(() => {
      expect(wrapper.find('.ant-table-wrapper').text()).toContain('查看');
    });

    // 点行内的「查看」，不要取到工具栏上的按钮。
    const detailButton = wrapper
      .findAll('.ant-table-tbody button')
      .find((button) => button.text() === '查看');
    expect(detailButton).toBeDefined();
    await detailButton!.trigger('click');
    expect(document.body.textContent).toContain('操作详情');
    expect(document.body.textContent).toContain('日志编号');
    expect(document.body.textContent).toContain('操作编码');
    expect(document.body.textContent).toContain('auth.login');
    // 业务详情现在拆成标签-值行，不再是原样的一长串（见下面的解析用例）
    expect(document.body.textContent).toContain('登录成功');
    expect(document.body.textContent).toContain('管理员');
    expect(document.body.textContent).toContain('未分配');
    expect(document.body.textContent).toContain('127.0.0.1');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '关闭')
      ?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('.ant-modal-title')).toBeNull();
    });
    wrapper.unmount();
  });

  it('clears all audit filters and reloads the first page', async () => {
    const listAuditLogs = vi
      .spyOn(api, 'listAuditLogs')
      .mockResolvedValue({ items: [log], total: 1 });
    const wrapper = mount(AuditLogPage);
    await vi.waitFor(() => expect(listAuditLogs).toHaveBeenCalled());

    await wrapper.get('input[placeholder="操作用户"]').setValue('admin');
    await chooseColumnFilter(wrapper, '操作', ['auth.login']);
    await chooseColumnFilter(wrapper, '结果', ['true']);
    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');

    await vi.waitFor(() => {
      expect(listAuditLogs).toHaveBeenLastCalledWith({
        action: undefined,
        from: undefined,
        page: 1,
        pageSize: 20,
        result: undefined,
        to: undefined,
        username: undefined,
      });
    });
    expect(
      wrapper.get<HTMLInputElement>('input[placeholder="操作用户"]').element
        .value,
    ).toBe('');
    expect(findColumn(wrapper, '操作').column.filteredValue).toBeNull();
    expect(findColumn(wrapper, '结果').column.filteredValue).toBeNull();
    wrapper.unmount();
  });

  it('uses a compact deterministic desktop toolbar and a narrow-screen layout', () => {
    expect(auditCss).toMatch(
      /\.audit-toolbar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:/s,
    );
    expect(auditCss).toMatch(
      /@media \(width <= 60rem\)[\s\S]*\.audit-toolbar\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s,
    );
  });

  it('has a Chinese label for every audit action the backend can write', () => {
    // 少一条就会在表格里直接显示原始操作码（如 store.entity-groups.reorder），
    // 又长又要折行。后端新增操作码时这里必须同步。
    const backendActions = [
      'auth.change-password',
      'auth.login',
      'org.create',
      'org.delete',
      'org.update',
      'role.create',
      'role.delete',
      'role.update',
      'store.delete',
      'store.entity-groups.reorder',
      'store.replace-all',
      'store.upsert',
      'user.create',
      'user.delete',
      'user.reset-password',
      'user.update',
    ];
    const missing = backendActions.filter(
      (action) => !(action in ACTION_LABELS),
    );
    expect(missing).toEqual([]);
  });

  it('breaks the business detail into labelled rows instead of one long run-on', async () => {
    vi.spyOn(api, 'listAuditLogs').mockResolvedValue({
      items: [log],
      total: 1,
    });
    const wrapper = mount(AuditLogPage, { attachTo: document.body });
    await vi.waitFor(() => {
      expect(wrapper.find('.ant-table-wrapper').text()).toContain('查看');
    });
    const detailButton = wrapper
      .findAll('.ant-table-tbody button')
      .find((button) => button.text() === '查看');
    await detailButton!.trigger('click');

    const labels = [
      ...document.querySelectorAll(
        '.audit-detail__pairs .ant-descriptions-item-label',
      ),
    ].map((node) => node.textContent?.trim());
    expect(labels).toEqual(['账号', '显示名', '角色', '权限', '组织']);
    expect(
      document.querySelector('.audit-detail__summary')?.textContent?.trim(),
    ).toBe('登录成功');
    // 顿号分隔的权限列表拆成标签，而不是挤成一行
    const tags = [
      ...document.querySelectorAll('.audit-detail__pairs .ant-tag'),
    ].map((node) => node.textContent?.trim());
    expect(tags).toContain('selection:read');
    expect(tags).toContain('selection:write');

    wrapper.unmount();
  });

  it('falls back to plain text for details that are not key-value pairs', async () => {
    // 后端的 detail 是自由文本，格式不止一种；认不出来的整体按原文显示，
    // 不能硬拆成七零八落的行。
    vi.spyOn(api, 'listAuditLogs').mockResolvedValue({
      items: [{ ...log, detail: '密码修改成功' }],
      total: 1,
    });
    const wrapper = mount(AuditLogPage, { attachTo: document.body });
    await vi.waitFor(() => {
      expect(wrapper.find('.ant-table-wrapper').text()).toContain('查看');
    });
    const detailButton = wrapper
      .findAll('.ant-table-tbody button')
      .find((button) => button.text() === '查看');
    await detailButton!.trigger('click');

    expect(document.querySelectorAll('.audit-detail__pair')).toHaveLength(0);
    expect(document.body.textContent).toContain('密码修改成功');

    wrapper.unmount();
  });

  it('filters as soon as a filter changes, without a separate apply button', async () => {
    const listAuditLogs = vi
      .spyOn(api, 'listAuditLogs')
      .mockResolvedValue({ items: [log], total: 1 });
    const wrapper = mount(AuditLogPage);
    await vi.waitFor(() => expect(listAuditLogs).toHaveBeenCalledTimes(1));

    expect(
      wrapper.findAll('button').some((button) => button.text() === '筛选'),
    ).toBe(false);

    await wrapper.get('input[placeholder="操作用户"]').setValue('admin');
    await chooseColumnFilter(wrapper, '操作', ['auth.login']);

    await vi.waitFor(() => {
      expect(listAuditLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'auth.login',
          page: 1,
          username: 'admin',
        }),
      );
    });
    // 防抖合并成一次请求，不是每个改动各发一次
    expect(listAuditLogs).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('puts action and result filters in the column header', () => {
    vi.spyOn(api, 'listAuditLogs').mockResolvedValue({ items: [], total: 0 });
    const wrapper = mount(AuditLogPage);
    const action = findColumn(wrapper, '操作').column;
    const result = findColumn(wrapper, '结果').column;

    expect(action.filterMultiple).toBe(false);
    expect(action.filterSearch).toBe(true);
    expect(action.filteredValue).toBeNull();
    expect(
      (action.filters as Array<{ text: string }>).map((item) => item.text),
    ).not.toContain('全部操作');
    expect(result.filterMultiple).toBe(false);
    expect(result.filterSearch).toBeUndefined();
    expect(result.filteredValue).toBeNull();
    expect(wrapper.find('[aria-label="操作类型筛选"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="操作结果筛选"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows a readable target and the failure reason instead of an empty column', async () => {
    vi.spyOn(api, 'listAuditLogs').mockResolvedValue({
      items: [
        {
          ...log,
          action: 'store.delete',
          error: 'key 不存在',
          result: false,
          target: 'machine-section-rows:1002:E2E机型',
        },
      ],
      total: 1,
    });
    const wrapper = mount(AuditLogPage, { attachTo: document.body });
    await vi.waitFor(() => {
      expect(wrapper.find('.audit-target').exists()).toBe(true);
    });

    expect(wrapper.get('.audit-target').text()).toBe('机型选型 · E2E机型');
    expect(wrapper.get('.audit-target').attributes('title')).toBe(
      'machine-section-rows:1002:E2E机型',
    );
    expect(wrapper.get('.audit-target__error').text()).toBe('key 不存在');
    const headers = wrapper.findAll('th').map((th) => th.text());
    expect(headers).not.toContain('说明');

    const detailButton = wrapper
      .findAll('.ant-table-tbody button')
      .find((button) => button.text() === '查看');
    await detailButton!.trigger('click');
    // 详情里仍保留原始 key 供排查
    expect(document.body.textContent).toContain('目标键');
    expect(document.body.textContent).toContain(
      'machine-section-rows:1002:E2E机型',
    );
    wrapper.unmount();
  });

  it('ignores a stale response that arrives after a newer request', async () => {
    type Page = { items: AuditLogItem[]; total: number };
    let resolveFirst!: (value: Page) => void;
    let resolveSecond!: (value: Page) => void;
    const listAuditLogs = vi
      .spyOn(api, 'listAuditLogs')
      .mockImplementationOnce(
        () =>
          new Promise<Page>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Page>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const wrapper = mount(AuditLogPage);
    await vi.waitFor(() => expect(listAuditLogs).toHaveBeenCalledTimes(1));

    await chooseColumnFilter(wrapper, '操作', ['auth.login']);
    await vi.waitFor(() => expect(listAuditLogs).toHaveBeenCalledTimes(2));
    const table = () => wrapper.getComponent({ name: 'ATable' });

    // 旧请求先回来：不能落到表格上，也不能提前关掉 loading。
    resolveFirst({
      items: [{ ...log, id: 90, username: 'stale-user' }],
      total: 1,
    });
    await flushPromises();
    expect(table().props('loading')).toBe(true);
    expect(wrapper.text()).not.toContain('stale-user');

    resolveSecond({
      items: [{ ...log, id: 91, username: 'fresh-user' }],
      total: 1,
    });
    await vi.waitFor(() => expect(wrapper.text()).toContain('fresh-user'));
    expect(table().props('loading')).toBe(false);
    expect(wrapper.text()).not.toContain('stale-user');
    wrapper.unmount();
  });
});
