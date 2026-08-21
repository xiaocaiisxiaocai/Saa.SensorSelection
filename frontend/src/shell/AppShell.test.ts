import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import {
  createMemoryHistory,
  createRouter,
} from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import AppShell from './AppShell.vue';

async function mountShell() {
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
    const { wrapper } = await mountShell();
    const toggle = () => wrapper.get('[aria-controls="app-sidebar"]');

    expect(toggle().attributes('aria-expanded')).toBe('true');
    expect(toggle().attributes('aria-label')).toBe('折叠侧栏');

    await toggle().trigger('click');

    expect(toggle().attributes('aria-expanded')).toBe('false');
    expect(toggle().attributes('aria-label')).toBe('展开侧栏');
    wrapper.unmount();
  });
});
