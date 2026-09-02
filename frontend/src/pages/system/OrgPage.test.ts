import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import ASelect from '@/ui/ASelect.vue';
import OrgPage from './OrgPage.vue';

async function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().applyProfile({
    displayName: '管理员',
    orgUnit: null,
    permissions: ['rbac:org:write'],
    roles: [{ code: 'admin', id: 1, name: '系统管理员' }],
    username: 'admin',
  });
  vi.spyOn(api, 'listOrgUnits').mockResolvedValue([
    {
      childCount: 1,
      id: 1,
      level: '事业部',
      name: '制造事业部',
      parentId: null,
      sortOrder: 1,
      userCount: 0,
    },
    {
      childCount: 0,
      id: 2,
      level: '课别',
      name: '选型课',
      parentId: 1,
      sortOrder: 1,
      userCount: 1,
    },
  ]);
  const wrapper = mount(OrgPage, {
    attachTo: document.body,
    global: { plugins: [pinia] },
  });
  await vi.waitFor(() => {
    expect(wrapper.text()).toContain('制造事业部');
  });
  return wrapper;
}

describe('OrgPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('lists organizations in a full-width table with indented children', async () => {
    const wrapper = await mountPage();
    expect(wrapper.find('.a-table').exists()).toBe(true);
    expect(wrapper.text()).toContain('制造事业部');
    expect(wrapper.text()).toContain('选型课');
    expect(wrapper.text()).toContain('事业部');
    expect(wrapper.text()).toContain('课别');

    const names = wrapper.findAll('.org-tree__name');
    expect(names[0]?.text()).toBe('制造事业部');
    expect(names[1]?.text()).toBe('选型课');
    expect(names[1]?.attributes('style')).toContain('padding-inline-start');
    wrapper.unmount();
  });

  it('only offers 课别 when adding a child under a section', async () => {
    const wrapper = await mountPage();
    const addChild = wrapper.findAll('[aria-label="新建子节点"]');
    await addChild[1]?.trigger('click');
    await nextTick();

    const levels = wrapper
      .findAllComponents(ASelect)[0]
      ?.props('options')
      .map((option) => String(option.value));
    expect(levels).toEqual(['课别']);
    wrapper.unmount();
  });

  it('shows a field-level error when the organization name is empty', async () => {
    const wrapper = await mountPage();
    await wrapper.get('button').trigger('click');
    await nextTick();

    const saveButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '保存',
    );
    saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(
      document.querySelector('.a-form-row__error')?.textContent?.trim(),
    ).toBe('请输入组织名称');
    wrapper.unmount();
  });
});
