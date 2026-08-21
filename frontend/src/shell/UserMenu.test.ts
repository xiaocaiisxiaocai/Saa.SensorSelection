import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/ui/toast';
import UserMenu from './UserMenu.vue';

async function mountMenu() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/login', component: { template: '<div />' } },
      { path: '/selection/customer', component: { template: '<div />' } },
    ],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.applyProfile({
    displayName: '管理员',
    orgUnit: null,
    permissions: ['rbac:user:write'],
    roles: [{ code: 'admin', id: 1, name: '系统管理员' }],
    username: 'admin',
  });
  await router.push('/');
  await router.isReady();
  return mount(UserMenu, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  });
}

function fill(placeholder: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[placeholder="${placeholder}"]`,
  );
  expect(input).not.toBeNull();
  input!.value = value;
  input!.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('UserMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    toast.clear();
  });

  it('lets the signed-in user open change-password from the chip menu', async () => {
    const wrapper = await mountMenu();
    await wrapper.get('.user-chip--menu').trigger('click');
    await nextTick();
    expect(document.body.textContent).toContain('修改密码');
    expect(document.body.textContent).toContain('退出登录');
    wrapper.unmount();
  });

  it('saves a new password through the auth endpoint', async () => {
    const changePassword = vi.spyOn(api, 'changePassword').mockResolvedValue();
    const success = vi.spyOn(toast, 'success');
    const wrapper = await mountMenu();
    await wrapper.get('.user-chip--menu').trigger('click');
    await nextTick();
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((node) =>
      node.textContent?.includes('修改密码'),
    );
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    await nextTick();

    fill('请输入当前密码', 'admin123');
    fill('至少 4 位', 'admin456');
    fill('再次输入新密码', 'admin456');

    const save = [...document.querySelectorAll('button')].find(
      (node) => node.textContent?.trim() === '保存',
    );
    save?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith('admin123', 'admin456');
      expect(success).toHaveBeenCalledWith('密码已修改');
    });
    wrapper.unmount();
  });
});
