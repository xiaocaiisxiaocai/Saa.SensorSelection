import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, type RbacRole, type RbacUser } from '@/api';
import { useAuthStore } from '@/stores/auth';
import ASelect from '@/ui/ASelect.vue';
import UserPage from './UserPage.vue';

const roles: RbacRole[] = [
  {
    code: 'admin',
    createdAt: '2026-08-01T00:00:00.000Z',
    description: null,
    id: 1,
    isSystem: true,
    name: '系统管理员',
    permissions: [],
  },
  {
    code: 'editor',
    createdAt: '2026-08-01T00:00:00.000Z',
    description: null,
    id: 2,
    isSystem: false,
    name: '业务维护员',
    permissions: [],
  },
  {
    code: 'viewer',
    createdAt: '2026-08-01T00:00:00.000Z',
    description: null,
    id: 3,
    isSystem: false,
    name: '只读用户',
    permissions: [],
  },
];

const user: RbacUser = {
  createdAt: '2026-08-01T00:00:00.000Z',
  displayName: '张三',
  id: 2,
  isActive: true,
  orgUnit: null,
  roles: [{ code: 'viewer', id: 3, name: '只读用户' }],
  username: 'zhangsan',
};

async function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().applyProfile({
    displayName: '管理员',
    orgUnit: null,
    permissions: ['rbac:user:write'],
    roles: [{ code: 'admin', id: 1, name: '系统管理员' }],
    username: 'admin',
  });
  vi.spyOn(api, 'listUsers').mockResolvedValue([user]);
  vi.spyOn(api, 'listRoles').mockResolvedValue(roles);
  vi.spyOn(api, 'listOrgUnits').mockResolvedValue([]);
  vi.spyOn(api, 'updateUser').mockResolvedValue({
    ...user,
    roles: [{ code: 'editor', id: 2, name: '业务维护员' }],
  });

  const wrapper = mount(UserPage, {
    attachTo: document.body,
    global: { plugins: [pinia] },
  });
  await vi.waitFor(() => expect(wrapper.text()).toContain('zhangsan'));
  return wrapper;
}

describe('UserPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('binds only one role when editing a user', async () => {
    const wrapper = await mountPage();
    await wrapper.get('[aria-label="编辑"]').trigger('click');
    await nextTick();

    const roleSelect = wrapper.findComponent(ASelect);
    expect(roleSelect.exists()).toBe(true);
    expect(roleSelect.props('modelValue')).toBe(3);
    expect(roleSelect.props('placeholder')).toBe('请选择一个角色');

    await roleSelect.get('[role="combobox"]').trigger('click');
    await nextTick();
    const editorOption = [...document.querySelectorAll('[role="option"]')].find(
      (option) => option.textContent?.includes('业务维护员'),
    );
    editorOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    const saveButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '保存',
    );
    saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(api.updateUser).toHaveBeenCalled());

    expect(api.updateUser).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ roleIds: [2] }),
    );
    wrapper.unmount();
  });

  it('shows field-level errors when a new user is incomplete', async () => {
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
    ).toEqual(['请输入用户名', '密码至少 4 位', '请输入显示名']);
    wrapper.unmount();
  });
});
