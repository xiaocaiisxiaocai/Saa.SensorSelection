import { flushPromises, mount } from '@vue/test-utils';
import { h } from 'vue';
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  type RouteLocationNormalized,
} from 'vue-router';
import { describe, expect, it } from 'vitest';

import { clickTab } from '@/test-helpers';
import RouteTabs from './RouteTabs.vue';

const TABS = [
  { label: '客户', path: '/section/customer' },
  { label: '制程', path: '/section/process' },
];

// 子页面只显示自己的完整地址，便于断言渲染了哪一页、带着什么 query
const Child = (props: { fullPath: string }) =>
  h('p', { class: 'child' }, props.fullPath);
Child.props = ['fullPath'];
const childProps = (route: RouteLocationNormalized) => ({
  fullPath: route.fullPath,
});

async function mountTabs(initial: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/section',
        component: RouteTabs,
        props: { tabs: TABS },
        children: [
          { path: 'customer', component: Child, props: childProps },
          { path: 'process', component: Child, props: childProps },
        ],
      },
    ],
  });
  await router.push(initial);
  await router.isReady();
  // 根部的 RouterView 渲染父路由（Host → RouteTabs），RouteTabs 里再渲染子路由
  const wrapper = mount(
    { render: () => h(RouterView) },
    { global: { plugins: [router] } },
  );
  await flushPromises();
  return { router, wrapper };
}

const activeLabel = (
  wrapper: Awaited<ReturnType<typeof mountTabs>>['wrapper'],
) => wrapper.get('.ant-tabs-tab-active').text();

describe('RouteTabs', () => {
  it('selects the tab of the current child route and renders it inside the panel', async () => {
    const { wrapper } = await mountTabs('/section/process?tab=steps');
    expect(activeLabel(wrapper)).toBe('制程');
    const panel = wrapper.get('[role="tabpanel"]:not([aria-hidden="true"])');
    expect(panel.get('.child').text()).toBe('/section/process?tab=steps');
    expect(wrapper.findAll('.child')).toHaveLength(1);
    wrapper.unmount();
  });

  it('returns to where each tab was left when switching back', async () => {
    const { router, wrapper } = await mountTabs(
      '/section/customer?category=庆鼎&item=华东',
    );

    await clickTab(wrapper, '制程');
    expect(router.currentRoute.value.path).toBe('/section/process');
    await router.push('/section/process?tab=steps');
    await flushPromises();

    await clickTab(wrapper, '客户');
    expect(router.currentRoute.value.query).toEqual({
      category: '庆鼎',
      item: '华东',
    });
    expect(activeLabel(wrapper)).toBe('客户');

    await clickTab(wrapper, '制程');
    expect(router.currentRoute.value.fullPath).toBe(
      '/section/process?tab=steps',
    );
    wrapper.unmount();
  });

  it('does not navigate when the active tab is clicked again', async () => {
    const { router, wrapper } = await mountTabs('/section/customer?item=a');
    await clickTab(wrapper, '客户');
    expect(router.currentRoute.value.fullPath).toBe('/section/customer?item=a');
    wrapper.unmount();
  });
});
