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

    expect(document.body.textContent).toContain('新增角色');
    // 描述占满整行
    expect(
      document.querySelector('#role-description')?.closest('.ant-col-24'),
    ).not.toBeNull();
    expect(document.body.textContent).toContain('已选 0 / 3');
    expect(document.body.textContent).toContain('查看业务数据');
    expect(document.body.textContent).toContain('查看系统管理');

    const group = [
      ...document.querySelectorAll('.permission-group__head'),
    ].find((node) => node.textContent?.includes('业务'));
    group?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
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
      [...document.querySelectorAll('.ant-form-item-explain-error')].map(
        (item) => item.textContent?.trim(),
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
        userCount: 1,
      },
    ]);
    await vi.waitFor(() => expect(wrapper.text()).toContain('系统管理员'));

    const reason = '系统内置角色，不可修改或删除';
    for (const label of ['编辑', '删除']) {
      const button = wrapper.get(`button[aria-label="${label}"]`);
      expect(button.attributes('disabled')).toBeDefined();
    }
    // 禁用原因放在 tooltip 里
    const titles = wrapper
      .findAllComponents({ name: 'ATooltip' })
      .map((tooltip) => tooltip.props('title'));
    expect(titles.filter((title) => title === reason)).toHaveLength(2);
    wrapper.unmount();
  });

  it('shows how many users hold a role and blocks deleting an assigned role', async () => {
    const role = (id: number, userCount: number): RbacRole => ({
      code: `role${id}`,
      createdAt: '2026-08-01T00:00:00.000Z',
      description: null,
      id,
      isSystem: false,
      name: `角色${id}`,
      permissions: [],
      userCount,
    });
    const wrapper = await mountPage([role(2, 3), role(3, 0)]);
    await vi.waitFor(() => expect(wrapper.text()).toContain('角色2'));

    expect(wrapper.text()).toContain('用户数');
    const remove = wrapper.findAll('button[aria-label="删除"]');
    expect(remove[0]?.attributes('disabled')).toBeDefined();
    expect(remove[1]?.attributes('disabled')).toBeUndefined();
    const titles = wrapper
      .findAllComponents({ name: 'ATooltip' })
      .map((tooltip) => tooltip.props('title'));
    expect(titles).toContain('已分配给 3 个用户，请先在用户管理里移除该角色');
    wrapper.unmount();
  });
});
