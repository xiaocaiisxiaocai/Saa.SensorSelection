import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, type RbacRole } from '@/api';
import { useAuthStore } from '@/stores/auth';
import RolePage from './RolePage.vue';

const permissions = [
  { id: 1, code: 'selection:read', name: '查看业务数据', module: '业务' },
  { id: 2, code: 'selection:write', name: '编辑业务数据', module: '业务' },
  { id: 3, code: 'rbac:view', name: '查看系统管理', module: '系统' },
];

async function mountPage(roles: RbacRole[] = []) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().applyProfile({
    displayName: '管理员',
    orgUnit: null,
    permissions: ['rbac:role:write'],
    roles: [{ code: 'admin', id: 1, name: '系统管理员' }],
    username: 'admin',
  });
  vi.spyOn(api, 'listRoles').mockResolvedValue(roles);
  vi.spyOn(api, 'listPermissions').mockResolvedValue(permissions);
  const wrapper = mount(RolePage, {
    attachTo: document.body,
    global: { plugins: [pinia] },
  });
  await vi.waitFor(() => {
    expect(api.listPermissions).toHaveBeenCalled();
  });
  await nextTick();
  return wrapper;
}

describe('RolePage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('opens a full-width description and grouped permissions', async () => {
    const wrapper = await mountPage();
    await wrapper.get('button').trigger('click');
    await nextTick();
    await nextTick();

    expect(document.body.textContent).toContain('新建角色');
    expect(document.querySelector('.a-form-row--wide')).not.toBeNull();
    expect(document.body.textContent).toContain('已选 0 / 3');
    expect(document.body.textContent).toContain('查看业务数据');
    expect(document.body.textContent).toContain('查看系统管理');

    const group = [
      ...document.querySelectorAll('.permission-group__head'),
    ].find((node) => node.textContent?.includes('业务'));
    group
      ?.querySelector('[role="checkbox"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(document.body.textContent).toContain('已选 2 / 3');
    wrapper.unmount();
  });

  it('shows field-level errors when required role fields are empty', async () => {
    const wrapper = await mountPage();
    await wrapper.get('button').trigger('click');
    await nextTick();

    const saveButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '保存',
    );
    saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(
      [...document.querySelectorAll('.a-form-row__error')].map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual(['请输入角色标识', '请输入角色名称']);
    wrapper.unmount();
  });

  it('keeps built-in role actions visible but explains why they are disabled', async () => {
    const wrapper = await mountPage([
      {
        code: 'admin',
        createdAt: '2026-08-01T00:00:00.000Z',
        description: '内置',
        id: 1,
        isSystem: true,
        name: '系统管理员',
        permissions: [],
      },
    ]);
    await vi.waitFor(() => expect(wrapper.text()).toContain('系统管理员'));

    const reason = '系统内置角色，不可修改或删除';
    for (const label of ['编辑', '删除']) {
      const button = document.querySelector(`[aria-label="${label}（${reason}）"]`);
      expect(button).toBeTruthy();
      expect(button?.getAttribute('aria-disabled')).toBe('true');
    }
    wrapper.unmount();
  });
});
