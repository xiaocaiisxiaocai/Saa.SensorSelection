import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/api';
import { toast } from '@/ui/toast';
import LoginPage from './LoginPage.vue';

async function mountLogin() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: LoginPage },
      { path: '/selection/customer', component: { template: '<div />' } },
    ],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  await router.push('/login');
  await router.isReady();
  return mount(LoginPage, {
    global: {
      plugins: [pinia, router],
    },
  });
}

describe('LoginPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    toast.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('warns when username or password is empty', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const wrapper = await mountLogin();
    await wrapper.get('form').trigger('submit');
    expect(warning).toHaveBeenCalledWith('请输入用户名和密码');
    wrapper.unmount();
  });

  it('clears a leftover token when entering as a guest', async () => {
    window.localStorage.setItem('symtek_token', 'stale');
    vi.spyOn(api, 'me').mockRejectedValue(
      new (await import('@/api')).ApiError('unauthorized', '登录已失效'),
    );
    const getStore = vi.spyOn(api, 'getStore').mockResolvedValue({});
    const replaceAll = vi.spyOn(api, 'replaceAll').mockResolvedValue(undefined);
    vi.spyOn(api, 'putKey').mockResolvedValue(undefined);
    vi.spyOn(api, 'putEntityGroups').mockResolvedValue(undefined);
    const wrapper = await mountLogin();
    await wrapper.get('.login__guest-link').trigger('click');
    await vi.waitFor(() => {
      expect(window.localStorage.getItem('symtek_token')).toBeNull();
      expect(getStore).toHaveBeenCalled();
      expect(replaceAll).toHaveBeenCalled();
    });
    wrapper.unmount();
  });
});
