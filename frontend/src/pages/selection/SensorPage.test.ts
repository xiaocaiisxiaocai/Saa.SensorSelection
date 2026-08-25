import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import type { UserProfile } from '@/api';
import { useAuthStore } from '@/stores/auth';
import ASelect from '@/ui/ASelect.vue';
import SensorPage from './SensorPage.vue';

const writer: UserProfile = {
  username: 'admin',
  displayName: '管理员',
  roles: [],
  permissions: ['selection:write'],
  orgUnit: null,
};

async function mountPage(
  query: Record<string, string> = {},
  profile: UserProfile | null = null,
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/selection/sensor', component: SensorPage }],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore(pinia).applyProfile(profile);
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

  it('does not use same-type priority when replacing a sensor', async () => {
    const wrapper = await mountPage({ tab: '备选' }, writer);

    await wrapper.get('[aria-label="替换现用"]').trigger('click');
    await nextTick();

    const sameTypeSelect = wrapper
      .findAllComponents(ASelect)
      .find(
        (component) =>
          component.props('placeholder') === '同类型优先，也可选其他现用',
      );
    expect(sameTypeSelect).toBeUndefined();

    wrapper.unmount();
  });
});
