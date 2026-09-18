import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/api';
import { SEED_VERSION } from '@/domain';
import { useThemeStore } from '@/stores/theme';
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
    vi.spyOn(api, 'getStore').mockResolvedValue({
      'meta:seed-version': [{ version: SEED_VERSION }],
    });
    vi.spyOn(api, 'putKey').mockResolvedValue([]);
    vi.spyOn(api, 'putEntityGroups').mockResolvedValue(undefined);
    vi.spyOn(api, 'replaceAll').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders brand headings and footer', async () => {
    const wrapper = await mountLogin();
    expect(wrapper.find('.login__title').text()).toBe('感应器选型系统');
    expect(wrapper.find('.login__subtitle').text()).toBe(
      'Symtek Automation China',
    );
    expect(wrapper.find('.login-layout__footer').text()).toContain(
      'Symtek Automation China',
    );
    wrapper.unmount();
  });

  it('hides clear buttons from the credential fields', async () => {
    const wrapper = await mountLogin();
    const inputs = wrapper.findAll('input');

    await inputs[0].setValue('admin');
    await inputs[0].trigger('focus');
    expect(wrapper.find('[aria-label="清除"]').exists()).toBe(false);

    await inputs[1].setValue('secret');
    await inputs[1].trigger('focus');
    expect(wrapper.find('[aria-label="清除"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="显示密码"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows inline errors when username or password is empty, without a redundant toast', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const wrapper = await mountLogin();
    await wrapper.get('form').trigger('submit');
    // 字段旁边的红字已经说明白了，不需要再弹一条措辞不同的 Toast。
    expect(warning).not.toHaveBeenCalled();
    expect(
      wrapper.findAll('.a-form-row__error').map((item) => item.text()),
    ).toEqual(['请输入用户名', '请输入密码']);

    await wrapper.findAll('input')[0].setValue('admin');
    expect(
      wrapper.findAll('.a-form-row__error').map((item) => item.text()),
    ).toEqual(['请输入密码']);
    wrapper.unmount();
  });

  it('shows only the password error when username is provided', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const wrapper = await mountLogin();
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('admin');
    await wrapper.get('form').trigger('submit');
    expect(warning).not.toHaveBeenCalled();
    expect(
      wrapper.findAll('.a-form-row__error').map((item) => item.text()),
    ).toEqual(['请输入密码']);
    wrapper.unmount();
  });

  it('shows only the username error when password is provided', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const wrapper = await mountLogin();
    const inputs = wrapper.findAll('input');
    await inputs[1].setValue('admin123');
    await wrapper.get('form').trigger('submit');
    expect(warning).not.toHaveBeenCalled();
    expect(
      wrapper.findAll('.a-form-row__error').map((item) => item.text()),
    ).toEqual(['请输入用户名']);
    wrapper.unmount();
  });

  it('keeps a persistent inline error for wrong credentials instead of a fading toast', async () => {
    vi.spyOn(api, 'login').mockRejectedValue(new Error('用户名或密码错误'));
    const wrapper = await mountLogin();
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('admin');
    await inputs[1].setValue('wrong');
    await wrapper.get('form').trigger('submit');
    await vi.waitFor(() => {
      expect(wrapper.find('.login__error').exists()).toBe(true);
    });
    expect(wrapper.find('.login__error').text()).toBe('用户名或密码错误');
    // 密码框被清空后不该显示“请输入密码”，那会盖掉真正的失败原因。
    expect(wrapper.findAll('.a-form-row__error')).toHaveLength(0);
    wrapper.unmount();
  });

  it('switches theme preference from the top-right switcher', async () => {
    const wrapper = await mountLogin();
    const themeStore = useThemeStore();
    const darkBtn = wrapper.find('button[aria-label="深色"]');
    expect(darkBtn.exists()).toBe(true);

    await darkBtn.trigger('click');
    expect(themeStore.preference).toBe('dark');
    wrapper.unmount();
  });

  it('clears a leftover token when entering as a guest', async () => {
    window.localStorage.setItem('symtek_token', 'stale');
    vi.spyOn(api, 'me').mockRejectedValue(
      new (await import('@/api')).ApiError('unauthorized', '登录已失效'),
    );
    const getStore = vi.spyOn(api, 'getStore').mockResolvedValue({});
    const replaceAll = vi.spyOn(api, 'replaceAll').mockResolvedValue(undefined);
    vi.spyOn(api, 'putKey').mockResolvedValue([]);
    vi.spyOn(api, 'putEntityGroups').mockResolvedValue(undefined);
    const wrapper = await mountLogin();
    await wrapper.get('.login__guest-link').trigger('click');
    await vi.waitFor(() => {
      expect(window.localStorage.getItem('symtek_token')).toBeNull();
      expect(getStore).toHaveBeenCalled();
      expect(replaceAll).not.toHaveBeenCalled();
    });
    wrapper.unmount();
  });

  it('preloads data and only announces login success once it is ready', async () => {
    let resolveStore!: (store: Record<string, unknown[]>) => void;
    const getStore = vi.spyOn(api, 'getStore').mockImplementation(
      () =>
        new Promise<Record<string, unknown[]>>((resolve) => {
          resolveStore = resolve;
        }),
    );
    vi.spyOn(api, 'login').mockResolvedValue({
      displayName: '管理员',
      expiresAt: '2099-01-01T00:00:00Z',
      orgUnit: null,
      permissions: ['selection:read', 'selection:write'],
      roles: [{ code: 'admin', id: 1, name: '系统管理员' }],
      token: 'test-token',
      username: 'admin',
    });
    vi.spyOn(api, 'putKey').mockResolvedValue([]);
    vi.spyOn(api, 'putEntityGroups').mockResolvedValue(undefined);
    vi.spyOn(api, 'replaceAll').mockResolvedValue(undefined);
    const success = vi.spyOn(toast, 'success');
    const wrapper = await mountLogin();

    await vi.waitFor(() => expect(getStore).toHaveBeenCalledTimes(1));
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('admin');
    await inputs[1].setValue('admin123');
    await wrapper.get('form').trigger('submit');
    expect(success).not.toHaveBeenCalledWith('登录成功');

    resolveStore({ 'meta:seed-version': [{ version: SEED_VERSION }] });
    await vi.waitFor(() => {
      expect(success).toHaveBeenCalledWith('登录成功');
    });
    expect(getStore).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('explains why the user landed back on the login page after being revoked', async () => {
    // 账号被停用/删除后，后端会逐请求拒绝，用户是「做着做着被踢出来」的。
    // 不给原因的话，他只会看到自己突然回到登录页，完全不知道发生了什么。
    window.localStorage.setItem('symtek_token', 'stale-token');
    vi.spyOn(api, 'me').mockRejectedValue(
      new (await import('@/api')).ApiError('unauthorized', '账号已停用或已删除'),
    );

    const wrapper = await mountLogin();
    await vi.waitFor(() => {
      expect(wrapper.find('.login__error').exists()).toBe(true);
    });
    expect(wrapper.get('.login__error').text()).toContain('登录已失效');
    wrapper.unmount();
  });
});
