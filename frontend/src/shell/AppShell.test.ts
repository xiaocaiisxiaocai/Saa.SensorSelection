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
  localStorage.removeItem('apple-frontend:sidebar-collapsed');

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
    localStorage.removeItem('apple-frontend:sidebar-collapsed');
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

  it('focuses the global search input from the full pill surface', async () => {
    const { wrapper } = await mountShell();
    const input = wrapper.get('input[aria-label="全局搜索"]');

    await wrapper.get('form.search').trigger('mousedown');
    expect(document.activeElement).toBe(input.element);

    wrapper.unmount();
  });

  it('updates the desktop sidebar toggle label and expanded state', async () => {
    const { wrapper } = await mountShell();
    const toggle = () => wrapper.get('[aria-controls="app-sidebar"]');

    expect(toggle().attributes('aria-expanded')).toBe('true');
    expect(toggle().attributes('aria-label')).toBe('折叠侧栏');

    await toggle().trigger('click');

    expect(toggle().attributes('aria-expanded')).toBe('false');
    expect(toggle().attributes('aria-label')).toBe('展开侧栏');
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
    expect(wrapper.classes()).toContain('app-shell--compact');
    expect(toggle().attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.sidebar-backdrop').exists()).toBe(false);

    await toggle().trigger('click');
    expect(toggle().attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('.sidebar-backdrop').exists()).toBe(true);

    await wrapper.get('.sidebar-backdrop').trigger('click');
    expect(toggle().attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('silently uses local data when the backend is offline', async () => {
    const { wrapper } = await mountShell('offline');

    expect(wrapper.text()).not.toContain('后端服务不可用');
    expect(wrapper.text()).not.toContain('重新连接');

    wrapper.unmount();
  });
});
