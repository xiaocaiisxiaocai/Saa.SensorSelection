import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, type AuditLogItem } from '@/api';
import AuditLogPage from './AuditLogPage.vue';

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

    await wrapper.get('.a-table button').trigger('click');
    expect(document.body.textContent).toContain('操作详情');
    expect(document.body.textContent).toContain('日志编号');
    expect(document.body.textContent).toContain('操作编码');
    expect(document.body.textContent).toContain('auth.login');
    expect(document.body.textContent).toContain(
      '登录成功；账号：admin；显示名：管理员；角色：系统管理员；权限：selection:read、selection:write；组织：未分配',
    );
    expect(document.body.textContent).toContain('127.0.0.1');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('[aria-label="关闭"]')?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
    wrapper.unmount();
  });
});
