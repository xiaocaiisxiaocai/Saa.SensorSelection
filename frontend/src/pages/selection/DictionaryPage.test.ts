import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import type { UserProfile } from '@/api';
import { useAuthStore } from '@/stores/auth';

import DictionaryPage from './DictionaryPage.vue';

const dictionaryCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'DictionaryPage.css'),
  'utf8',
);

describe('DictionaryPage', () => {
  it('lists only business dictionaries and excludes machine tabs', async () => {
    setActivePinia(createPinia());
    const wrapper = mount(DictionaryPage);
    const tabs = wrapper.findAll('.ant-segmented-item');
    expect(tabs).toHaveLength(10);
    expect(wrapper.text()).toContain('要求分类');
    expect(wrapper.text()).toContain('机型');
    expect(wrapper.text()).toContain('板件特性');
    expect(wrapper.text()).toContain('输送段');
    expect(wrapper.text()).not.toContain('机型结构 Tab');
    expect(wrapper.text()).not.toContain('客户通用要求中的分类，全局共用');

    await tabs[9]?.get('input').trigger('change');
    expect(wrapper.text()).toContain('漫反射');
    expect(wrapper.text()).not.toContain('Sensor型号中的感应器类型，全局共用');
    expect(wrapper.find('button[aria-label="导出 Excel"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('button[aria-label="导入 Excel"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });

  it('shows export with data:transfer and import only when writing is allowed too', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const profile = (permissions: string[]): UserProfile => ({
      displayName: '导入导出',
      orgUnit: null,
      permissions,
      roles: [],
      username: 'transfer',
    });
    useAuthStore(pinia).applyProfile(profile(['data:transfer']));
    const transferOnly = mount(DictionaryPage, {
      global: { plugins: [pinia] },
    });
    expect(transferOnly.find('button[aria-label="导出 Excel"]').exists()).toBe(
      true,
    );
    expect(transferOnly.find('button[aria-label="导入 Excel"]').exists()).toBe(
      false,
    );
    transferOnly.unmount();

    useAuthStore(pinia).applyProfile(
      profile(['data:transfer', 'selection:write']),
    );
    const both = mount(DictionaryPage, { global: { plugins: [pinia] } });
    expect(both.find('button[aria-label="导入 Excel"]').exists()).toBe(true);
    expect(both.text()).toContain('新增');
    both.unmount();
  });

  it('keeps the add action on the right and lets the header wrap', () => {
    expect(dictionaryCss).toMatch(
      /\.dictionary-header\s*\{[^}]*flex-wrap:\s*wrap;[^}]*justify-content:\s*space-between;/,
    );
  });
});
