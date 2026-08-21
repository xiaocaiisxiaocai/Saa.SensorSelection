import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import MachinePage from './MachinePage.vue';

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/selection/machine', component: MachinePage }],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  await router.push('/selection/machine');
  await router.isReady();
  return mount(MachinePage, { global: { plugins: [pinia, router] } });
}

describe('MachinePage', () => {
  it('shows the report toolbar and a seeded machine', async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain('生成并下载报告');
    expect(wrapper.text()).toContain('全选机型');
    expect(wrapper.text()).toMatch(/中间翻板机|分类/);
    wrapper.unmount();
  });
});
