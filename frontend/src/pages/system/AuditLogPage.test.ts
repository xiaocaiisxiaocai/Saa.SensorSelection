import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, type AuditLogItem } from '@/api';
import ASelect from '@/ui/ASelect.vue';
import AuditLogPage from './AuditLogPage.vue';

const auditSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'AuditLogPage.vue'),
  'utf8',
);

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
    vi.spyOn(api, 'listAuditLogs').mockResolvedValue({ items: [log], total: 1 });
    const wrapper = mount(AuditLogPage, { attachTo: document.body });

    await vi.waitFor(() => {
      expect(wrapper.find('.a-table').text()).toContain('查看');
    });

    // 表头现在也有排序按钮，必须精确点到行内的「查看」，不能取第一个 button。
    const detailButton = wrapper
      .findAll('.a-table tbody button')
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

    document.querySelector<HTMLButtonElement>('[aria-label="关闭"]')?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeNull();
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
    const selects = wrapper.findAllComponents(ASelect);
    selects[0]?.vm.$emit('update:modelValue', 'auth.login');
    selects[1]?.vm.$emit('update:modelValue', 'true');
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
    expect(wrapper.get<HTMLInputElement>('input[placeholder="操作用户"]').element.value).toBe('');
    expect(selects[0]?.props('modelValue')).toBe('');
    expect(selects[1]?.props('modelValue')).toBe('');
    wrapper.unmount();
  });

  it('uses a compact deterministic desktop toolbar and a narrow-screen layout', () => {
    expect(auditSource).toMatch(
      /\.audit-toolbar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:/s,
    );
    expect(auditSource).toMatch(
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
      (action) => !auditSource.includes(`'${action}': '`),
    );
    expect(missing).toEqual([]);
  });

  it('breaks the business detail into labelled rows instead of one long run-on', async () => {
    vi.spyOn(api, 'listAuditLogs').mockResolvedValue({ items: [log], total: 1 });
    const wrapper = mount(AuditLogPage, { attachTo: document.body });
    await vi.waitFor(() => {
      expect(wrapper.find('.a-table').text()).toContain('查看');
    });
    const detailButton = wrapper
      .findAll('.a-table tbody button')
      .find((button) => button.text() === '查看');
    await detailButton!.trigger('click');

    const labels = [...document.querySelectorAll('.audit-detail__pair dt')].map(
      (node) => node.textContent?.trim(),
    );
    expect(labels).toEqual(['账号', '显示名', '角色', '权限', '组织']);
    expect(document.querySelector('.audit-detail__summary')?.textContent?.trim()).toBe(
      '登录成功',
    );
    // 顿号分隔的权限列表拆成标签，而不是挤成一行
    const tags = [...document.querySelectorAll('.audit-detail__tag')].map(
      (node) => node.textContent?.trim(),
    );
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
      expect(wrapper.find('.a-table').text()).toContain('查看');
    });
    const detailButton = wrapper
      .findAll('.a-table tbody button')
      .find((button) => button.text() === '查看');
    await detailButton!.trigger('click');

    expect(document.querySelectorAll('.audit-detail__pair')).toHaveLength(0);
    expect(document.body.textContent).toContain('密码修改成功');

    wrapper.unmount();
  });
});
