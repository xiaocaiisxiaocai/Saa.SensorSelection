import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import { routes } from './index';

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes });
}

describe('客户/制程 routes', () => {
  it('keeps the customer and process URLs and nests both under one tabbed page', async () => {
    const router = makeRouter();
    for (const path of ['/selection/customer', '/selection/process']) {
      const resolved = router.resolve(path);
      expect(resolved.path).toBe(path);
      // 父路由是共享的「客户/制程」Tab 页，子路由是各自的页面
      expect(resolved.matched).toHaveLength(2);
      expect(resolved.matched[0]?.name).toBe('customer-process');
    }
  });

  it('keeps query strings so search results and bookmarks still land on the same item', async () => {
    const router = makeRouter();
    await router.push('/selection/customer?category=庆鼎&item=华东');
    expect(router.currentRoute.value.query).toEqual({
      category: '庆鼎',
      item: '华东',
    });
    await router.push('/selection/process?tab=steps&q=AOI');
    expect(router.currentRoute.value.path).toBe('/selection/process');
    expect(router.currentRoute.value.query).toEqual({ tab: 'steps', q: 'AOI' });
  });

  it('redirects the bare section path to the customer tab', async () => {
    const router = makeRouter();
    await router.push('/selection');
    expect(router.currentRoute.value.path).toBe('/selection/customer');
  });

  it('does not swallow the other selection pages', () => {
    const router = makeRouter();
    for (const path of [
      '/selection/machine',
      '/selection/sensor',
      '/selection/dictionary',
      '/selection/search',
    ]) {
      const resolved = router.resolve(path);
      expect(resolved.matched).toHaveLength(1);
      expect(resolved.matched[0]?.path).toBe(path);
    }
  });
});
