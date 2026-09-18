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
  return {
    router,
    wrapper: mount(SearchPage, { global: { plugins: [pinia, router] } }),
  };
}

describe('SearchPage', () => {
  it('filters results by type and keeps the query in the heading', async () => {
    const { wrapper } = await mountSearch('庆鼎');
    expect(wrapper.text()).toContain('搜索“庆鼎”');
    expect(wrapper.text()).toContain('客户');
    expect(wrapper.find('mark').text()).toBe('庆鼎');
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toMatch(
      /全部\d+/,
    );
    wrapper.unmount();
  });

  it('does not repeat the category line at the start of the detail line', async () => {
    const { wrapper } = await mountSearch('客户');
    const cards = wrapper.findAll('.search-list button');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const meta = card.find('.search-list__meta').text().trim();
      const sub = card.find('.search-list__sub');
      if (!sub.exists() || !meta) continue;
      const first = sub.text().split(' · ')[0]?.trim();
      expect(first === meta || first === `${meta}区域`).toBe(false);
    }
    wrapper.unmount();
  });
});
