import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { formSelects } from '@/test-helpers';
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
    expect(wrapper.find('.ant-table-wrapper').exists()).toBe(true);
    expect(wrapper.text()).toContain('制造事业部');
    expect(wrapper.text()).toContain('选型课');
    expect(wrapper.text()).toContain('事业部');
    expect(wrapper.text()).toContain('课别');

    const names = wrapper.findAll('.org-tree__name');
    expect(names[0]?.text()).toBe('制造事业部');
    expect(names[1]?.text()).toBe('选型课');
    expect(names[0]?.attributes('style')).toContain('--org-depth: 0');
    expect(names[1]?.attributes('style')).toContain('--org-depth: 1');
    // 已展平成缩进行，不能再出现树形表格的展开按钮
    expect(wrapper.find('.ant-table-row-expand-icon').exists()).toBe(false);
    wrapper.unmount();
  });

  it('disables adding a child under a section, since 课别 is the last level', async () => {
    const wrapper = await mountPage();
    const addChild = wrapper.findAll('[aria-label="新建子节点"]');
    expect(addChild[0]?.attributes('disabled')).toBeUndefined();
    expect(addChild[1]?.attributes('disabled')).toBeDefined();
    await addChild[1]?.trigger('click');
    await nextTick();
    expect(document.querySelector('.ant-modal')).toBeNull();
    wrapper.unmount();
  });

  it('shows the level derived from the parent and hides the sort order when creating', async () => {
    const wrapper = await mountPage();
    await wrapper.findAll('[aria-label="新建子节点"]')[0]?.trigger('click');
    await nextTick();

    // 不能跳级：事业部下只能是部门，不给选
    expect(formSelects(wrapper)).toHaveLength(0);
    expect(
      document.querySelector('.ant-modal .ant-tag')?.textContent?.trim(),
    ).toBe('部门');
    // 排序自动排在最后，新建时不显示
    expect(document.querySelector('#org-sort-order')).toBeNull();

    const createOrgUnit = vi
      .spyOn(api, 'createOrgUnit')
      .mockResolvedValue({} as never);
    const name = wrapper.findComponent({ name: 'AInput' });
    await name.vm.$emit('update:value', '标准件组');
    await nextTick();
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '保存')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() =>
      expect(createOrgUnit).toHaveBeenCalledWith({
        level: '部门',
        name: '标准件组',
        parentId: 1,
        sortOrder: 2,
      }),
    );
    wrapper.unmount();
  });

  it('keeps the sort order editable when editing', async () => {
    const wrapper = await mountPage();
    await wrapper.findAll('[aria-label="编辑"]')[0]?.trigger('click');
    await nextTick();

    expect(document.querySelector('#org-sort-order')).not.toBeNull();
    expect(
      document.querySelector('.ant-modal .ant-tag')?.textContent?.trim(),
    ).toBe('事业部');
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
      document
        .querySelector('.ant-form-item-explain-error')
        ?.textContent?.trim(),
    ).toBe('请输入组织名称');
    wrapper.unmount();
  });
});
