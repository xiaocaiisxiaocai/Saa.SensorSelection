import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import SensorPage from './SensorPage.vue';

async function mountPage(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/selection/sensor', component: SensorPage }],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  await router.push({ path: '/selection/sensor', query });
  await router.isReady();
  return mount(SensorPage, { global: { plugins: [pinia, router] } });
}

describe('SensorPage', () => {
  it('shows status tabs including SOP and 全部', async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain('SOP');
    expect(wrapper.text()).toContain('现用');
    expect(wrapper.text()).toContain('全部');
    expect(wrapper.text()).toContain('感应器类型');
    wrapper.unmount();
  });
});
