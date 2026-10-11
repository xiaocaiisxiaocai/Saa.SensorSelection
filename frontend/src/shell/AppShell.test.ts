import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import type { BackendSyncStatus } from '@/domain/types';
import AppShell from './AppShell.vue';

async function mountShell(backendStatus?: BackendSyncStatus) {
  localStorage.removeItem('symtek:sidebar-collapsed');

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/selection/customer', component: { template: '<div />' } },
      { path: '/selection/process', component: { template: '<div />' } },
      { path: '/selection/machine', component: { template: '<div />' } },
      { path: '/selection/sensor', component: { template: '<div />' } },
      { path: '/selection/dictionary', component: { template: '<div />' } },
      { path: '/selection/search', component: { template: '<div />' } },
    ],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore(pinia).applyProfile(null);
  const selection = useSelectionStore(pinia);
  if (backendStatus) {
    selection.backendStatus = backendStatus;
  }
  vi.spyOn(selection, 'ensureBackendInit').mockResolvedValue();

  await router.push('/selection/customer');
  await router.isReady();
  const wrapper = mount(AppShell, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router],
      stubs: {
        UserMenu: { template: '<div />' },
      },
    },
    slots: { default: '<div />' },
  });
  await nextTick();
  return { router, wrapper };
}

describe('AppShell', () => {
  afterEach(() => {
    localStorage.removeItem('symtek:sidebar-collapsed');
    document.body.innerHTML = '';
  });

  it('offers a keyboard skip link that targets the main content', async () => {
    const { wrapper } = await mountShell();
    const skipLink = wrapper.get('a.skip-link');
    const main = wrapper.get('main');

    expect(skipLink.text()).toBe('跳到主要内容');
    expect(skipLink.attributes('href')).toBe('#main-content');
    expect(main.attributes('id')).toBe('main-content');
    expect(main.attributes('tabindex')).toBe('-1');

    wrapper.unmount();
  });

  it('submits global search when the desktop input receives Enter', async () => {
    const { router, wrapper } = await mountShell();
    const input = wrapper.get('input[aria-label="全局搜索"]');

    await input.setValue('E3Z-D61');
    input.element.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
      }),
    );
    await vi.waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe(
        '/selection/search?q=E3Z-D61',
      );
    });

    wrapper.unmount();
  });

  it('updates the desktop sidebar toggle label and expanded state', async () => {
    // 宽屏桌面：两个断点都不命中（happy-dom 默认视口 1024px 会命中中等断点）
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => true,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const { wrapper } = await mountShell();
    const toggle = () => wrapper.get('[aria-controls="app-sidebar"]');

    expect(toggle().attributes('aria-expanded')).toBe('true');
    expect(toggle().attributes('aria-label')).toBe('折叠侧栏');

    await toggle().trigger('click');

    expect(toggle().attributes('aria-expanded')).toBe('false');
    expect(toggle().attributes('aria-label')).toBe('展开侧栏');
    expect(localStorage.getItem('symtek:sidebar-collapsed')).toBe('1');
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('uses an off-canvas navigation drawer on compact viewports', async () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mediaQueries: string[] = [];
    vi.stubGlobal('matchMedia', (query: string) => {
      mediaQueries.push(query);
      return {
        matches: query.includes('960px'),
        media: query,
        onchange: null,
        addEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => listeners.add(listener),
        removeEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => listeners.delete(listener),
        dispatchEvent: () => true,
        addListener: vi.fn(),
        removeListener: vi.fn(),
      };
    });

    const { wrapper } = await mountShell();
    const toggle = () => wrapper.get('[aria-controls="app-sidebar"]');

    expect(mediaQueries).toContain('(width <= 960px)');
    // 窄屏不渲染常驻侧栏，导航放进 a-drawer
    expect(wrapper.find('.app-shell__sider').exists()).toBe(false);
    expect(toggle().attributes('aria-expanded')).toBe('false');
    expect(document.querySelector('.ant-drawer-open')).toBeNull();

    await toggle().trigger('click');
    expect(toggle().attributes('aria-expanded')).toBe('true');
    await vi.waitFor(() =>
      expect(document.querySelector('.ant-drawer-open')).not.toBeNull(),
    );
    expect(
      document.querySelector('.ant-drawer [aria-label="主导航"]'),
    ).not.toBeNull();

    (document.querySelector('.ant-drawer-mask') as HTMLElement).click();
    await nextTick();
    expect(toggle().attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('collapses to an icon rail on medium viewports without overwriting the wide-screen preference', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('1200px'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => true,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));

    const { wrapper } = await mountShell();
    const toggle = () => wrapper.get('[aria-controls="app-sidebar"]');

    const sider = () => wrapper.get('.app-shell__sider');
    expect(sider().classes()).toContain('ant-layout-sider-collapsed');
    expect(toggle().attributes('aria-expanded')).toBe('false');

    await toggle().trigger('click');
    expect(sider().classes()).not.toContain('ant-layout-sider-collapsed');
    expect(toggle().attributes('aria-expanded')).toBe('true');
    // 中等宽度下的临时展开不写回宽屏偏好
    expect(localStorage.getItem('symtek:sidebar-collapsed')).toBeNull();

    await toggle().trigger('click');
    expect(sider().classes()).toContain('ant-layout-sider-collapsed');
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('focuses search only with the platform search shortcut', async () => {
    const platform = vi.spyOn(navigator, 'platform', 'get');
    platform.mockReturnValue('Win32');
    const { wrapper } = await mountShell();
    const input = document.getElementById('global-search-input');
    const press = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        cancelable: true,
        ...init,
      });
      window.dispatchEvent(event);
      return event;
    };

    expect(press({ ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(
      false,
    );
    expect(press({ metaKey: true }).defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input);
    expect(press({ ctrlKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);

    // macOS 输入框里 Ctrl+K 是系统的「删除到行尾」，不能被抢走
    (document.activeElement as HTMLElement).blur();
    platform.mockReturnValue('MacIntel');
    expect(press({ ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press({ metaKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);

    wrapper.unmount();
    platform.mockRestore();
  });

  it('keeps the page mounted while reconnecting after a successful first load', async () => {
    const { wrapper } = await mountShell('connecting');
    expect(wrapper.find('.app-shell__loading').exists()).toBe(true);

    const selection = useSelectionStore();
    selection.hasConnected = true;
    await nextTick();

    expect(wrapper.find('.app-shell__loading').exists()).toBe(false);
    wrapper.unmount();
  });

  it('clearly reports backend unavailability instead of showing local demo data', async () => {
    const { wrapper } = await mountShell('offline');

    expect(wrapper.text()).toContain('无法连接后端服务');
    expect(wrapper.text()).toContain('未加载演示数据');
    expect(wrapper.text()).toContain('重新连接');

    wrapper.unmount();
  });
});
