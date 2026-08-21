import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import CustomerPage from './CustomerPage.vue';

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/selection/customer', component: CustomerPage }],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  await router.push('/selection/customer');
  await router.isReady();
  return mount(CustomerPage, { global: { plugins: [pinia, router] } });
}

describe('CustomerPage', () => {
  it('shows the four customer tabs and a seeded customer', async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain('客户通用要求');
    expect(wrapper.text()).toContain('制程注意事项');
    expect(wrapper.text()).toContain('感应器选用标准');
    expect(wrapper.text()).toContain('厂外反馈问题项');
    expect(wrapper.text()).toMatch(/庆鼎|区域/);
    wrapper.unmount();
  });
});
