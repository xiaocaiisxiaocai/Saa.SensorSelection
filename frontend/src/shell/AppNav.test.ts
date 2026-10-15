import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import { useAuthStore } from '@/stores/auth';
import AppNav from './AppNav.vue';

async function mountNav(
  permissions: string[] | null,
  path = '/selection/dictionary',
) {
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
  await router.push(path);
  await router.isReady();
  return mount(AppNav, { global: { plugins: [pinia, router] } });
}

const groupTitles = (wrapper: Awaited<ReturnType<typeof mountNav>>) =>
  wrapper.findAll('.ant-menu-item-group-title').map((t) => t.text());

describe('AppNav', () => {
  it('hides the group heading when there is only one group', async () => {
    const wrapper = await mountNav(null);

    expect(groupTitles(wrapper)).toEqual([]);
    // 游客没有任何权限：不显示数据字典
    expect(
      wrapper.findAll('.ant-menu-item').map((item) => item.text()),
    ).toEqual(['客户/制程', '机型结构', 'Sensor型号']);
  });

  it('labels groups without repeating the brand name', async () => {
    const wrapper = await mountNav([
      'selection:read',
      'rbac:view',
      'audit:view',
    ]);

    expect(groupTitles(wrapper)).toEqual(['选型数据', '系统管理']);
    expect(wrapper.get('.app-nav__name').text()).toBe('感应器选型');
    expect(wrapper.findAll('.ant-menu-item')).toHaveLength(8);
  });

  it('marks only the current page as selected and shows no icons', async () => {
    const wrapper = await mountNav(['selection:read']);
    const selected = wrapper.findAll('.ant-menu-item-selected');

    expect(selected.map((item) => item.text())).toEqual(['数据字典']);
    expect(wrapper.find('.ant-menu-item svg').exists()).toBe(false);
  });

  it('merges customer and process into one menu item selected on both tabs', async () => {
    for (const path of [
      '/selection/customer',
      '/selection/process',
      '/selection/customer?category=庆鼎&item=华东',
    ]) {
      const wrapper = await mountNav(null, path);
      const labels = wrapper
        .findAll('.ant-menu-item')
        .map((item) => item.text());
      expect(labels).toContain('客户/制程');
      expect(labels).not.toContain('客户管理');
      expect(labels).not.toContain('制程管理');
      expect(
        wrapper.findAll('.ant-menu-item-selected').map((item) => item.text()),
      ).toEqual(['客户/制程']);
      wrapper.unmount();
    }
  });
});
