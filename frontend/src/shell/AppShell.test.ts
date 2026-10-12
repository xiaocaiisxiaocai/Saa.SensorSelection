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

  it('keeps the desktop sidebar fixed, without a collapse toggle or icons', async () => {
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
    const sider = wrapper.get('.app-shell__sider');

    expect(sider.classes()).not.toContain('ant-layout-sider-collapsed');
    expect(wrapper.find('[aria-controls="app-sidebar"]').exists()).toBe(false);
    expect(wrapper.find('.ant-layout-sider-trigger').exists()).toBe(false);
    expect(sider.findAll('.ant-menu-item').length).toBeGreaterThan(0);
    expect(sider.find('.ant-menu-item svg').exists()).toBe(false);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('has no keyboard shortcut for global search', async () => {
    const { wrapper } = await mountShell();
    const input = document.getElementById('global-search-input');
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input);
    expect(wrapper.find('kbd').exists()).toBe(false);
    wrapper.unmount();
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
