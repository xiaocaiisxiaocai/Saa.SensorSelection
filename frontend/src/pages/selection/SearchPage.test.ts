import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import { activeTabText, tabCount } from '@/test-helpers';

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
    expect(activeTabText(wrapper)).toMatch(/^全部/);
    expect(Number(tabCount(wrapper, '全部'))).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it('shows the category and detail on one line without repeating the category', async () => {
    const { wrapper } = await mountSearch('客户');
    const cards = wrapper.findAll('.search-list__item');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      // 只有一行说明，不再单独渲染第二段
      expect(card.findAll('.search-list__sub')).toHaveLength(1);
      const segments = card
        .get('.search-list__sub')
        .text()
        .split(' · ')
        .map((segment) => segment.trim());
      const [category, next] = segments;
      expect(next === category || next === `${category}区域`).toBe(false);
    }
    wrapper.unmount();
  });
});
