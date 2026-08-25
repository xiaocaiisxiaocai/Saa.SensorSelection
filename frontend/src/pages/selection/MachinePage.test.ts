import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import { useAuthStore } from '@/stores/auth';
import MachinePage from './MachinePage.vue';

async function mountPage(authenticated = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/selection/machine', component: MachinePage }],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  if (authenticated) {
    useAuthStore().applyProfile({
      displayName: '只读用户',
      orgUnit: null,
      permissions: ['selection:read'],
      roles: [{ code: 'viewer', id: 2, name: '只读用户' }],
      username: 'viewer',
    });
  }
  await router.push('/selection/machine');
  await router.isReady();
  return mount(MachinePage, { global: { plugins: [pinia, router] } });
}

describe('MachinePage', () => {
  it('hides every report operation when not signed in', async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).not.toContain('生成并下载报告');
    expect(wrapper.text()).not.toContain('预览 / 打印 PDF');
    expect(wrapper.text()).not.toContain('全选机型');
    expect(wrapper.find('[aria-label^="选择"]').exists()).toBe(false);
    expect(wrapper.text()).toMatch(/中间翻板机|分类/);
    wrapper.unmount();
  });

  it('shows report operations to an authenticated read-only user', async () => {
    const wrapper = await mountPage(true);
    expect(wrapper.text()).toContain('生成并下载报告');
    expect(wrapper.text()).toContain('预览 / 打印 PDF');
    expect(wrapper.text()).toContain('全选机型');
    expect(wrapper.find('[aria-label^="选择"]').exists()).toBe(true);
    expect(wrapper.text()).toMatch(/中间翻板机|分类/);
    wrapper.unmount();
  });

  it('keeps structure labels compact and gives specifications more room', async () => {
    const wrapper = await mountPage();
    const headers = wrapper.findAll('.a-table thead th');

    expect(headers[0]?.attributes('style')).toContain('width: 100px');
    expect(headers[1]?.attributes('style')).toContain('width: 110px');
    expect(headers[2]?.attributes('style')).toContain('width: 260px');

    wrapper.unmount();
  });
});
