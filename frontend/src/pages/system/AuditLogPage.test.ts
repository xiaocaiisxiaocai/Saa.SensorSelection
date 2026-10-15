import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  api,
  type AuditLogItem,
  type AuditOperationItem,
  type AuditOperationPage,
} from '@/api';
import { chooseColumnFilter, findColumn } from '@/test-helpers';
import AuditLogPage from './AuditLogPage.vue';
import { ACTION_LABELS } from './audit/audit-actions';

const here = dirname(fileURLToPath(import.meta.url));
const auditCss = readFileSync(join(here, 'AuditLogPage.css'), 'utf8');

const loginEntry: AuditLogItem = {
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

function operation(
  entries: AuditLogItem[],
  overrides: Partial<AuditOperationItem> = {},
): AuditOperationItem {
  return {
    displayName: '管理员',
    entries,
    entryCount: entries.length,
    ip: '127.0.0.1',
    label: null,
    operationId: `admin:${entries[0]?.id ?? 0}`,
    result: entries.every((entry) => entry.result),
    timestamp: entries.at(-1)?.timestamp ?? '2026-08-24T09:21:25.000Z',
    username: 'admin',
    ...overrides,
  };
}

const editEntry: AuditLogItem = {
  ...loginEntry,
  action: 'store.upsert',
  detail: '数据类型：数组；记录数：2',
  id: 2,
  target: 'customer-req:鹏鼎集团/华东',
  changes: JSON.stringify({
    added: [],
    removed: [],
    modified: [
      {
        label: '01 sensor标准',
        fields: [
          { name: 'content', before: '旧要求', after: '新要求' },
          { name: 'source', before: '02 厂外改善', after: '03 客户要求' },
        ],
      },
    ],
    addedCount: 0,
    removedCount: 0,
    modifiedCount: 1,
    reordered: false,
    truncated: false,
  }),
};

function page(items: AuditOperationItem[]): AuditOperationPage {
  return { items, total: items.length };
}

function mountPage(
  kinds: string[] = ['auth.login', 'file.upload', '上传文件', '删除机型'],
) {
  vi.spyOn(api, 'listAuditOperationKinds').mockResolvedValue(kinds);
  return mount(AuditLogPage, {
    attachTo: document.body,
    global: { plugins: [createPinia()] },
  });
}

describe('AuditLogPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('lists one row per operation with what changed, and the user display name', async () => {
    vi.spyOn(api, 'listAuditOperations').mockResolvedValue(
      page([
        operation([editEntry], {
          label: '编辑客户通用要求 · 鹏鼎集团/华东',
        }),
      ]),
    );
    const wrapper = mountPage();
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('编辑客户通用要求'),
    );

    const row = wrapper.get('.ant-table-tbody tr.ant-table-row');
    expect(row.text()).toContain('管理员');
    expect(row.text()).toContain('客户通用要求 · 鹏鼎集团/华东');
    expect(row.text()).toContain('修改「01 sensor标准」：要求内容、来源');
    const headers = wrapper.findAll('th').map((th) => th.text());
    expect(headers).toEqual(
      expect.arrayContaining([
        '时间',
        '用户',
        '操作',
        '对象',
        '变更摘要',
        '结果',
      ]),
    );
    // IP 和「查看」按钮不再占列：点整行看详情
    expect(headers).not.toContain('IP');
    expect(headers).not.toContain('详情');
    wrapper.unmount();
  });

  it('opens a drawer with every field before and after when a row is clicked', async () => {
    vi.spyOn(api, 'listAuditOperations').mockResolvedValue(
      page([operation([editEntry], { label: '编辑客户通用要求' })]),
    );
    const wrapper = mountPage();
    await vi.waitFor(() =>
      expect(wrapper.find('.ant-table-tbody tr.ant-table-row').exists()).toBe(
        true,
      ),
    );
    await wrapper.get('.ant-table-tbody tr.ant-table-row').trigger('click');
    await flushPromises();

    const drawer = document.querySelector('.ant-drawer')!;
    expect(drawer.textContent).toContain('编辑客户通用要求');
    const fields = [...drawer.querySelectorAll('.audit-diff dt')].map((node) =>
      node.textContent?.trim(),
    );
    expect(fields).toEqual(['要求内容', '来源']);
    expect(drawer.querySelector('.audit-diff__before')?.textContent).toBe(
      '旧要求',
    );
    expect(drawer.querySelector('.audit-diff__after')?.textContent).toBe(
      '新要求',
    );
    // 目标被翻成中文时仍给出原始数据键
    expect(drawer.textContent).toContain('customer-req:鹏鼎集团/华东');
    expect(drawer.textContent).toContain('127.0.0.1');
    wrapper.unmount();
  });

  it('breaks a login detail into labelled rows with permission names', async () => {
    vi.spyOn(api, 'listAuditOperations').mockResolvedValue(
      page([operation([loginEntry])]),
    );
    const wrapper = mountPage();
    await vi.waitFor(() => expect(wrapper.text()).toContain('登录成功'));
    await wrapper.get('.ant-table-tbody tr.ant-table-row').trigger('click');
    await flushPromises();

    const drawer = document.querySelector('.ant-drawer')!;
    const labels = [...drawer.querySelectorAll('.audit-diff dt')].map((node) =>
      node.textContent?.trim(),
    );
    expect(labels).toEqual(['账号', '显示名', '角色', '权限', '组织']);
    const tags = [...drawer.querySelectorAll('.audit-diff .ant-tag')].map(
      (node) => node.textContent?.trim(),
    );
    expect(tags).toEqual(['查看业务数据', '编辑业务数据']);
    wrapper.unmount();
  });

  it('groups the writes of one operation and lists them when expanded', async () => {
    const entries: AuditLogItem[] = [
      {
        ...loginEntry,
        action: 'store.delete',
        detail: '删除目标：machine-section-rows:1:04 特殊定位',
        id: 10,
        target: 'machine-section-rows:1:04 特殊定位',
      },
      {
        ...loginEntry,
        action: 'store.entity-groups.reorder',
        detail: '数据类型：数组；分类数：12',
        id: 11,
        target: 'entity-groups:machine',
      },
    ];
    vi.spyOn(api, 'listAuditOperations').mockResolvedValue(
      page([operation(entries, { label: '删除机型「04 特殊定位」' })]),
    );
    const wrapper = mountPage();
    await vi.waitFor(() => expect(wrapper.text()).toContain('2 条记录'));

    const row = wrapper.get('.ant-table-tbody tr.ant-table-row');
    expect(row.text()).toContain('删除机型「04 特殊定位」');
    expect(row.text()).toContain('机型选型 · 04 特殊定位 等 2 项');
    await row.get('.ant-table-row-expand-icon').trigger('click');
    await flushPromises();
    const expanded = wrapper.get('.audit-entries').text();
    expect(expanded).toContain('删除数据 · 机型选型 · 04 特殊定位');
    expect(expanded).toContain('调整分类顺序 · 机型分类');
    wrapper.unmount();
  });

  it('shows the failure reason in the summary', async () => {
    vi.spyOn(api, 'listAuditOperations').mockResolvedValue(
      page([
        operation([
          {
            ...loginEntry,
            action: 'store.delete',
            error: 'key 不存在',
            result: false,
            target: 'machine-section-rows:1002:E2E机型',
          },
        ]),
      ]),
    );
    const wrapper = mountPage();
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('失败：key 不存在'),
    );
    expect(wrapper.get('.audit-text--error').text()).toBe('失败：key 不存在');
    wrapper.unmount();
  });

  it('filters as soon as a filter changes and resets everything at once', async () => {
    const list = vi
      .spyOn(api, 'listAuditOperations')
      .mockResolvedValue(page([operation([loginEntry])]));
    const wrapper = mountPage();
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(
      wrapper.findAll('button').some((button) => button.text() === '筛选'),
    ).toBe(false);

    await wrapper.get('input[aria-label="搜索操作日志"]').setValue('鹏鼎');
    await vi.waitFor(() =>
      expect(findColumn(wrapper, '操作').column.filters).toHaveLength(3),
    );
    await chooseColumnFilter(wrapper, '操作', ['上传文件', '删除机型']);
    await wrapper.get('.audit-toolbar input[type="checkbox"]').setValue(true);
    await vi.waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          // 「上传文件」既是 file.upload 的中文名，也是带名称的操作类型：两者都查
          kinds: ['删除机型', 'file.upload', '上传文件'],
          hideLogin: true,
          keyword: '鹏鼎',
          page: 1,
        }),
      ),
    );
    // 防抖合并成一次请求，不是每个改动各发一次
    expect(list).toHaveBeenCalledTimes(2);

    await chooseColumnFilter(wrapper, '结果', ['false']);
    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');
    await vi.waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        from: undefined,
        hideLogin: false,
        keyword: undefined,
        kinds: [],
        page: 1,
        pageSize: 20,
        result: undefined,
        to: undefined,
      }),
    );
    expect(findColumn(wrapper, '操作').column.filteredValue).toBeNull();
    expect(findColumn(wrapper, '结果').column.filteredValue).toBeNull();
    wrapper.unmount();
  });

  it('offers the operation kinds that appear in the log, named like the column', async () => {
    vi.spyOn(api, 'listAuditOperations').mockResolvedValue(page([]));
    const wrapper = mountPage();
    await vi.waitFor(() =>
      expect(findColumn(wrapper, '操作').column.filters).toHaveLength(3),
    );
    const texts = (
      findColumn(wrapper, '操作').column.filters as Array<{ text: string }>
    ).map((item) => item.text);
    // 操作码翻成中文，和带名称的同名类型合成一项，不出现原始操作码
    expect(texts).toEqual(
      expect.arrayContaining(['登录', '上传文件', '删除机型']),
    );
    expect(texts.some((text) => text.includes('.'))).toBe(false);
    wrapper.unmount();
  });

  it('puts multi-select action and single result filters in the column header', () => {
    vi.spyOn(api, 'listAuditOperations').mockResolvedValue(page([]));
    const wrapper = mountPage();
    const action = findColumn(wrapper, '操作').column;
    const result = findColumn(wrapper, '结果').column;

    expect(action.filterMultiple).toBe(true);
    expect(action.filterSearch).toBe(true);
    expect(action.filteredValue).toBeNull();
    expect(result.filterMultiple).toBe(false);
    expect(result.filteredValue).toBeNull();
    wrapper.unmount();
  });

  it('keeps the date range at a fixed width on desktop and lets it fill narrow screens', () => {
    expect(auditCss).toMatch(
      /^\.audit-toolbar__date\s*\{[^}]*flex:\s*0 0 auto;[^}]*width:\s*16rem;/m,
    );
    expect(auditCss).toMatch(
      /@media \(width <= 60rem\)[\s\S]*\.audit-toolbar__date\s*\{[^}]*flex:\s*1 1 16rem;/s,
    );
  });

  it('has a Chinese label for every audit action the backend can write', () => {
    // 少一条就会在表格里直接显示原始操作码（如 store.entity-groups.reorder）。
    // 后端新增操作码时这里必须同步。
    const backendActions = [
      'auth.change-password',
      'auth.login',
      'file.download',
      'file.upload',
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

  it('ignores a stale response that arrives after a newer request', async () => {
    let resolveFirst!: (value: AuditOperationPage) => void;
    let resolveSecond!: (value: AuditOperationPage) => void;
    const list = vi
      .spyOn(api, 'listAuditOperations')
      .mockImplementationOnce(
        () =>
          new Promise<AuditOperationPage>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<AuditOperationPage>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const wrapper = mountPage();
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    await vi.waitFor(() =>
      expect(findColumn(wrapper, '操作').column.filters).toHaveLength(3),
    );
    await chooseColumnFilter(wrapper, '操作', ['登录']);
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    const table = () => wrapper.getComponent({ name: 'ATable' });

    // 旧请求先回来：不能落到表格上，也不能提前关掉 loading。
    resolveFirst(
      page([operation([loginEntry], { displayName: 'stale-user' })]),
    );
    await flushPromises();
    expect(table().props('loading')).toBe(true);
    expect(wrapper.text()).not.toContain('stale-user');

    resolveSecond(
      page([operation([loginEntry], { displayName: 'fresh-user' })]),
    );
    await vi.waitFor(() => expect(wrapper.text()).toContain('fresh-user'));
    expect(table().props('loading')).toBe(false);
    expect(wrapper.text()).not.toContain('stale-user');
    wrapper.unmount();
  });
});
