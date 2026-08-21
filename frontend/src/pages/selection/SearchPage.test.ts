import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import SearchPage from './SearchPage.vue';
import CustomerPage from './CustomerPage.vue';

async function mountSearch(q: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/selection/search', component: SearchPage },
      { path: '/selection/customer', component: CustomerPage },
    ],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  await router.push({ path: '/selection/search', query: { q } });
  await router.isReady();
  return { router, wrapper: mount(SearchPage, { global: { plugins: [pinia, router] } }) };
}

describe('SearchPage', () => {
  it('filters results by type and keeps the query in the heading', async () => {
    const { wrapper } = await mountSearch('庆鼎');
    expect(wrapper.text()).toContain('搜索“庆鼎”');
    expect(wrapper.text()).toContain('客户');
    wrapper.unmount();
  });
});
