import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import { useAuthStore } from '@/stores/auth';
import AppNav from './AppNav.vue';

async function mountNav(permissions: string[] | null) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:path(.*)*', component: { template: '<div />' } }],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().applyProfile(
    permissions && {
      displayName: '管理员',
      orgUnit: null,
      permissions,
      roles: [{ code: 'admin', id: 1, name: '系统管理员' }],
      username: 'admin',
    },
  );
  await router.push('/selection/dictionary');
  await router.isReady();
  return mount(AppNav, { global: { plugins: [pinia, router] } });
}

const groupTitles = (wrapper: Awaited<ReturnType<typeof mountNav>>) =>
  wrapper.findAll('.ant-menu-item-group-title').map((t) => t.text());

describe('AppNav', () => {
  it('hides the group heading when there is only one group', async () => {
    const wrapper = await mountNav(null);

    expect(groupTitles(wrapper)).toEqual([]);
    expect(wrapper.findAll('.ant-menu-item')).toHaveLength(5);
  });

  it('labels groups without repeating the brand name', async () => {
    const wrapper = await mountNav(['rbac:view', 'audit:view']);

    expect(groupTitles(wrapper)).toEqual(['选型数据', '系统管理']);
    expect(wrapper.get('.app-nav__name').text()).toBe('感应器选型');
    expect(wrapper.findAll('.ant-menu-item')).toHaveLength(9);
  });

  it('marks only the current page as selected and shows no icons', async () => {
    const wrapper = await mountNav(null);
    const selected = wrapper.findAll('.ant-menu-item-selected');

    expect(selected.map((item) => item.text())).toEqual(['数据字典']);
    expect(wrapper.find('.ant-menu-item svg').exists()).toBe(false);
  });
});
